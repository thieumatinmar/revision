#!/usr/bin/env python3
"""check.py — les gardes du dépôt.

Un **garde** n'est pas un test : il ne lance aucune ligne de JavaScript. Il
vérifie des invariants du dépôt — que le code qui part en ligne forme un
ensemble complet, cohérent et correctement étiqueté.

Pourquoi ça existe : l'app n'a ni build, ni bundler, ni compilateur. Personne ne
relit les imports, personne ne vérifie que la liste de préchargement du service
worker suit l'arborescence. Les pannes qui ont réellement coûté du temps ici
n'étaient pas des calculs faux, mais du code correct qui n'arrivait pas au
navigateur — ou qui arrivait sans qu'on puisse le savoir.

Quatre gardes :

  G1  Tout import relatif pointe vers un fichier existant.
  G2  La COQUE de sw.js et l'arborescence se correspondent, dans les deux sens.
  G3  VERSION diffère de celle déjà en ligne.
  G4  Aucune URL de CDN en dur : hors ligne veut dire hors ligne.

Usage :

    python tools/check.py                  # référence = origin/main
    python tools/check.py --ref <commit>   # référence explicite (utilisé en CI)

Sort en 0 si tout va bien, en 1 sinon. Chaque échec dit quoi faire, pas
seulement que ça a échoué — un garde muet finit contourné.
"""

import argparse
import os
import re
import subprocess
import sys

# Racine du dépôt : ce fichier vit dans tools/, la racine est un cran au-dessus.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# --------------------------------------------------------------------------
# Petits utilitaires
# --------------------------------------------------------------------------

def read(rel_path):
    """Lit un fichier du dépôt en UTF-8, à partir d'un chemin relatif à ROOT."""
    with open(os.path.join(ROOT, rel_path), encoding='utf-8') as f:
        return f.read()


def exists(rel_path):
    return os.path.isfile(os.path.join(ROOT, rel_path))


def walk(rel_dir, suffixes):
    """Chemins relatifs (séparateur '/') de tous les fichiers d'un dossier."""
    found = []
    base = os.path.join(ROOT, rel_dir)
    for dirpath, _, filenames in os.walk(base):
        for name in filenames:
            if name.endswith(suffixes):
                full = os.path.join(dirpath, name)
                found.append(os.path.relpath(full, ROOT).replace(os.sep, '/'))
    return sorted(found)


def is_local(spec):
    """Un spécificateur est-il un chemin de notre dépôt, à résoudre sur disque ?

    On écarte le réseau (http…), les données inline, les ancres et les
    spécificateurs nus (`import x from 'lodash'`) — l'app n'en a aucun, mais s'il
    en apparaissait un, il ne se résoudrait pas sur disque de toute façon.
    """
    if not spec:
        return False
    if spec.startswith(('http://', 'https://', '//', 'data:', 'mailto:', '#')):
        return False
    return spec.startswith(('./', '../', '/'))


def resolve(from_file, spec):
    """Résout un chemin relatif depuis le fichier qui le mentionne."""
    spec = spec.split('?')[0].split('#')[0]        # ?v=2 et #ancre ne sont pas du chemin
    if spec.startswith('/'):
        target = spec.lstrip('/')                   # une racine absolue = la racine du site
    else:
        target = os.path.normpath(os.path.join(os.path.dirname(from_file), spec))
    return target.replace(os.sep, '/')


# --------------------------------------------------------------------------
# G1 — les imports pointent vers quelque chose
# --------------------------------------------------------------------------

# Trois formes d'import possibles en modules ES, plus les attributs d'index.html.
IMPORT_PATTERNS = [
    re.compile(r"""\bfrom\s*['"]([^'"]+)['"]"""),          # import { x } from './y.js'
    re.compile(r"""\bimport\s*\(\s*['"]([^'"]+)['"]"""),   # import('./y.js')  — dynamique
    re.compile(r"""^\s*import\s+['"]([^'"]+)['"]""", re.M),  # import './y.js' — effet de bord
]
HTML_REF = re.compile(r"""\b(?:src|href)\s*=\s*["']([^"']+)["']""")


def guard_imports():
    """G1 — chaque chemin relatif mentionné mène à un fichier qui existe."""
    problems = []

    for path in walk('js', ('.js',)) + ['sw.js']:
        source = read(path)
        for pattern in IMPORT_PATTERNS:
            for spec in pattern.findall(source):
                if not is_local(spec):
                    continue
                target = resolve(path, spec)
                if not exists(target):
                    problems.append(
                        f"{path} importe '{spec}' → {target} n'existe pas.\n"
                        f"    Corrige le chemin, ou restaure le fichier renommé/supprimé."
                    )

    source = read('index.html')
    for spec in HTML_REF.findall(source):
        if not is_local(spec):
            continue
        target = resolve('index.html', spec)
        if not exists(target):
            problems.append(
                f"index.html référence '{spec}' → {target} n'existe pas.\n"
                f"    Corrige le chemin dans la balise correspondante."
            )

    return problems


# --------------------------------------------------------------------------
# G2 — la COQUE du service worker suit l'arborescence
# --------------------------------------------------------------------------

COQUE_BLOCK = re.compile(r"const\s+COQUE\s*=\s*\[(.*?)\]\s*;", re.S)
QUOTED = re.compile(r"""['"]([^'"]+)['"]""")


def coque_entries():
    """Les chemins listés dans la COQUE de sw.js, normalisés."""
    block = COQUE_BLOCK.search(read('sw.js'))
    if not block:
        return None
    entries = []
    for raw in QUOTED.findall(block.group(1)):
        # './' désigne la page d'accueil : c'est index.html servi à la racine.
        entries.append('index.html' if raw == './' else raw.lstrip('./') if raw.startswith('./') else raw)
    return entries


def guard_coque():
    """G2 — correspondance dans les deux sens entre la COQUE et les fichiers.

    Sens (i) — un chemin listé qui n'existe pas est le pire cas du fichier :
    `cache.addAll()` est **atomique**, un seul 404 fait rejeter la promesse
    entière, `install` échoue et il ne reste **aucun** hors-ligne. Or l'app
    continue de marcher parfaitement en ligne : la panne est invisible jusqu'au
    jour où le réseau manque.

    Sens (ii) — un fichier absent de la COQUE n'est caché qu'après avoir été
    téléchargé une fois (reseauDAbord met en cache ce qu'il obtient). Un écran
    jamais ouvert en ligne n'est donc jamais caché : il meurt hors ligne.
    """
    problems = []
    entries = coque_entries()

    if entries is None:
        return ["sw.js : impossible de retrouver `const COQUE = [ … ];`.\n"
                "    Le garde G2 ne peut plus rien vérifier — vérifie la forme de la déclaration."]

    for entry in entries:
        if entry.startswith('vendor/'):
            continue  # les fichiers vendorisés sont vérifiés tels quels ci-dessous aussi
        if not exists(entry):
            problems.append(
                f"sw.js liste '{entry}' dans COQUE, mais le fichier n'existe pas.\n"
                f"    addAll() est atomique : ce seul 404 supprime TOUT le cache hors ligne.\n"
                f"    Retire la ligne, ou corrige le chemin."
            )

    for entry in entries:
        if entry.startswith('vendor/') and not exists(entry):
            problems.append(
                f"sw.js liste '{entry}' dans COQUE, mais le fichier vendorisé n'existe pas.\n"
                f"    Même conséquence : addAll() rejette et le hors-ligne disparaît entièrement."
            )

    # Ce qui doit impérativement y figurer : la coque de l'app elle-même.
    required = walk('js', ('.js',)) + walk('css', ('.css',)) + ['index.html', 'manifest.webmanifest']
    listed = set(entries)
    for path in required:
        if path not in listed:
            problems.append(
                f"{path} n'est pas dans la COQUE de sw.js.\n"
                f"    Hors ligne, un écran jamais ouvert auparavant ne se chargera pas.\n"
                f"    Ajoute '{path}' à la liste COQUE (sw.js)."
            )

    return problems


# --------------------------------------------------------------------------
# G3 — la version a bougé
# --------------------------------------------------------------------------

VERSION_RE = re.compile(r"""VERSION\s*=\s*['"]([^'"]+)['"]""")


def guard_version(ref):
    """G3 — VERSION diffère de celle du commit de référence.

    La référence est ce que le déploiement va **remplacer** (`origin/main` en
    local, le commit d'avant le push en CI). On compare l'égalité, pas l'ordre :
    imposer un ordre obligerait à figer un format de version, alors que le seul
    cas réel est l'oubli pur et simple.

    Si la référence est introuvable (premier clone, `workflow_dispatch`), le
    garde s'annule avec un avertissement plutôt que d'échouer à tort.
    """
    current = VERSION_RE.search(read('js/version.js'))
    if not current:
        return ["js/version.js : impossible de lire `VERSION`. Vérifie la déclaration."]

    if not ref:
        skip('G3', "G3 : aucune référence de comparaison fournie.")
        return []

    try:
        previous_source = subprocess.run(
            ['git', 'show', f'{ref}:js/version.js'],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        skip('G3', f"G3 : '{ref}:js/version.js' est introuvable "
                   f"(dépôt fraîchement cloné, ou `git fetch` à faire).")
        return []

    previous = VERSION_RE.search(previous_source)
    if not previous:
        skip('G3', f"G3 : pas de `VERSION` lisible dans {ref}.")
        return []

    if previous.group(1) == current.group(1):
        return [
            f"VERSION vaut toujours '{current.group(1)}', identique à {ref}.\n"
            f"    L'app ne saura pas qu'elle est périmée et ne proposera aucun rechargement :\n"
            f"    tu verras l'ancien comportement et tu concluras à tort que c'est cassé.\n"
            f"    Incrémente VERSION dans js/version.js."
        ]

    return []


# --------------------------------------------------------------------------
# G4 — aucune dépendance à un CDN
# --------------------------------------------------------------------------

# Hôtes qui servent des **ressources** (scripts, styles, polices). On ne vise
# pas les points d'API (googleapis.com), qui sont des appels réseau légitimes et
# n'ont rien à voir avec le fait de démarrer hors ligne.
CDN_HOSTS = ('gstatic.com', 'jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'cdn.skypack.dev')


def guard_no_cdn():
    """G4 — rien ne va chercher une ressource ailleurs qu'ici.

    Le piège est asymétrique : une référence CDN oubliée marche parfaitement en
    ligne (le CDN répond), et ne casse que hors ligne — c'est-à-dire dans le
    métro, là où l'app devait justement servir.
    """
    problems = []
    files = (walk('js', ('.js',)) + walk('css', ('.css',))
             + walk('vendor', ('.js', '.css')) + ['index.html', 'sw.js'])

    for path in files:
        source = read(path)
        for number, line in enumerate(source.splitlines(), start=1):
            for host in CDN_HOSTS:
                if host in line:
                    problems.append(
                        f"{path}:{number} référence le CDN '{host}'.\n"
                        f"    L'app marchera en ligne et mourra hors ligne.\n"
                        f"    Vendorise la ressource et remplace l'URL par un chemin relatif."
                    )
    return problems


# --------------------------------------------------------------------------
# Exécution
# --------------------------------------------------------------------------

WARNINGS = []
SKIPPED = set()


def warn(message):
    WARNINGS.append(message)


def skip(guard, message):
    """Neutralise un garde faute de pouvoir le vérifier — sans faire croire qu'il passe."""
    SKIPPED.add(guard)
    warn(message)


def main():
    # La console Windows est en cp1252 par défaut : sans ça, la première flèche
    # d'un message d'erreur fait planter le script au lieu d'afficher l'erreur.
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

    parser = argparse.ArgumentParser(description="Gardes du dépôt app_revision.")
    parser.add_argument('--ref', default='origin/main',
                        help="Commit de référence pour le garde de version (défaut : origin/main).")
    args = parser.parse_args()

    guards = [
        ('G1  imports résolus', guard_imports()),
        ('G2  COQUE <-> arborescence', guard_coque()),
        ('G3  VERSION incrémentée', guard_version(args.ref)),
        ('G4  aucun CDN en dur', guard_no_cdn()),
    ]

    failed = 0
    for name, problems in guards:
        if problems:
            failed += 1
            print(f"\n[ÉCHEC] {name}")
            for problem in problems:
                print(f"  - {problem}")
        elif name.split()[0] in SKIPPED:
            # Un garde neutralisé n'est pas un garde qui passe : le dire.
            print(f"[--]    {name}  (non vérifié)")
        else:
            print(f"[ok]    {name}")

    for message in WARNINGS:
        print(f"[!]     {message}")

    if failed:
        print(f"\n{failed} garde(s) en échec. Rien n'est parti en ligne.")
        return 1

    print("\nTous les gardes passent.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
