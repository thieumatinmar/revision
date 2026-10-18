#!/usr/bin/env python3
"""interro.py — la réserve d'interros, côté PC.

C'est l'outil de la **tâche planifiée** de l'appli Claude, qui génère chaque
jour les interros manquantes (docs/decisions.md, « Interro du jour »). Claude
écrit les questions ; ce script ne fait que lire et écrire Firestore, et
recopier l'abonnement push dans les secrets GitHub. Il ne génère rien.

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
    python tools/interro.py status              # jours manquants + historique (JSON)
    python tools/interro.py write <fichier>     # crée les interros d'un fichier JSON
    python tools/interro.py sync-subscription   # abonnement push → secret GitHub

Format du fichier de `write` — une clé par jour, cinq questions par jour :

    { "2026-10-20": [ { "theme": "Groupes 1",
                        "question": "Ordre de $\\bar k$ dans $\\Z/n\\Z$ ?",
                        "answer": "$n / (k \\wedge n)$." }, ... ] }

`write` ne **remplace jamais** une interro existante : une interro déjà en
réserve a peut-être déjà été lue.

Dépendances : google-auth et requests (`pip install google-auth requests`).
"""

import argparse
import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import sys

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

CONFIG_DIR = pathlib.Path.home() / '.config' / 'agreg-revision'
KEY_FILE = CONFIG_DIR / 'service-account.json'
CONFIG_FILE = CONFIG_DIR / 'config.json'
SUB_HASH_FILE = CONFIG_DIR / 'subscription.sha256'

REPO = 'thieumatinmar/revision'
HORIZON = 7            # la réserve couvre aujourd'hui et les 7 jours suivants
HISTORY = 60           # jours passés renvoyés par `status`, contre les doublons
QUESTIONS_PER_DAY = 5
DAY_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


# --------------------------------------------------------------------------
# Accès à Firestore (API REST)
# --------------------------------------------------------------------------

def fail(message):
    """Sort en erreur avec un message qui dit quoi faire."""
    print(f'interro.py : {message}', file=sys.stderr)
    sys.exit(1)


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
    """Toutes les interros, en {jour: [questions]}. Quelques centaines au plus."""
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


def cmd_status(_args):
    """Ce que la tâche planifiée doit savoir avant de générer, en JSON.

    - `missing` : les jours de la réserve (aujourd'hui → +7) sans interro ;
    - `history` : les questions des 60 derniers jours **et** de la réserve
      déjà écrite, pour ne pas reposer deux fois la même chose.
    """
    session, project = session_and_project()
    uid = load_uid()
    today = datetime.date.today()
    horizon = [(today + datetime.timedelta(days=n)).isoformat() for n in range(HORIZON + 1)]
    oldest = (today - datetime.timedelta(days=HISTORY)).isoformat()

    daily = list_daily(session, documents_url(project), uid)
    print(json.dumps({
        'today': today.isoformat(),
        'missing': [d for d in horizon if d not in daily],
        'history': {d: q for d, q in sorted(daily.items()) if d >= oldest},
    }, ensure_ascii=False, indent=1))


def validate(plan, today):
    """Refuse un fichier mal formé **avant** d'écrire quoi que ce soit."""
    if not isinstance(plan, dict) or not plan:
        fail('le fichier doit être un objet JSON non vide { "AAAA-MM-JJ": [...] }.')
    for day, questions in plan.items():
        if not DAY_RE.match(day):
            fail(f'clé de jour invalide : {day!r} (attendu AAAA-MM-JJ).')
        try:
            date = datetime.date.fromisoformat(day)
        except ValueError:
            fail(f"{day} n'existe pas au calendrier.")
        if date < today:
            fail(f'{day} est passé : une interro ne s’écrit que pour aujourd’hui ou après.')
        if not isinstance(questions, list) or len(questions) != QUESTIONS_PER_DAY:
            fail(f'{day} : il faut exactement {QUESTIONS_PER_DAY} questions.')
        for i, q in enumerate(questions, start=1):
            if not isinstance(q, dict) or set(q) != {'theme', 'question', 'answer'}:
                fail(f'{day}, question {i} : champs attendus exactement theme, question, answer.')
            for field in ('theme', 'question', 'answer'):
                if not isinstance(q[field], str) or not q[field].strip():
                    fail(f'{day}, question {i} : `{field}` vide.')


def cmd_write(args):
    """Crée les interros du fichier, jour par jour, sans jamais en remplacer une."""
    plan = json.loads(pathlib.Path(args.file).read_text(encoding='utf-8'))
    validate(plan, datetime.date.today())

    session, project = session_and_project()
    uid = load_uid()
    base = documents_url(project)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
    created = 0
    for day, questions in sorted(plan.items()):
        fields = {'date': to_value(day), 'questions': to_value(questions),
                  'createdAt': {'timestampValue': now}}
        # `documentId` en création : Firestore répond 409 si le jour existe déjà.
        # C'est lui qui garantit « jamais de remplacement », pas une lecture
        # préalable qu'une autre exécution pourrait devancer.
        r = session.post(f'{base}/users/{uid}/daily', params={'documentId': day},
                         json={'fields': fields})
        if r.status_code == 409:
            print(f'{day} : existe déjà, laissé tel quel.')
            continue
        r.raise_for_status()
        created += 1
        print(f'{day} : créé.')
    print(f'{created} interro(s) créée(s).')


def cmd_sync_subscription(_args):
    """Recopie l'abonnement push du téléphone dans le secret GitHub, s'il a changé.

    L'empreinte du dernier abonnement recopié évite de réécrire le secret à
    chaque passage : `gh secret set` est une écriture sur GitHub, on ne la fait
    que quand il y a quelque chose à dire.
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
    # « é » d'une question ferait planter `status`.
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

    parser = argparse.ArgumentParser(description='La réserve d’interros, côté PC.')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('init').set_defaults(func=cmd_init)
    sub.add_parser('status').set_defaults(func=cmd_status)
    w = sub.add_parser('write')
    w.add_argument('file')
    w.set_defaults(func=cmd_write)
    sub.add_parser('sync-subscription').set_defaults(func=cmd_sync_subscription)

    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
