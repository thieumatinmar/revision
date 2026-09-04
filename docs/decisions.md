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

## Ordre des cartes : une place explicite, et un état « non rangée »

**Choix** — Une carte peut recevoir une place dans sa catégorie (`order`). Ce
champ est **facultatif** : son absence signifie « non rangée ». Une carte naît
non rangée, le reste tant qu'on ne la range pas, et **perd sa place** si on la
change de catégorie. L'écran d'une catégorie est donc coupé en deux zones — les
rangées, réordonnables par ↑/↓, puis les non rangées, chacune avec un bouton
*Ranger* (plus un *Tout ranger* pour la première mise en ordre). L'écran de
gestion compte les non rangées par chapitre.

**Alternative écartée** — (a) toute carte reçoit d'office une place en fin de
liste (création, déplacement) : plus d'état à distinguer, une seule zone ; (b)
pas de champ du tout, ordre implicite par date de création ; (c) ordre par
glisser-déposer.

**Raison** — Trois choses se tiennent.

D'abord, **l'absence de champ était déjà l'état de toutes les cartes existantes**
au moment d'ajouter la fonctionnalité. En faire un état signifiant, plutôt qu'une
valeur à combler, a évité toute migration : rien à réécrire, et un seul chemin de
code au lieu de « anciennes cartes » vs « nouvelles ».

Ensuite, **placer d'office, c'est décider à la place de l'utilisateur** — et
mettre une carte fraîchement arrivée au milieu d'un chapitre, là où on ne la
cherchera pas. Une carte qui change de catégorie perd sa place pour la même
raison : la position 3 d'où elle vient ne veut rien dire là où elle arrive.

Enfin, **la renumérotation ne touche que la zone rangée**. Sans cette frontière,
la première pression sur une flèche rangerait implicitement les quarante cartes
du chapitre — le repère disparaîtrait en masse sans qu'on l'ait voulu. La
frontière ne se franchit que dans un sens ; pour « dé-ranger », il reste le
déplacement de catégorie, et aucun besoin réel ne demandait plus.

Le tri se fait **en mémoire**, pas par un `orderBy` Firestore : une requête triée
sur un champ **exclut les documents qui ne le portent pas** — toutes les cartes
non rangées auraient disparu de l'écran — et `where` + `orderBy` aurait en plus
exigé un index composite déclaré à la main. Le glisser-déposer, lui, a été écarté
au coût : gestes tactiles, autoscroll et cibles de dépôt, pour un gain nul sur
des chapitres de quelques dizaines de cartes.

---

## Le test « dans l'ordre » se termine, l'aléatoire non

**Choix** — Deux modes, choisis dans l'écran de test lui-même : *Aléatoire*
(inchangé — tirage indépendant, flux infini) et *Dans l'ordre* (les cartes de la
catégorie dans leur ordre, chacune une fois, non rangées à la fin, puis un écran
de fin). Le mode n'est pas mémorisé : un test rouvre en aléatoire.

**Alternative écartée** — (a) le mode ordonné reboucle sur la première carte, ce
qui aurait gardé « un test ne se termine jamais » vrai partout ; (b) le choix se
fait à l'accueil, deux boutons *Tester* par chapitre ; (c) le mode ordonné saute
les cartes non rangées.

**Raison** — Le rebouclage a été refusé explicitement par Mathieu : la seule
raison de réviser dans l'ordre est de faire le tour d'un chapitre, et un tour ne
veut rien dire s'il ne s'arrête pas. C'est donc le seul écran de fin de l'app, et
il n'est atteignable que par ce mode — l'aléatoire, lui, garde sa promesse.

Le choix vit dans l'écran de test plutôt qu'à l'accueil parce qu'on change d'avis
**pendant** une révision (« je reprends ce chapitre à zéro »), et parce que
l'accueil aurait doublé ses boutons sur douze lignes. Quant aux cartes non
rangées, les sauter aurait créé des cartes jamais révisées, invisibles jusqu'à ce
qu'on pense à les ranger : elles passent donc à la fin, comme partout ailleurs.

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

---

## Aperçu de la carte : une bascule dans l'éditeur, et un montage partagé

**Choix** — L'éditeur gagne une bascule **Édition ⇄ Aperçu**, posée dans
l'en-tête. L'aperçu montre la carte **montée** — titre, recto, indication,
verso, images, note — d'un seul coup, avec les styles exacts du test, construite
à partir des **valeurs courantes du formulaire** (pas de la carte enregistrée).
La barre d'actions (*Enregistrer* / *Annuler*) reste visible en aperçu. Ce n'est
pas une route : le formulaire est masqué mais conservé dans le DOM.

Ce montage n'est pas réécrit : il est extrait dans un fichier neuf,
`js/carte.js`, qui exporte `faceCarte(card, { hint, back })` — l'écran de test
l'appelle avec son état courant, l'aperçu avec les deux à vrai.

Le mot **aperçu** change de sens au passage : il désigne désormais cette vue.
Les boîtes de rendu sous chaque champ, qui portaient le mot, deviennent des
**rendus** (`.rendu`).

**Alternative écartée** — (a) un bloc d'aperçu permanent en bas du formulaire ;
(b) une modale ; (c) un aperçu **fidèle au déroulé** du test (recto, puis bouton
*Indication*, puis bouton *Réponse*) ; (d) la duplication du montage dans
l'éditeur ; (e) un écran de **lecture seule** atteint depuis la liste des cartes,
le clic ouvrant la carte au lieu de l'éditeur.

**Raison** — Quatre arbitrages, tous dans le même sens : l'aperçu ne doit jamais
mentir, et ne doit rien coûter au geste de correction.

D'abord, **il ne peut pas avoir sa propre copie du rendu**. Une fonctionnalité
dont le seul but est « voir ce que ça donnera » perd toute valeur si elle diverge
de la référence — et elle divergerait en silence, au premier champ ajouté ou au
premier changement d'ordre verso/images/note. D'où `js/carte.js`, premier
**composant** de l'app : ni une vue (pas de route, ne lit pas le store), ni un
helper DOM. La carte du dépôt gagne donc une catégorie de fichier ; c'est le
coût, et il est payé une fois.

Ensuite, **tout d'un coup plutôt que le déroulé (c)**. Ce qu'on cherche à
attraper est une coquille LaTeX ou une formule qui déborde, et elle est presque
toujours au verso : rejouer le déroulé mettrait le verso à deux clics derrière
*chaque* rafraîchissement. Ce qu'on perd, explicitement : on ne juge pas « mon
recto tient-il sans son verso » ni « mon indication en dit-elle trop ». Les
libellés de section gardent malgré tout la frontière visible.

Ensuite, **une bascule plein cadre (b) plutôt qu'un bloc permanent (a)**.
L'éditeur fait déjà six champs, chacun avec sa saisie, sa barre d'insertion et
son rendu : un aperçu en pied de formulaire serait à plusieurs écrans du champ
qu'on tape, et déplacerait le bas de page en permanence. La modale coûtait les
pièges habituels (focus, fermeture, défilement du fond) pour le même résultat.
La barre d'actions survit en aperçu parce que le geste réel finit là : *je tape,
je bascule, je vérifie, c'est bon, j'enregistre* — repasser par le formulaire
pour ce dernier pas serait un péage sur le seul chemin où l'on est sûr de soi.
Corollaire à ne pas perdre : si l'enregistrement échoue sur la validation, on
**rebascule en édition**, sinon le message d'erreur s'afficherait dans un
formulaire masqué.

Enfin, **les rendus par champ restent**. Ils ne servent pas au même instant : le
rendu répond *pendant* la frappe (l'accolade manquante se voit à la seconde où
on la rate), l'aperçu répond *après*, sur le montage. Le renommage lève
l'ambiguïté qui aurait sinon donné deux sens au mot « aperçu » dans le même
fichier.

> Contexte qui a relâché la contrainte d'écran : la saisie se fait **sur PC
> uniquement** — le téléphone ne sert qu'à se tester. L'éditeur peut donc
> s'autoriser une bascule d'en-tête et un formulaire long, là où l'écran de test
> reste, lui, strictement mobile-first.
>
> L'écran de lecture seule (e) a été écarté sans regret : relire un chapitre sans
> rien modifier, c'est déjà ce que fait le mode « dans l'ordre ».

---

## Gardes du dépôt (et pourquoi ce ne sont pas des tests)

**Choix** — Un script Python unique, `tools/check.py`, vérifie quatre invariants
du dépôt : (G1) tout import relatif mène à un fichier existant ; (G2) la `COQUE`
de `sw.js` et l'arborescence se correspondent **dans les deux sens** ; (G3)
`VERSION` diffère de celle du commit que le déploiement va remplacer ; (G4)
aucune URL de CDN en dur. Il est déclenché par un hook `pre-push`
(`.githooks/pre-push`, activé par `git config core.hooksPath .githooks`) et,
en rattrapage, par `.github/workflows/gardes.yml`.

**Alternative écartée** — Des tests unitaires sur `js/quiz.js` comme première
brique, ainsi que le laissait entendre le « cap » annoncé dans `CLAUDE.md`.

**Raison** — Un test vérifie qu'un code **calcule** juste. Or ce qui a réellement
coûté du temps ici n'a jamais été un calcul faux : c'était du code correct qui
n'arrivait pas au navigateur, ou qui y arrivait sans qu'on puisse le savoir.
L'app n'a ni build, ni bundler, ni compilateur — rien ne relit les imports, rien
ne vérifie que la liste de préchargement du service worker suit l'arborescence.
Ces quatre pannes passeraient tous les tests unitaires du monde.

Le vocabulaire n'est pas cosmétique : **« test » est déjà pris**. `CONTEXT.md` le
définit comme « une suite de cartes d'une seule catégorie ». Ranger ces
vérifications sous « les tests » ferait porter deux sens au mot central de l'app,
et surtout laisserait croire dans six mois que la logique est vérifiée alors que
rien n'exécute une seule ligne de `js/`. D'où **garde** — qui vérifie un
invariant du dépôt **sans rien exécuter** — gardé distinct de **test**, qui
viendra quand `js/quiz.js` ou `js/mathtext.js` aura de quoi se tromper.

**Le blocage est local, pas en CI — et c'est une contrainte subie, pas un
goût.** GitHub Pages est en `build_type: legacy` : il publie dès qu'un commit
atterrit sur `main`. Une Action ne peut donc rien empêcher ; quand elle échoue,
le code cassé est déjà en ligne. Rendre le blocage réel supposerait de passer la
source Pages en « GitHub Actions » et d'écrire soi-même le déploiement
(`upload-pages-artifact` + `deploy-pages`). Refusé sur une asymétrie : en l'état,
le pire cas est du code cassé en ligne, réparé par un push de trente secondes ;
avec un déploiement maison, le pire cas est la **publication elle-même** en
panne — et on débogue du YAML au lieu de faire des maths. Le workflow reste comme
filet pour les cas où le hook n'a pas joué (autre poste, clone sans
`core.hooksPath`, `--no-verify`).

**Corollaires assumés** :

1. **Le hook est contournable** (`git push --no-verify`). Voulu : un garde
   inévitable finit désinstallé. Corollaire du corollaire — tout message d'échec
   doit dire **quoi faire**, pas seulement que ça a échoué, sinon `--no-verify`
   devient le réflexe.
2. **Un garde qu'on ne peut pas vérifier s'affiche `[--] non vérifié`**, jamais
   `[ok]`. C'est le cas de G3 sur un clone neuf ou un `workflow_dispatch`. Un
   garde neutralisé qui se déclare vert est pire que pas de garde du tout.
3. **G2 est en dur sur la forme de `COQUE`.** Si la déclaration change de forme,
   le garde le dit et échoue — il ne se tait pas.
4. **G3 se tait quand il n'y a rien à livrer** (aucun commit d'avance sur la
   référence *et* arbre de travail propre). Sans ça, tout lancement manuel juste
   après un push s'afficherait en rouge — la version sur disque **est** alors
   celle en ligne, c'est l'état normal. Un garde qui crie à tort est un garde
   qu'on apprend à ignorer, ce qui le rend pire qu'absent. Un fichier non suivi
   ne compte pas : il ne partira pas au push.

---

## L'éditeur en deux colonnes, et la fin des rendus par champ

**Choix** — L'éditeur devient une grille : **saisie à gauche, carte montée à
droite**, l'aperçu redessiné à la frappe (après 150 ms de pause). Les boîtes de
rendu sous chaque champ (`.rendu`) sont **supprimées**, celle du titre comprise,
ainsi que la **barre d'insertion** (`.raccourcis` : `$…$`, `frac`, `sum`…) et la
fonction `entourer()` qui la servait. Un champ n'est plus qu'un libellé et une
zone de saisie, haute de 200 px au lieu de 140.
L'aperçu reste `faceCarte()`, faces révélées. Sous 900 px, la grille se replie et
la bascule de l'en-tête montre un visage à la fois, exactement comme avant ; au
delà, la bascule est masquée et l'aperçu devient **collant**. `main` s'élargit à
1180 px **sur ce seul écran**, via `main:has(.editeur)`.

Cette entrée **renverse un point** de « Aperçu de la carte : une bascule dans
l'éditeur, et un montage partagé » — son « les rendus par champ restent » et le
terme **Rendu** qu'elle introduisait. Tout le reste de cette entrée tient : le
montage partagé, l'aperçu construit sur les valeurs du formulaire, la barre
d'actions hors des deux visages, le retour forcé en édition quand la validation
échoue.

**Alternative écartée** — Garder `.rendu` sous chaque champ, à côté de l'aperçu
permanent ; ou le garder replié, ouvert à la demande.

**Raison** — L'argument d'origine (« ils ne servent pas au même instant : le
rendu *pendant* la frappe, l'aperçu *après* ») tombe dès lors que l'aperçu est
lui-même permanent et vivant : il répond désormais pendant la frappe, sur le
montage réel. Les garder, c'est composer le même LaTeX deux fois à l'écran, dans
une colonne qui devient deux fois plus longue — le contraire du but recherché.
Ce qu'on perd est mince : `.rendu` isolait la coquille sous *son* champ, mais
`mathtext.js` signale déjà l'erreur **en place** (`.math-error`), à l'endroit de
la formule fautive.

La **barre d'insertion** tombe pour une raison voisine : elle avait été écrite
« en un tap sur mobile », or on ne saisit pas sur mobile — et au clavier, taper
`\frac{` est plus rapide que viser un bouton dans une barre qui défile. Elle
coûtait deux lignes de hauteur sous *chaque* champ, dans la colonne qu'on
cherche justement à raccourcir. La hauteur récupérée va à la saisie : 200 px au
lieu de 140.

Ce que l'ancienne entrée écartait — « un bloc d'aperçu permanent en bas du
formulaire » — reste écarté, et cette décision n'y revient pas : un aperçu **en
bas** serait à plusieurs écrans du champ qu'on tape. C'est le passage **à côté**,
en colonne collante, qui change la donne, et il n'était possible qu'à condition
d'élargir l'écran. La contrainte qui l'autorise est déjà notée : la saisie se
fait sur PC, le téléphone ne sert qu'à se tester.

Choix par **classe** (`en-apercu` sur la grille) et non par style en ligne : un
`display:none` posé pour l'écran étroit survivrait au passage en grand écran, un
style en ligne battant toujours la feuille. Et `align-items: start` sur la
grille, faute de quoi la colonne s'étire sur toute la hauteur et `position:
sticky` n'a plus rien contre quoi coller.

---

## Indication et note : en extinction, pas supprimées

**Choix** — On n'écrit plus d'**indication** ni de **note**. L'éditeur ne montre
le champ que si la carte en porte déjà une ; le vider et enregistrer l'éteint
**définitivement**, sans porte de sortie. Les champs `hint` et `note` restent
dans le document Firestore et dans `faceCarte()`, qui continue de les afficher
tant qu'ils ne sont pas vides. Aucune migration, aucune donnée détruite.

**Alternative écartée** — (a) retirer les deux champs d'un coup, après avoir
recensé et vidé à la main les cartes concernées ; (b) laisser un lien discret
« + note » pour rouvrir un champ éteint.

**Raison** — (a) supposait de savoir **où** ces champs ne sont pas vides. Or
personne ne peut le dire depuis le dépôt : les cartes vivent dans Firestore,
sous l'uid, derrière la connexion Google. Il aurait fallu écrire un outil de
recensement jetable — du code, et un aller-retour de plus — pour une question
qui s'évapore si l'on accepte que l'extinction soit **progressive** : chaque
carte perd son encart le jour où on la repasse.

(b) réintroduirait exactement ce qu'on supprime. Un champ qu'on peut rouvrir
d'un clic n'est pas en extinction, c'est un champ replié.

Le coût assumé : une note vidée par erreur, puis enregistrée, est perdue — le
champ ne réapparaîtra pas. C'est le prix de l'irréversibilité, et il est faible
devant ce qu'on gagne (un éditeur à trois champs au lieu de cinq). Le terme
reste au glossaire, marqué *en extinction*, tant que des cartes en portent : le
retirer ferait mentir `carte.js`, qui les affiche encore.

---

## La bibliothèque de théorèmes : une entité à part, et à plat

**Choix** — Un **théorème** (`users/{uid}/theorems`, champs `title`,
`statement`, `sketch`) est une entité distincte de la carte, avec ses propres
écrans : une liste chercheable (`#/bibliotheque`), un détail
(`#/theoreme/{id}`), un éditeur. Il n'a **ni catégorie, ni ordre manuel** : la
liste est plate, triée par titre, et se filtre par une recherche plein texte
côté client. Aucune place dans un test : on ne tire pas de théorème.

**Alternative écartée** — (a) un champ `type` sur `card`, la bibliothèque
n'étant qu'un filtre ; (b) ranger les théorèmes dans les 12 titres du programme,
comme les cartes ; (c) les rattacher aux leçons d'oral où ils sont recasables.

**Raison** — (a) coûtait presque rien à écrire, et c'est exactement le piège :
le `type` aurait fuité partout. `nextCard` devrait l'exclure du tirage,
`countByCategory` le retrancher des compteurs, `faceCarte` choisir son montage,
l'éditeur masquer trois champs sur cinq. Un booléen dans les données, cinq `if`
dans le code, et deux notions qui se déforment l'une l'autre. Surtout : une
carte **pose une question** et se révèle en deux temps ; un théorème se lit d'un
bloc. Ce ne sont pas deux variantes d'une même chose.

(b) et (c) sont du rangement dont on n'a pas encore la preuve qu'il sert. Un
théorème traverse les titres du programme, et le geste qui compte vraiment
(« pour la leçon 106, qu'est-ce que je sors ? ») demanderait une entité `Leçon`
et ses ~100 titres — un chantier à lui seul, que `lecons.md` couvre déjà hors de
l'app. Une recherche plein texte répond dès aujourd'hui à « où j'ai parlé de
Baire ? », pour le prix d'un `filter`. Firestore étant sans schéma,
`categoryId` ou `lessons: []` s'ajouteront plus tard sans migration ni carte à
retoucher.

Le filtrage est **côté client** : Firestore ne sait pas chercher dans du texte,
et un filtre local est le seul qui marche hors ligne. À l'échelle d'une
préparation personnelle, tout charger puis filtrer en mémoire est le même
compromis que `countByCategory`. La recherche porte sur le **source**, donc sur
le LaTeX tel qu'il est tapé — pas de normalisation des macros : ce serait un
moteur de recherche, pas un filtre.

Reporté volontairement : les **images**. `images.js` s'y prêterait, mais
`champImages()` vit dans `editeur.js` et demanderait d'en être extrait. On livre
sans, on remplit la bibliothèque, on ajoutera si le manque se fait sentir.

---

## Renvois d'une carte vers un théorème

**Choix** — Une carte porte `theoremIds: string[]`, la liste des théorèmes
qu'elle cite. Les renvois s'affichent **avec le verso**, sous forme de boutons
qui **déplient le théorème en place** — on ne quitte pas la carte. L'autre bout
se lit sur la fiche du théorème (« Cité par »), obtenu par
`where('theoremIds', 'array-contains', id)`. Supprimer un théorème retire son id
des cartes qui le citent, dans le **même** `writeBatch` que la suppression.

**Alternative écartée** — (a) une syntaxe de lien dans le texte, façon
`[[Théorème de Dini]]`, rendue par `mathtext.js` ; (b) un lien de navigation
ordinaire vers `#/theoreme/{id}` ; (c) refuser la suppression d'un théorème
cité, comme on refuse celle d'un chapitre non vide.

**Raison** — (a) obligeait à choisir par quoi référencer, et les deux réponses
sont mauvaises : par **titre**, renommer un théorème casse tous les renvois sans
rien dire ; par **id**, on tape `[[a7Fk2…]]` à la main, ce qui exige de toute
façon un sélecteur — l'inline n'aurait donc rien économisé. Et ça faisait de
`mathtext.js` un producteur de HTML actif, alors que son invariant est
précisément d'échapper tout ce qui n'est pas une formule : c'est la seule chose
qui empêche une carte de casser la page. La syntaxe inline reste possible plus
tard **par-dessus** ce choix, les renvois étant déjà des ids.

(b) aurait cassé le test. `test.js` garde tout son état en mémoire — mode,
position, verso révélé : naviguer le perd, et l'on revient à un test qui repart
en aléatoire à la carte 1. Or le geste visé dure dix secondes (« l'énoncé exact,
c'était quoi ? »). D'où le dépliage.

Ce dépliage impose une contrainte qu'il faut tenir : `faceCarte()` est un
composant **pur**, sans accès au store. Ce sont donc les vues qui chargent les
théorèmes et les lui passent (`faceCarte(card, { back, theorems })`). Ce n'est
pas un détour : les **titres** doivent de toute façon s'afficher avant tout clic,
donc rien ne peut être chargé au clic. `test.js` lit la bibliothèque une fois au
démarrage — une requête, comme la bibliothèque elle-même.

(c) confondait deux relations. Un chapitre **contient** ses cartes, et les
supprimer avec lui détruirait des données ; un renvoi ne contient rien. Refuser
aurait imposé de lire toutes les cartes avant chaque suppression pour empêcher un
geste sans conséquence. Retirer les ids en cascade est plus juste que les laisser
mourir sur place : la donnée reste vraie, et l'atomicité du batch évite l'état
bâtard « théorème parti, renvois restés ». L'affichage reste malgré tout tolérant
à un id inconnu — un appareil hors ligne peut réécrire une carte avec un renvoi
périmé —, mais c'est un filet, pas le mécanisme.

Enfin, le renvoi ne s'affiche **jamais avant le verso** : nommer « Théorème de
Dini » sous une carte qui demande quel théorème donne la convergence uniforme,
c'est donner la réponse. Même règle que les images, pour la même raison.

