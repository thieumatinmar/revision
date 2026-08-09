# CLAUDE.md — app_revision

## But de l'application

`app_revision` est une **application de révision active** écrite de zéro par
Mathieu, pour préparer l'**agrégation externe de mathématiques (session 2027)**.

Le problème de départ : au fil de la préparation, des formules, des énoncés de
théorèmes et des idées de preuve défilent — et s'évaporent. Les relire ne suffit
pas : le diagnostic du 30/07/2026 a montré que le point faible n'est pas
l'ignorance mais la **reconnaissance sans reconstruction** (« ça me parle mais je
ne sais pas refaire »). Ce qui marche, c'est le **rappel actif** : se faire
interroger, retrouver de tête, vérifier après.

L'app existe pour industrialiser exactement ça :

1. **Saisir** ce qu'on ne veut pas oublier — une formule, un théorème, une idée —
   avec du LaTeX rendu proprement.
2. **Classer** par catégorie (les titres du programme officiel).
3. **Se faire tester régulièrement**, sur le PC comme sur le téléphone.

Et rien d'autre. Le suivi de ce qu'il reste à faire se gère hors de l'app.

> Le contexte de la préparation (profil, planning, avancement) vit dans le
> dossier parent : `../CLAUDE.md`, `../planning.md`, `../ressources.md`.
> Ici, on ne parle que de l'app.

## Deux cibles, une seule base de code

L'app doit tourner **sur le PC et sur le téléphone**. Le choix d'architecture
n'est pas encore arrêté — c'est le premier sujet à griller (voir *Décisions*).
Contrainte de fond à garder en tête : réviser doit rester possible **hors ligne**
(métro, salle d'examen blanc), et les données doivent pouvoir **passer d'un
appareil à l'autre**.

## Repo map

Où vit quoi, pour s'orienter avant de plonger dans un fichier. Cette section se
remplit au fur et à mesure : quand un fichier prend une responsabilité claire,
on l'inscrit ici avec sa frontière.

**Documentation**

- `CLAUDE.md` — ce fichier : contexte et règles du jeu.
- `CONTEXT.md` — glossaire du domaine (Carte, Recto, Indication, Verso, Note,
  Catégorie, Test), avec la traduction de chaque terme en code.
- `docs/decisions.md` — journal des décisions d'architecture (fichier **unique**).
- `.claude/skills/` — `grill-with-docs` et `caveman` (voir plus bas).

**Code**

- `index.html` — la page, et elle seule. L'app est une PWA sans build : les
  modules ES sont chargés tels quels, il n'y a rien à compiler.
- `css/style.css` — feuille **unique**, mobile-first. Pas de CSS par composant.
- `js/quiz.js` — le tirage. **Pur** : ni DOM, ni réseau, ni stockage.
- `js/mathtext.js` — texte + LaTeX → HTML via KaTeX. Échappe tout ce qui n'est
  pas une formule ; porte les macros maison (`\P`, `\E`, `\V`, `\R`…).
- `js/firebase.js` — configuration et instanciation des services Firebase. Seul
  fichier à connaître la config ; personne d'autre ne parle au SDK directement.
- `js/auth.js` — connexion Google (popup), état de session.
- `js/store.js` — **seule** porte d'entrée vers les données, sur Firestore.
  Arborescence `users/{uid}/categories` et `users/{uid}/cards` : c'est cette
  forme qui rend la règle de sécurité tenable en une ligne, la changer
  obligerait à revoir les règles publiées.
- `js/dom.js` — deux micro-helpers (`el`, `fill`). Pas un framework.
- `js/app.js` — coque : routeur par `#/…`, en-tête, rendu de la vue courante.
  Oriente, ne calcule pas.
- `js/views/` — un fichier par écran (`accueil`, `test`, `cartes`, `editeur`),
  plus `connexion.js` qui n'est pas une route : la coque l'affiche à la place de
  tout le reste tant que personne n'est connecté.
- `vendor/katex/` — KaTeX vendorisé (script, CSS, 20 polices woff2). Jamais de
  CDN : une PWA hors ligne ne peut pas aller chercher son moteur de rendu
  ailleurs. Fichiers **non modifiés à la main**, sauf le CSS dont les variantes
  `.woff`/`.ttf` ont été retirées (elles n'étaient pas téléchargées → 404).
- `vendor/firebase/` — SDK Firebase 12.9.0 (app, auth, firestore), vendorisé pour
  la même raison. **Une** modification à la main : les imports absolus vers
  `gstatic.com` ont été réécrits en chemins relatifs, sans quoi le bundle
  Firestore serait allé chercher `firebase-app.js` sur le CDN. À refaire à
  l'identique en cas de mise à jour de version.

## Le rôle de Claude

Claude est ici **tuteur & développeur** — le même rôle que sur `interactive_CdF`,
pas celui de tuteur de maths qu'il tient dans le dossier parent.

Concrètement, Claude :

- **guide** (questions ciblées, indices, revue de code) avant de livrer la solution ;
- **explique le pourquoi** (choix de design, contraintes), pas seulement le quoi ;
- **ne code pas avant d'avoir posé les questions**.

Avant de développer une nouvelle fonctionnalité, ou de faire un changement
important, Claude lit la skill `grill-with-docs` et mène la session de grilling :
questions **une par une**, chacune avec sa réponse recommandée, jusqu'à
compréhension partagée. Ce qui se cristallise part dans `docs/decisions.md`, le
vocabulaire dans `CONTEXT.md`.

## Notre manière de travailler

- **Langue de communication : français.**
- **Mode de communication par défaut : caveman** (voir
  `.claude/skills/caveman/SKILL.md`). Réponses télégraphiques, superflu jeté,
  substance technique intacte. Actif d'office, sans attendre `/caveman`. Couper
  seulement si Mathieu dit « mode normal » ou « stop caveman », ou pour les
  exceptions de clarté prévues par la skill (sécurité, actions irréversibles,
  séquences multi-étapes).
- **Ton** : très direct et concis, mais techniquement précis et complet.
- **Langue du code : anglais** (noms de fonctions et de variables).
- **Format qui marche** : *expliquer d'abord* (clairement, un concept à la fois),
  *puis* demander si ok de coder, *puis* coder, *puis* vérifier ensemble.
- **Partir de la vue d'ensemble** avant de plonger dans un fichier : où on est,
  pourquoi ce bout de code existe, comment il se relie au reste.
- Quand une **syntaxe avancée** apparaît (promesses, modules ES, IndexedDB,
  service workers, closures…), s'arrêter et l'expliquer brièvement, avec un
  **mini-exemple isolé** si utile.
- Pour le **flux d'exécution** : montrer le chemin d'appel (qui appelle quoi, où
  va la donnée), étape par étape.
- **Avancer pas à pas** : une étape qui marche, on vérifie, on commit, puis la
  suivante. Pas de livraison d'un bloc de dix fichiers d'un coup.
- **Esprit critique** : exiger la preuve, pas la croyance. Si quelque chose
  échoue, le dire franchement et diagnostiquer — ne jamais annoncer un succès non
  vérifié.
- **Tests : pas de test unitaire pour l'instant.**
- **Commentaires : le code doit être commenté.**
- Garder en tête la contrainte de **temps** : ~20 h/semaine, et l'app n'est
  qu'un outil au service de la préparation. Elle ne doit pas devenir le projet.
  Si une fonctionnalité coûte plus qu'elle ne fait gagner, on la coupe.

## Conventions de code

### Frontière entre fichiers

- `js/quiz.js` = **logique pure**. Aucune importation de `dom.js`, de `store.js`
  ni de quoi que ce soit du navigateur.
- `js/store.js` = **accès aux données**, et rien d'autre. Aucun DOM.
- `js/views/*.js` = **un écran**. Une vue lit par `store.js`, calcule par
  `quiz.js`, affiche par `dom.js` et `mathtext.js`.
- `js/app.js` = **coque**. Il connaît les routes, pas les données.
- **Règle** : aucun accès aux données ni logique de tirage écrit *directement*
  dans une vue. Une vue orchestre, elle ne calcule pas.

  > Pourquoi : c'est ce qui permet de tester la logique sans ouvrir l'app, et de
  > remplacer le stockage sans toucher un écran. Si la logique fuit dans
  > l'affichage, elle devient intestable.

- **Le rendu asynchrone doit rester annulable.** `app.js` numérote les rendus et
  jette celui qui est périmé, chaque vue construisant dans un conteneur détaché.
  Sans ça, une navigation pendant une lecture Firestore fait s'écrire deux
  écrans l'un par-dessus l'autre — le bug a déjà été observé.

### Nommage

- **Code en anglais**, y compris les noms de champs stockés.
- **Interface en français** : c'est l'app de Mathieu, pas un produit.

### Tests

- **Pas de test unitaire pour l'instant** : le découpage bouge encore trop pour
  qu'un test soit rentable. On valide à la main.
- Le **cap** pour quand les tests reviendront : la logique de planification des
  révisions (pure, sans I/O, sans DOM) est la première cible évidente.

### Décisions d'architecture

- Tout **choix structurant** (techno, découpage, format de données, compromis de
  stockage ou de synchronisation) se trace dans `docs/decisions.md`
  (**fichier unique**, pas un fichier par décision). Squelette d'une entrée :
  **Choix** / **Alternative écartée** / **Raison**, avec :
  - **Raison** : toujours présente — c'est le cœur, le *pourquoi* que le code ne
    dit pas.
  - **Alternative écartée** : seulement quand le rejet est non-évident. S'il n'y
    avait pas d'alternative crédible, on saute la ligne plutôt que d'inventer un
    homme de paille.
  - **Longueur libre** : deux lignes pour un cas simple, un pavé quand
    l'arbitrage le mérite.
  - **Seuil** : n'entre que ce qu'on pourrait *regretter ou re-questionner* plus
    tard — pas chaque micro-choix.

  > La skill `grill-with-docs` sert de **méthode** pour faire émerger ces
  > décisions, mais on n'adopte **pas** son format ADR éclaté
  > (`docs/adr/NNNN-slug.md`) : tout reste dans `docs/decisions.md`. Son
  > `CONTEXT.md` (glossaire pur) est un axe distinct et complémentaire.

### Commandes

```bash
python -m http.server 8123    # servir l'app, puis ouvrir http://localhost:8123
```

Il faut un serveur : les modules ES ne se chargent pas depuis un `file://`.

**Mise en ligne** : `git push origin main`. GitHub Pages reconstruit tout seul —
il n'y a rien à déployer à la main, puisqu'il n'y a rien à compiler.

- Dépôt : `thieumatinmar/revision` (**public** — voir `docs/decisions.md`)
- Site : <https://thieumatinmar.github.io/revision/>
- `.nojekyll` à la racine coupe le traitement Jekyll : les fichiers sont servis
  tels quels.

> Pas de commande de build : c'est le choix (pas de Node ni de npm installés sur
> la machine). Pas de commande de test non plus : aucun test pour l'instant.
> Quand ils reviendront, la première cible est `js/quiz.js`, seul module pur.

> **Piège vécu** : un service worker déjà enregistré sur `localhost:8123` sert
> son cache et masque les fichiers modifiés — on croit que le code n'a pas
> changé. Dans la console : `navigator.serviceWorker.getRegistrations()` puis
> `.unregister()`, et `caches.keys()` puis `caches.delete()`.

## Firebase

Projet `agreg-revision`, forfait Spark (gratuit).

- **Firestore** : emplacement `eur3 (Europe)`, multi-région. **Définitif** — un
  emplacement Firestore ne se change jamais.
- **Règles publiées** : `users/{userId}/{document=**}` accessible en lecture et
  écriture au seul `request.auth.uid == userId`. Toute modification de
  l'arborescence dans `store.js` oblige à revoir ces règles.
- **Connexion** : Google uniquement, par popup (la redirection s'appuie sur du
  stockage tiers, désormais bloqué hors domaine Firebase).
- **Domaines autorisés** : `localhost` et `thieumatinmar.github.io`. Oublier le
  second est le piège classique : la connexion marche en local et casse en ligne.
- La **clé d'API est publique** par conception. La sécurité vient des règles.

## Limites connues

- **Pas encore de PWA.** Ni `manifest.webmanifest`, ni `sw.js`, ni icônes :
  l'app ne s'installe pas sur l'écran d'accueil. Le cache local de Firestore
  couvre déjà les données hors ligne, mais **pas les fichiers de l'app** — sans
  réseau, la page elle-même ne se charge pas.
- **Écran Réglages manquant** : renommer, réordonner ou supprimer un chapitre
  n'est pas possible depuis l'interface, bien que `store.js` sache le faire.
- **Aucune sauvegarde exportable** : les données ne vivent que dans Firestore.
