#!/usr/bin/env python3
"""interro.py — distribue la banque de questions sur le calendrier.

La **banque** contient toutes les questions des interros jusqu'à la fin des
écrits, générées une fois par Claude, un fichier par thème
(`../perso/interro/banque/*.txt`, dans le projet parent). Ce script les
**distribue** : il donne à chaque jour son interro, et les écrit toutes d'un
coup dans Firestore. Voir docs/decisions.md, « Interro du jour ».

Il parle à Firestore avec un **compte de service** : une clé admin, qui passe
outre les règles de sécurité. C'est pour ça qu'elle ne vit pas ici mais dans
`~/.config/agreg-revision/` — le dossier du projet est synchronisé sur Google
Drive, et le dépôt est public.

    ~/.config/agreg-revision/
        service-account.json    la clé (console Firebase → Comptes de service)
        config.json             { "uid": ... }, écrit par `init`
        subscription.sha256     empreinte du dernier abonnement recopié

Commandes :

    python tools/interro.py init                # une fois : trouve l'uid
    python tools/interro.py demand              # combien de questions par thème
    python tools/interro.py plan --dry-run      # la distribution, sans rien écrire
    python tools/interro.py plan                # … puis pour de bon
    python tools/interro.py sync-subscription   # abonnement push → secret GitHub

**Format d'un fichier de banque** — le texte délimité de l'app (docs/decisions.md,
« Saisie en lot : jamais JSON ») : `@@ <type>` ouvre un enregistrement,
`@ <champ>` ouvre un champ, tout le reste est du contenu pris tel quel — le
LaTeX s'écrit donc comme dans l'éditeur, sans échapper un seul antislash.

    @@ theme
    @ nom
    Groupes
    @ famille
    algebre                 (ou analyse)
    @ debut
    2026-10-12              (première séance au planning de la prépa)
    @ perimetre
    Ce que le thème couvre, en clair — pour relire.

    @@ question
    @ id
    groupes-007             (unique dans toute la banque, ne change jamais)
    @ nature
    piege                   (ou base, ou demonstration)
    @ question
    …
    @ reponse
    …

Les lignes avant le premier `@@` sont ignorées : place libre pour un commentaire.

Règles de distribution, jour après jour :

    question 1   énoncé piégeux, thème d'analyse
    question 2   énoncé piégeux, thème quelconque
    question 3   question de base, thème d'algèbre
    question 4   question de base, thème d'analyse
    question 5   démonstration, analyse et algèbre en alternance

Seuls les thèmes **entamés** ce jour-là concourent (date de début atteinte),
cinq thèmes distincts dès que c'est possible, et le thème interrogé il y a le
plus longtemps passe d'abord. Tout est déterministe : relancer donne la même
distribution.

Dépendances : google-auth et requests (`pip install google-auth requests`).
"""

import argparse
import collections
import datetime
import hashlib
import json
import pathlib
import random
import re
import subprocess
import sys

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

ROOT = pathlib.Path(__file__).resolve().parent.parent
BANK_DIR = ROOT.parent / 'perso' / 'interro' / 'banque'

CONFIG_DIR = pathlib.Path.home() / '.config' / 'agreg-revision'
KEY_FILE = CONFIG_DIR / 'service-account.json'
CONFIG_FILE = CONFIG_DIR / 'config.json'
SUB_HASH_FILE = CONFIG_DIR / 'subscription.sha256'

REPO = 'thieumatinmar/revision'
UNTIL = '2027-03-05'          # fin de la fenêtre des écrits 2027

NATURES = ('piege', 'base', 'demonstration')
FAMILIES = ('analyse', 'algebre')
DAY_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def fail(message):
    """Sort en erreur avec un message qui dit quoi faire."""
    print(f'interro.py : {message}', file=sys.stderr)
    sys.exit(1)


# --------------------------------------------------------------------------
# La banque : lecture du texte délimité
# --------------------------------------------------------------------------

Theme = collections.namedtuple('Theme', 'name family start scope')
Question = collections.namedtuple('Question', 'id theme nature question answer')


def parse_records(text, path):
    """Texte délimité → liste de (type, {champ: valeur}).

    Un champ garde ses lignes telles quelles ; seules les lignes vides au début
    et à la fin sont retirées — celles qui séparent les enregistrements.
    """
    records, record, field = [], None, None
    for number, line in enumerate(text.splitlines(), start=1):
        if line.startswith('@@'):
            record = (line[2:].strip(), {})
            records.append(record)
            field = None
        elif line.startswith('@'):
            if record is None:
                fail(f'{path}:{number} : champ hors de tout enregistrement.')
            field = line[1:].strip()
            if field in record[1]:
                fail(f'{path}:{number} : champ « {field} » en double.')
            record[1][field] = []
        elif record is not None:
            if field is None:
                if line.strip():
                    fail(f'{path}:{number} : texte avant le premier champ de l’enregistrement.')
                continue
            record[1][field].append(line)
        # Avant le premier @@ : commentaire libre, ignoré.
    return [(kind, {k: '\n'.join(v).strip('\n').strip() for k, v in fields.items()})
            for kind, fields in records]


def load_bank(bank_dir):
    """Lit tous les fichiers de banque ; refuse tout ce qui est mal formé."""
    files = sorted(pathlib.Path(bank_dir).glob('*.txt'))
    if not files:
        fail(f'aucun fichier de banque dans {bank_dir}')
    themes, questions, ids = [], [], set()
    for path in files:
        records = parse_records(path.read_text(encoding='utf-8'), path.name)
        if not records or records[0][0] != 'theme':
            fail(f'{path.name} : le premier enregistrement doit être « @@ theme ».')
        t = records[0][1]
        for field in ('nom', 'famille', 'debut'):
            if not t.get(field):
                fail(f'{path.name} : thème sans « {field} ».')
        if t['famille'] not in FAMILIES:
            fail(f'{path.name} : famille « {t["famille"]} » inconnue ({", ".join(FAMILIES)}).')
        if not DAY_RE.match(t['debut']):
            fail(f'{path.name} : début « {t["debut"]} » au lieu de AAAA-MM-JJ.')
        theme = Theme(t['nom'], t['famille'], t['debut'], t.get('perimetre', ''))
        if any(x.name == theme.name for x in themes):
            fail(f'{path.name} : thème « {theme.name} » déjà défini ailleurs.')
        themes.append(theme)

        for kind, q in records[1:]:
            where = f'{path.name}, {q.get("id", "?")}'
            if kind != 'question':
                fail(f'{where} : enregistrement « @@ {kind} » inattendu.')
            for field in ('id', 'nature', 'question', 'reponse'):
                if not q.get(field):
                    fail(f'{where} : champ « {field} » absent ou vide.')
            if q['nature'] not in NATURES:
                fail(f'{where} : nature « {q["nature"]} » inconnue ({", ".join(NATURES)}).')
            if q['id'] in ids:
                fail(f'{where} : id en double dans la banque.')
            ids.add(q['id'])
            questions.append(Question(q['id'], theme.name, q['nature'], q['question'], q['reponse']))
    return themes, questions


# --------------------------------------------------------------------------
# La distribution
# --------------------------------------------------------------------------

def slots_for(day):
    """Les cinq places d'une interro : (nature, famille imposée ou None)."""
    demo_family = 'algebre' if day.toordinal() % 2 else 'analyse'
    return [('piege', 'analyse'), ('piege', None),
            ('base', 'algebre'), ('base', 'analyse'),
            ('demonstration', demo_family)]


def distribute(themes, pools, days, last_used, infinite=False):
    """Donne à chaque jour ses cinq questions.

    `pools[(thème, nature)]` : les questions disponibles, dans l'ordre où les
    servir. `last_used[thème]` et `last_used[(thème, nature)]` : derniers jours
    interrogés (pour la rotation), complétés au fil de la distribution. Avec
    `infinite`, les réserves ne s'épuisent pas — c'est ce qui mesure la demande.

    Renvoie {jour: [Question ou (thème, nature)]}.
    """
    never = datetime.date.min
    plan = {}
    for day in days:
        iso = day.isoformat()
        started = [t for t in themes if t.start <= iso]
        chosen, picks = set(), []
        for nature, family in slots_for(day):
            def candidates(distinct, fam):
                return [t for t in started
                        if (fam is None or t.family == fam)
                        and (infinite or pools[(t.name, nature)])
                        and not (distinct and t.name in chosen)]
            # Assouplir dans cet ordre : d'abord accepter un thème déjà pris ce
            # jour, puis renoncer à la famille imposée.
            cands = candidates(True, family) or candidates(False, family) \
                or candidates(True, None) or candidates(False, None)
            if not cands:
                fail(f'{iso} : plus aucune question de nature « {nature} » dans les thèmes '
                     f'entamés. Complète la banque (lance `demand` pour voir où).')
            # Chaque nature tourne pour son compte : sans ça, l'ordre fixe des
            # places alignait toujours les mêmes thèmes sur les mêmes natures
            # (un thème n'avait que des démonstrations, un autre aucune). La
            # récence du thème, toutes natures confondues, ne fait que départager.
            best = min(cands, key=lambda t: (last_used.get((t.name, nature), never),
                                             last_used.get(t.name, never),
                                             0 if infinite else -len(pools[(t.name, nature)]),
                                             t.name))
            chosen.add(best.name)
            last_used[(best.name, nature)] = day
            picks.append((best.name, nature) if infinite else pools[(best.name, nature)].pop(0))
        for name in chosen:
            last_used[name] = day
        plan[iso] = picks
    return plan


def day_range(start, end):
    d = start
    while d <= end:
        yield d
        d += datetime.timedelta(days=1)


def parse_day(s, what):
    if not DAY_RE.match(s or ''):
        fail(f'{what} : « {s} » au lieu de AAAA-MM-JJ.')
    return datetime.date.fromisoformat(s)


# --------------------------------------------------------------------------
# Accès à Firestore (API REST)
# --------------------------------------------------------------------------

def session_and_project():
    """Une session HTTP authentifiée par le compte de service, et son projet."""
    if not KEY_FILE.is_file():
        fail(f"clé introuvable : {KEY_FILE}\n"
             "    Console Firebase → Paramètres du projet → Comptes de service →\n"
             "    « Générer une nouvelle clé privée », enregistrée sous ce nom.")
    creds = service_account.Credentials.from_service_account_file(
        str(KEY_FILE), scopes=['https://www.googleapis.com/auth/datastore'])
    return AuthorizedSession(creds), creds.project_id


def documents_url(project):
    return f'https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents'


def load_uid():
    if not CONFIG_FILE.is_file():
        fail(f"{CONFIG_FILE} absent. Lance d'abord : python tools/interro.py init")
    return json.loads(CONFIG_FILE.read_text(encoding='utf-8'))['uid']


# Firestore REST type chaque valeur : {"stringValue": ...}, {"arrayValue": ...}.
# Ces deux fonctions traduisent dans les deux sens, pour les seuls types qu'une
# interro et un abonnement utilisent.

def to_value(v):
    if v is None:
        return {'nullValue': None}
    if isinstance(v, bool):
        return {'booleanValue': v}
    if isinstance(v, int):
        return {'integerValue': str(v)}
    if isinstance(v, str):
        return {'stringValue': v}
    if isinstance(v, list):
        return {'arrayValue': {'values': [to_value(x) for x in v]}}
    if isinstance(v, dict):
        return {'mapValue': {'fields': {k: to_value(x) for k, x in v.items()}}}
    raise TypeError(f'type non géré : {type(v)}')


def from_value(v):
    if 'stringValue' in v:
        return v['stringValue']
    if 'integerValue' in v:
        return int(v['integerValue'])
    if 'booleanValue' in v:
        return v['booleanValue']
    if 'timestampValue' in v:
        return v['timestampValue']
    if 'nullValue' in v:
        return None
    if 'arrayValue' in v:   # un tableau vide n'a pas de clé `values`
        return [from_value(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v:     # une table vide n'a pas de clé `fields`
        return {k: from_value(x) for k, x in v['mapValue'].get('fields', {}).items()}
    raise ValueError(f'valeur non gérée : {v}')


def list_daily(session, base, uid):
    """Toutes les interros déjà écrites, en {jour: [questions]}."""
    found, token = {}, None
    while True:
        params = {'pageSize': 300}
        if token:
            params['pageToken'] = token
        r = session.get(f'{base}/users/{uid}/daily', params=params)
        r.raise_for_status()
        body = r.json()
        for doc in body.get('documents', []):
            day = doc['name'].rsplit('/', 1)[1]
            fields = {k: from_value(x) for k, x in doc.get('fields', {}).items()}
            found[day] = fields.get('questions', [])
        token = body.get('nextPageToken')
        if not token:
            return found


# --------------------------------------------------------------------------
# Commandes
# --------------------------------------------------------------------------

def cmd_init(_args):
    """Trouve l'uid du seul utilisateur de l'app et le range dans config.json.

    Les documents `users/{uid}` n'existent pas en tant que tels (seules leurs
    sous-collections existent) : `showMissing` les fait apparaître quand même.
    """
    session, project = session_and_project()
    r = session.get(f'{documents_url(project)}/users', params={'showMissing': 'true', 'pageSize': 10})
    r.raise_for_status()
    uids = [d['name'].rsplit('/', 1)[1] for d in r.json().get('documents', [])]
    if len(uids) != 1:
        fail(f"{len(uids)} utilisateur(s) trouvé(s) au lieu d'un : {uids}\n"
             f"    Écris l'uid à la main dans {CONFIG_FILE} : {{\"uid\": \"...\"}}")
    CONFIG_FILE.write_text(json.dumps({'uid': uids[0]}) + '\n', encoding='utf-8')
    print(f'uid enregistré dans {CONFIG_FILE}')


def print_table(title, counts, themes):
    """Un tableau thème × nature, avec les totaux."""
    print(title)
    print(f'  {"thème":28} {"famille":8} {"début":10}  piege  base  demo  total')
    tot = collections.Counter()
    for t in sorted(themes, key=lambda t: (t.start, t.family, t.name)):
        row = [counts[(t.name, n)] for n in NATURES]
        tot.update(dict(zip(NATURES, row)))
        print(f'  {t.name:28} {t.family:8} {t.start}  {row[0]:5} {row[1]:5} {row[2]:5}  {sum(row):5}')
    print(f'  {"total":48}  {tot["piege"]:5} {tot["base"]:5} {tot["demonstration"]:5}  {sum(tot.values()):5}')


def cmd_demand(args):
    """Combien de questions chaque thème doit fournir, par nature.

    On distribue avec des réserves inépuisables et on compte : c'est la cible de
    la génération. Seuls les thèmes (nom, famille, début) sont lus.
    """
    themes, _ = load_bank(args.bank)
    days = list(day_range(parse_day(args.start, '--from'), parse_day(args.until, '--until')))
    plan = distribute(themes, None, days, {}, infinite=True)
    counts = collections.Counter(p for picks in plan.values() for p in picks)
    print_table(f'Demande du {days[0]} au {days[-1]} ({len(days)} jours) :', counts, themes)


def cmd_plan(args):
    """Distribue la banque et écrit les interros, sans jamais en remplacer une.

    Les jours déjà écrits sont laissés tels quels, et leurs questions retirées
    de la banque disponible : relancer `plan` après avoir complété la banque
    ne sert que les jours encore vides. Avec `--replace`, les jours à partir de
    `--from` sont **réécrits** (planning de la prépa modifié, banque corrigée) ;
    les jours d'avant restent intouchés.
    """
    themes, questions = load_bank(args.bank)
    start = parse_day(args.start, '--from')
    days = list(day_range(start, parse_day(args.until, '--until')))

    existing = {}
    if not args.offline:
        session, project = session_and_project()
        uid = load_uid()
        base = documents_url(project)
        existing = list_daily(session, base, uid)

    # Ce qui est déjà servi (ou le restera) ne se ressert pas.
    kept = {d: qs for d, qs in existing.items() if not (args.replace and d >= start.isoformat())}
    used = {q.get('id') for qs in kept.values() for q in qs}
    # La rotation reprend où les jours déjà écrits l'ont laissée. La nature n'est
    # pas stockée dans l'interro, mais sa place la dit (voir `slots_for`).
    last_used = {}
    for d, qs in sorted(kept.items()):
        day = datetime.date.fromisoformat(d)
        for (nature, _), q in zip(slots_for(day), qs):
            last_used[q.get('theme')] = day
            last_used[(q.get('theme'), nature)] = day

    # Chaque réserve (thème, nature) est mélangée avec une graine fixe : l'ordre
    # du fichier suit souvent le cours, on ne veut pas le servir dans cet ordre,
    # mais on veut une distribution reproductible.
    pools = collections.defaultdict(list)
    for q in questions:
        if q.id not in used:
            pools[(q.theme, q.nature)].append(q)
    for key, pool in pools.items():
        random.Random(f'{key[0]}/{key[1]}').shuffle(pool)

    todo = [d for d in days if d.isoformat() not in kept]
    plan = distribute(themes, pools, todo, last_used)

    served = collections.Counter((q.theme, q.nature) for qs in plan.values() for q in qs)
    left = collections.Counter({k: len(v) for k, v in pools.items()})
    print_table(f'{len(plan)} jour(s) à écrire, du {todo[0] if todo else "—"} au {days[-1]} :', served, themes)
    print_table('Restera en banque :', left, themes)
    for d in list(plan)[:2]:
        print(f'\n{d} :')
        for i, q in enumerate(plan[d], start=1):
            print(f'  {i}. [{q.theme} · {q.nature}] {q.question[:90]}')

    if args.dry_run or args.offline:
        print('\n(essai : rien n’a été écrit)')
        return

    # Une seule requête `commit` pour tout : jusqu'à 500 écritures, appliquées
    # ensemble ou pas du tout. En création, la précondition « n'existe pas »
    # garantit qu'on n'écrase rien ; en `--replace`, on écrit par-dessus.
    now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
    writes = []
    for d, qs in plan.items():
        doc = {
            'name': f'projects/{project}/databases/(default)/documents/users/{uid}/daily/{d}',
            'fields': {
                'date': to_value(d),
                'questions': to_value([{'id': q.id, 'theme': q.theme,
                                        'question': q.question, 'answer': q.answer} for q in qs]),
                'createdAt': {'timestampValue': now},
            },
        }
        w = {'update': doc}
        if not args.replace:
            w['currentDocument'] = {'exists': False}
        writes.append(w)
    for i in range(0, len(writes), 400):
        r = session.post(f'{base}:commit', json={'writes': writes[i:i + 400]})
        if not r.ok:
            fail(f'écriture refusée ({r.status_code}) : {r.text[:400]}')
    print(f'\n{len(writes)} interro(s) écrite(s).')


def cmd_sync_subscription(_args):
    """Recopie l'abonnement push du téléphone dans le secret GitHub, s'il a changé.

    L'empreinte du dernier abonnement recopié évite de réécrire le secret pour
    rien : `gh secret set` est une écriture sur GitHub.
    """
    session, project = session_and_project()
    uid = load_uid()
    r = session.get(f'{documents_url(project)}/users/{uid}/push/phone')
    if r.status_code == 404:
        print("Aucun abonnement rangé : appuie sur « Recevoir la notification » "
              "dans l'écran de l'interro, sur le téléphone.")
        return
    r.raise_for_status()
    fields = {k: from_value(x) for k, x in r.json().get('fields', {}).items()}
    sub = fields.get('subscription')
    if not sub or not sub.get('endpoint'):
        fail('document push/phone sans abonnement lisible.')

    payload = json.dumps(sub, sort_keys=True, separators=(',', ':'))
    digest = hashlib.sha256(payload.encode('utf-8')).hexdigest()
    if SUB_HASH_FILE.is_file() and SUB_HASH_FILE.read_text().strip() == digest:
        print('Abonnement inchangé.')
        return
    subprocess.run(['gh', 'secret', 'set', 'PUSH_SUBSCRIPTION', '--repo', REPO],
                   input=payload, text=True, check=True)
    SUB_HASH_FILE.write_text(digest + '\n')
    print('Abonnement recopié dans le secret GitHub PUSH_SUBSCRIPTION.')


def main():
    # La console Windows n'est pas en UTF-8 par défaut : sans ça, le premier
    # « é » d'une question ferait planter l'affichage.
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

    parser = argparse.ArgumentParser(description='Distribue la banque de questions sur le calendrier.')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('init').set_defaults(func=cmd_init)

    for name, func in (('demand', cmd_demand), ('plan', cmd_plan)):
        p = sub.add_parser(name)
        p.add_argument('--bank', default=str(BANK_DIR), help='dossier de la banque')
        p.add_argument('--from', dest='start', default=datetime.date.today().isoformat())
        p.add_argument('--until', default=UNTIL)
        if name == 'plan':
            p.add_argument('--dry-run', action='store_true', help='montrer sans écrire')
            p.add_argument('--offline', action='store_true',
                           help='sans Firestore : comme si rien n’était encore écrit (implique --dry-run)')
            p.add_argument('--replace', action='store_true',
                           help='réécrire les jours à partir de --from')
        p.set_defaults(func=func)

    sub.add_parser('sync-subscription').set_defaults(func=cmd_sync_subscription)
    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
