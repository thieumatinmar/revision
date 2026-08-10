# Décisions d'architecture — app_revision

Journal des choix structurants. Format : **Choix** / **Alternative écartée** /
**Raison**. Seuil d'entrée : un choix qu'on pourrait regretter ou re-questionner
plus tard (dur à inverser, surprenant sans contexte, ou vrai arbitrage).

---

## PWA plutôt qu'une app native

**Choix** — Une seule base de code : une *Progressive Web App*. HTML/CSS/JS
servis tels quels, installable sur l'écran d'accueil du téléphone, utilisable en
onglet sur le PC, fonctionnelle hors ligne via un service worker.

**Alternative écartée** — Une vraie app native (React Native, Flutter) doublée
d'un site pour le PC.

**Raison** — Deux contraintes se rejoignent. D'abord la machine : ni Node ni npm
installés, seulement Python 3.12 ; une chaîne de build npm serait à installer et
à entretenir avant même d'écrire la première ligne. Ensuite le budget : la
préparation vaut 20 h/semaine consacrées **aux maths**, l'app n'est qu'un outil.
Deux cibles à maintenir, ou un framework cross-platform à apprendre, coûterait
plus que ce que l'app fait gagner. Ce qu'on perd — pas de présence en store,
install par « Ajouter à l'écran d'accueil » sur iPhone, notifications système
moins fiables sur iOS — ne touche aucun besoin réel ici.

---

## Sync bidirectionnelle obligatoire (et non export/import manuel)

**Choix** — Les données se synchronisent automatiquement entre appareils.

**Alternative écartée** — Un simple bouton Exporter / Importer, à déclencher à la
main.

**Raison** — L'usage réel l'impose : Mathieu **saisit** ses cartes sur PC mais se
**teste sur PC et sur téléphone**. Or une révision n'est pas une lecture : elle
modifie l'état de la carte (prochaine échéance, facilité). Réviser sur téléphone
puis reprendre sur PC sans sync, c'est réviser deux fois la même chose et jamais
les autres. Le transfert manuel marcherait tant qu'on y pense — et divergerait
définitivement le premier jour d'oubli.

---

## Hébergement : GitHub Pages

**Choix** — L'app est servie en fichiers statiques depuis GitHub Pages.

**Alternative écartée** — (a) un serveur Flask hébergé qui servirait l'app *et*
l'API de sync ; (b) `python -m http.server` sur le PC de la maison.

**Raison** — Une PWA n'est installable sur l'écran d'accueil, et n'a de service
worker (donc de hors-ligne), que sur une **origine sûre** : HTTPS ou localhost.
Servir depuis le PC en HTTP sur le réseau local tue les deux, et suppose le PC
allumé sur le bon wifi — ce qui exclut la révision dans les transports, un des
cas d'usage. GitHub Pages donne l'HTTPS, gratuitement et sans rien à
administrer ; le dépôt sert accessoirement de versionnage du code. Le Flask
hébergé était séduisant (une seule brique, et le même outil que sur
`interactive_CdF`), mais les offres gratuites ont un disque éphémère : il aurait
fallu y brancher une vraie base de toute façon.

---

## Stockage distant : Firebase / Firestore

**Choix** — Le point de rendez-vous des appareils est une base Firestore.
Chaque appareil garde sa copie locale (hors-ligne), le SDK réconcilie.

**Alternative écartée** — Un gist GitHub privé contenant un JSON, lu et écrit via
l'API GitHub : aucun compte supplémentaire, historique de versions offert, et une
fusion « le plus récent gagne » à écrire nous-mêmes.

**Raison** — Décision de Mathieu, prise en connaissance du compromis : Firestore
apporte la persistance hors-ligne et la réconciliation **déjà écrites et
testées**, là où le gist demandait d'écrire soi-même la fusion — c'est-à-dire
l'endroit exact où l'on se trompe. Le prix assumé : un compte Google Cloud, des
règles de sécurité à écrire, et une dépendance externe pour un usage à un seul
utilisateur.

**Conséquences à traiter** (elles ne sont pas optionnelles) :

1. **L'identité doit être partagée entre appareils.** L'authentification anonyme
   de Firebase crée une identité *par appareil* : PC et téléphone auraient deux
   bases distinctes et la sync ne marcherait jamais. Il faut une connexion à un
   compte.
2. **Le SDK se charge depuis un CDN Google.** Pour que « hors ligne » veuille
   dire quelque chose, il doit être figé dans le cache du service worker — sinon
   plus de réseau = plus d'app du tout, ce qui est pire que pas de sync.
3. **La clé d'API Firebase est publique** (elle est dans le code du navigateur,
   c'est normal et prévu). La sécurité repose entièrement sur les **règles
   Firestore** : sans règle, la base est ouverte au monde entier.

> **Note ajoutée après la décision « test sans état »** (voir plus bas) : une
> carte ne portant plus aucun état de progression, il n'y a plus rien à
> réconcilier entre appareils — la sync se réduit à propager du contenu écrit
> depuis un seul appareil. L'argument principal de Firestore (fusion
> automatique) tombe donc, et l'outil devient surdimensionné pour le besoin.
> Décision maintenue par Mathieu ; consigné ici pour que le futur lecteur sache
> que l'écart est connu et assumé, pas subi.

---

## Identité partagée : connexion Google

**Choix** — Chaque appareil s'authentifie par « Se connecter avec Google ». La
règle Firestore autorise lecture et écriture au seul identifiant de ce compte.

**Alternative écartée** — (a) un « code de coffre » choisi par l'utilisateur,
tapé à l'identique sur les deux appareils, sans authentification ; (b) la
connexion par lien magique envoyé par e-mail.

**Raison** — L'authentification anonyme de Firebase, réflexe naturel pour une app
mono-utilisateur, crée une identité **par appareil** : PC et téléphone
obtiendraient deux bases distinctes et la sync ne marcherait tout simplement
jamais. Il faut donc une identité partagée. Le code de coffre en donnerait une,
mais sans authentification réelle : la règle Firestore n'aurait plus rien à
vérifier, et la base serait ouverte en écriture à qui devine la phrase. Le lien
magique est aussi sûr que Google, mais impose un aller-retour par boîte mail à
chaque appareil et un modèle d'e-mail à configurer, pour un bénéfice nul ici
puisque les deux appareils sont déjà connectés à un compte Google.

---

## Test : tirage aléatoire par catégorie, sans aucun état

**Choix** — Un test est un tirage au hasard parmi les cartes d'une catégorie.
L'app ne retient **rien** : ni échéance, ni note, ni marqueur « à revoir », ni
compteur de réussite. Une carte n'a pas de progression.

**Alternative écartée** — (a) la répétition espacée (chaque carte porte une
échéance recalculée selon une auto-notation) ; (b) un simple marqueur « à
revoir » posé sur les cartes ratées ; (c) un compteur de réussite pondérant le
tirage.

**Raison** — Décision de Mathieu, contre la recommandation, au nom de la
simplicité : zéro état à stocker, zéro bouton de notation, zéro algorithme à
comprendre ou à déboguer. L'app reste un outil de tirage, pas un système.

Ce qu'on perd, explicitement : l'app ne pourra jamais dire ce qui coince, et
rien ne distinguera une carte ratée systématiquement d'une carte acquise — donc
autant de temps passé sur ce qui est su que sur ce qui est fragile. Le remède
prévu est manuel : découper en catégories assez fines pour choisir soi-même où
travailler.

> Si le besoin se fait sentir plus tard, le rattrapage le moins coûteux est le
> marqueur « à revoir » (un booléen par carte) : il ne demande ni date ni
> algorithme, et n'invalide rien de ce qui aura été écrit.

---

## Une seule catégorie par carte, en liste plate

**Choix** — Une carte appartient à exactement une catégorie. Les catégories
forment une liste plate, calquée sur les titres du programme officiel.

**Alternative écartée** — (a) une catégorie plus des étiquettes libres
transverses ; (b) plusieurs catégories par carte ; (c) une arborescence de
catégories.

**Raison** — C'est le modèle qui garde l'app compréhensible : un test = une
catégorie = un tirage, et un compteur qui ne ment pas. Les autres options
achètent de la souplesse au prix de complexité structurelle — déduplication d'un
tirage multi-catégories, gestion d'arbre, ou deux rangements parallèles à tenir à
jour. Le cas réel qui gêne (une carte de probabilités qui sert aussi à l'option A
de l'oral) se règle en créant une catégorie de plus le jour où le besoin est
concret, plutôt qu'en généralisant le modèle par avance.

---

## Pas de to-do dans l'app

**Choix** — L'app ne gère que des cartes. Aucune liste de tâches, même adossée
aux catégories.

**Alternative écartée** — Une liste à cocher par catégorie (texte + case, les
faites repliées en bas), envisagée puis retirée du périmètre.

**Raison** — Décision de Mathieu : le suivi de ce qu'il reste à faire se gère
ailleurs (`../planning.md` et les fichiers d'avancement du dossier parent), là où
vit déjà le planning hebdomadaire. Dupliquer ce suivi dans l'app aurait créé deux
endroits où regarder, donc un des deux périmé. L'app reste mono-fonction :
saisir des cartes, se faire interroger dessus.

> Conséquence sur le glossaire : le terme **Tâche** a été retiré de
> `CONTEXT.md`. Si la question revient, elle reviendra avec ce nom-là.

---

## Déroulé d'un test : flux infini, tirage indépendant, une seule catégorie

**Choix** — Un test porte sur **une** catégorie, choisie à l'accueil. Il ne se
termine jamais : à chaque « suivante », une carte est tirée au hasard parmi
celles de la catégorie, indépendamment des précédentes. Pas de compteur, pas
d'écran de fin, pas de sélection multiple, pas d'entrée « toutes catégories ».

**Alternative écartée** — (a) une passe complète : toutes les cartes mélangées,
chacune une fois, avec compteur et écran de fin ; (b) un paquet mélangé rebattu
à l'épuisement — flux infini identique côté utilisateur, mais aucun doublon
avant d'avoir fait le tour, pour trois lignes de plus ; (c) un paquet de N
cartes ; (d) une entrée « Tout » à l'accueil ; (e) une sélection multiple de
catégories.

**Raison** — Décisions de Mathieu, toutes dans le même sens : le minimum de code
et le minimum d'écran. Le tirage indépendant tient en une ligne.

Ce qu'on perd, explicitement : sur une catégorie de 47 cartes, un doublon
apparaît au bout d'une dizaine de tirages en moyenne, et certaines cartes
peuvent rester longtemps invisibles ; rien ne dit jamais qu'on a fait le tour
d'un chapitre. L'absence de « toutes catégories » interdit par ailleurs le
balayage large avant un écrit blanc — cohérent, cela dit, avec le tirage sans
mémoire : brasser 400 cartes au hasard ne couvrirait rien d'utile.

> Rattrapage le moins coûteux si le besoin se fait sentir : le paquet mélangé
> rebattu (option b). Il ne change ni l'écran, ni le modèle de données, ni
> l'absence d'état — seulement l'ordre de sortie.

---

## Les 12 titres du programme sont créés au premier lancement

**Choix** — À la toute première ouverture, l'app crée les 12 catégories des
titres du programme officiel 2027 (`../ressources/programme_officiel_2027.md`),
renommables et supprimables. Aucune carte d'exemple.

**Alternative écartée** — (a) une base entièrement vide ; (b) les 12 titres plus
quelques cartes réelles tirées de l'avancement, qui auraient servi de modèle de
rédaction LaTeX.

**Raison** — L'app doit parler la même langue que le planning dès la première
seconde : c'est ce qui évite qu'une taxonomie parallèle se bricole à côté de
celle du programme. Et douze créations manuelles avant d'écrire la première
carte, c'est douze occasions d'abandonner.

---

## Connexion obligatoire

**Choix** — Sans connexion Google, l'app n'affiche qu'un écran de connexion.
Aucun mode local anonyme.

**Alternative écartée** — Une app utilisable sans compte, la connexion activant
la sync après coup.

**Raison** — Un seul chemin de données. Le mode optionnel oblige à répondre à la
question sale : que fait-on des 30 cartes créées en local le jour où l'on se
connecte — fusion, écrasement, duplication ? C'est exactement le code qu'on écrit
mal et qu'on débogue longtemps, pour un bénéfice nul : il faut de toute façon du
réseau au premier lancement, ne serait-ce que pour télécharger l'app. Une fois
connectée, la session Firebase persiste, y compris hors ligne.

---

## Corriger une carte depuis le test, sans en sortir

**Choix** — Deux chemins vers le formulaire d'édition : l'écran « Cartes »
(liste d'une catégorie + recherche texte) et un bouton « modifier » sur la carte
affichée pendant le test, qui rend la main au test après enregistrement.

**Alternative écartée** — (a) l'écran liste seul, pour garder le test totalement
épuré ; (b) la retouche en test seule, sans écran liste.

**Raison** — Une coquille LaTeX ou un énoncé faux se repèrent presque toujours
**en test**, jamais en relisant une liste. Si corriger oblige à sortir, chercher
et revenir, la correction ne se fait pas et la carte reste fausse — ce qui est
pire qu'un bouton de plus à l'écran. Inversement, se passer d'écran liste
rendrait impossible de relire un chapitre, et obligerait à attendre qu'une carte
précise tombe au tirage : long, puisque le tirage est un vrai hasard sans
mémoire.

---

## Supprimer une catégorie non vide est refusé

**Choix** — La suppression d'une catégorie qui contient des cartes est bloquée.
Il faut d'abord vider ou déplacer.

**Alternative écartée** — (a) les cartes basculent dans une zone « sans
catégorie » ; (b) suppression en cascade après un avertissement.

**Raison** — Aucune donnée ne doit disparaître par effet de bord : une carte
représente du travail de rédaction, et il n'y a pas de corbeille. La zone « sans
catégorie » aurait par ailleurs contredit le modèle choisi (*une carte, une
catégorie*) et introduit un cas particulier dans tous les écrans — accueil,
liste, tirage.

---

## Rendu LaTeX : KaTeX, servi depuis le dépôt

**Choix** — Les formules sont rendues par KaTeX, dont les fichiers (script,
feuille de style, polices) sont **copiés dans le dépôt** plutôt que chargés
depuis un CDN.

**Alternative écartée** — MathJax, plus complet en couverture LaTeX.

**Raison** — Décision technique, prise sans arbitrage utilisateur. KaTeX rend de
façon synchrone et pèse quelques centaines de kilo-octets, contre un rendu
asynchrone et un poids bien supérieur pour MathJax : sur un aperçu qui se
redessine à chaque frappe, la différence se voit. Sa couverture LaTeX suffit
largement au programme (`aligned`, `cases`, `matrix`, `mathbb`…). Les fichiers
sont vendorisés parce qu'un CDN est une dépendance réseau : une PWA censée
marcher dans le métro ne peut pas aller chercher son moteur de rendu ailleurs.

> Même raisonnement à appliquer au SDK Firebase, chargé lui aussi depuis un CDN
> Google : il devra être figé dans le cache du service worker, sinon « hors
> ligne » ne veut rien dire.

---

## Le dépôt est public

**Choix** — `thieumatinmar/revision` est un dépôt **public**, et le site est
servi par GitHub Pages depuis la branche `main`.

**Alternative écartée** — (a) garder le dépôt privé et publier via Cloudflare
Pages ou Netlify, qui déploient gratuitement depuis un dépôt privé ; (b) passer
à GitHub Pro (~4 $/mois), seule façon d'avoir Pages sur un dépôt privé.

**Raison** — Contrainte de départ : GitHub Pages ne fonctionne pas sur un dépôt
privé avec un compte gratuit. Rendre le dépôt public est la solution qui
n'ajoute ni compte, ni brique, ni abonnement.

Le calcul de confidentialité est favorable, et c'est ce qui rend la décision
tenable : **le dépôt ne contient aucune donnée personnelle**. Les cartes vivent
dans Firestore, pas dans le code. Quant à la configuration Firebase qui y
figurera, elle est publique par conception — n'importe quel visiteur du site peut
la lire dans son navigateur. Ce qui protège les données, ce sont les règles
Firestore adossées au compte Google, jamais le secret de cette clé.

> Ce qui devient visible : le code, `CLAUDE.md`, `CONTEXT.md`, ce fichier.
> Décision **irréversible en pratique** : ce qui a été public a pu être copié.

---

## Les images vivent dans le document, pas dans Firebase Storage

**Choix** — Une image attachée à la réponse est réduite dans le navigateur, puis
stockée **encodée en texte** dans le champ `images` du document Firestore de la
carte.

**Alternative écartée** — Firebase Storage, avec les images déposées sur un
service dédié et le document ne conservant que leurs adresses.

**Raison** — Storage impose d'activer un produit de plus, d'écrire un second jeu
de règles de sécurité, et sur les projets créés récemment il exige un compte de
facturation. À l'inverse, l'image dans le document ne coûte rien, et surtout elle
**suit la carte** : elle se synchronise entre appareils et se retrouve dans le
cache hors ligne de Firestore sans une ligne de code supplémentaire. Avec
Storage, il aurait fallu gérer à part le téléversement, les adresses, leur
expiration et leur mise en cache.

**Le prix, assumé** : un document Firestore est plafonné à **1 Mo**. D'où
`js/images.js` — réduction à 1400 px de côté, encodage WebP quand le navigateur
le sait, et un budget de 700 Ko par carte, affiché en permanence dans l'éditeur.
Une photo de 9 Mo tombe à ~85 Ko ; le plafond tient donc environ huit figures par
carte, ce qui dépasse tout usage réel. Si ce plafond devenait gênant, c'est le
signal qu'il faut basculer sur Storage — et non contourner la limite.
