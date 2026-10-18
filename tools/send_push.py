#!/usr/bin/env python3
"""send_push.py — envoie la notification du matin au téléphone.

Lancé chaque jour par GitHub Actions (`.github/workflows/interro.yml`), PC
allumé ou non. Il ne sait pas si l'interro du jour existe : il annonce, l'écran
de l'app dit la suite (docs/decisions.md, « Interro du jour »).

Deux secrets, lus dans l'environnement :

    PUSH_SUBSCRIPTION   l'abonnement du téléphone, JSON { endpoint, keys }
                        (recopié depuis Firestore par `tools/interro.py`)
    VAPID_PRIVATE_KEY   la clé privée VAPID, en PEM

Ni l'un ni l'autre ne donne accès aux données : ils permettent seulement
d'écrire à ce téléphone.

Dépendance : pywebpush (`pip install pywebpush`).
"""

import json
import os
import sys

from py_vapid import Vapid
from pywebpush import WebPushException, webpush

# Le `sub` VAPID dit au service push qui envoie, au cas où il faudrait nous
# joindre. Une URL https suffit, inutile d'y mettre une adresse mail — mais
# **sans chemin** : py_vapid refuse `https://…/revision/`.
CONTACT = 'https://thieumatinmar.github.io'

# Ce que `sw.js` affiche. `url` est relative à la portée du service worker.
MESSAGE = {'title': 'Interro du jour', 'body': 'Cinq questions t’attendent.', 'url': '#/interro'}

# Téléphone éteint ou hors réseau : le service push garde le message 12 h,
# puis le jette — une interro du matin n'a plus de sens le lendemain.
TTL = 12 * 60 * 60


def main():
    sub_json = os.environ.get('PUSH_SUBSCRIPTION', '').strip()
    pem = os.environ.get('VAPID_PRIVATE_KEY', '').strip()
    if not sub_json or not pem:
        sys.exit('Secret PUSH_SUBSCRIPTION ou VAPID_PRIVATE_KEY absent : rien à envoyer.\n'
                 'Abonne le téléphone (écran de l’interro), puis lance sur le PC :\n'
                 '    python tools/interro.py sync-subscription')

    try:
        webpush(
            subscription_info=json.loads(sub_json),
            data=json.dumps(MESSAGE, ensure_ascii=False),
            vapid_private_key=Vapid.from_pem(pem.encode()),
            vapid_claims={'sub': CONTACT},
            ttl=TTL,
        )
    except WebPushException as err:
        status = err.response.status_code if err.response is not None else None
        # 404 / 410 : l'abonnement n'existe plus (app désinstallée, données
        # effacées, renouvelé par Chrome sans que l'app soit rouverte depuis).
        if status in (404, 410):
            sys.exit(f'Abonnement expiré ({status}) : rouvre l’app sur le téléphone, '
                     'réabonne-le si besoin, puis lance sync-subscription sur le PC.')
        raise
    print('Notification envoyée.')


if __name__ == '__main__':
    main()
