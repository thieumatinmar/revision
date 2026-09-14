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

> **Rouverte en partie** par « Sous-chapitres : un niveau, dans la même
> collection » : une carte a toujours une seule catégorie, mais les catégories
> ne sont plus une liste plate.

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

---

## Retrait du test : l'app devient un fonds, pas un interrogateur

**Choix** — Le tirage disparaît. `js/quiz.js`, `js/views/test.js`, la route
`#/test/…`, les deux modes (aléatoire, dans l'ordre), les boutons *Tester* et
les termes correspondants du glossaire sont retirés. Ce qui reste : saisir,
ranger, chercher, relire.

**Alternative écartée** — Garder le tirage en sommeil derrière un bouton peu
visible, « au cas où ».

**Raison** — L'usage réel a tranché : la phase en cours est une phase
d'**accumulation**, pas de restitution. Le tirage n'était pas utilisé, et
chaque évolution devait pourtant le maintenir cohérent — un écran, deux modes,
une révélation en deux temps à respecter dans le composant `faceCarte`, un
retour « vers le test en cours » à traverser dans l'éditeur. On payait
l'entretien d'une fonctionnalité dormante à chaque refonte.

Le garder en sommeil ne réglait rien : du code non utilisé mais toujours
importé continue de contraindre tout ce qu'il touche, et il pourrit sans qu'on
le sache — il n'y a aucun test pour le dire.

Le retrait est **réversible** : les deux fichiers restent dans l'historique git
(`git show ee3cbcc:js/quiz.js`), et le jour où la préparation passe en phase de
restitution, on les ressort — vraisemblablement sous une autre forme, puisque
l'unité de révision visée est désormais le **thème** et non la question isolée.

Ce que ça change dans le but affiché de l'app (`CLAUDE.md`) : elle n'est plus
un outil de rappel actif, c'est un **fonds structuré** — des théorèmes, des
définitions, et des cartes qui les citent. L'interrogation se fait ailleurs
(sessions de travail, papier). Le jour où elle revient dans l'app, elle
reviendra comme une fonctionnalité conçue pour ça, pas comme un reste.

---

## Théorèmes et définitions : deux espèces d'une même entrée

**Choix** — Une **entrée** (`users/{uid}/library/{id}`) porte une espèce
(`kind` : `'theorem'` ou `'definition'`) et trois champs communs : `title`,
`statement`, `support`. Un seul montage, une seule liste, un seul éditeur, une
seule recherche ; seuls les **libellés** changent — « Titre / Énoncé /
Esquisse » contre « Nom / Définition / Remarques » — et ils sont tous
regroupés dans `ESPECES` (`js/entree.js`). L'espèce n'apparaît dans une URL
qu'à la création (`#/entree/nouveau/definition`), seul moment où le document
n'existe pas encore.

**Alternative écartée** — (a) une collection `definitions` séparée, avec ses
propres écrans, copiés du théorème ; (b) deux collections réunies par un
`listLibrary()` ; (c) des noms de champs propres à chaque espèce (`name`,
`definition`, `notes` contre `title`, `statement`, `sketch`).

**Raison** — On avait refusé un champ `type` sur `card` (voir « La
bibliothèque de théorèmes »), et le cas est ici **symétrique inverse**. Ce
qui condamnait le `type` sur la carte, c'était la différence de
**comportement** : une carte pose une question et se révèle en deux temps, un
théorème se lit d'un bloc — le booléen aurait fuité dans le tirage, les
compteurs, le montage, l'éditeur. Entre un théorème et une définition, il n'y
a **aucune** différence de comportement : même forme, même lecture d'un bloc,
même recherche, mêmes renvois, jamais de tirage. Le `kind` ne fuite nulle part
— il ne sert qu'à choisir trois mots.

(a) faisait payer deux fois chaque évolution : le jour où les images arrivent en
bibliothèque (report volontaire, déjà acté), il faudrait les écrire dans deux
éditeurs. (b) déplace le problème au lieu de le supprimer : l'identifiant ne
suffirait plus à retrouver un document, donc l'espèce se remettrait à voyager
dans **toutes** les routes — exactement ce qu'on voulait éviter. (c) obligerait
le tri, la liste et la recherche à demander l'espèce avant de savoir quel champ
lire, et ferait de `recherche.js` — seul module pur de l'app — un module à cas
particuliers.

**Le nom de la collection a été changé**, `theorems` → `library`, plutôt que
gardé tel quel en assumant qu'il mente. Le renommage coûte une migration ; cette
migration a exactement le même coût aujourd'hui et dans six mois, mais pas le
même risque : aujourd'hui elle porte sur une poignée de documents et se vérifie
en trente secondes. Dans le même mouvement, `sketch` est devenu `support` (le
mot « esquisse » ne veut rien dire sur une définition) et `theoremIds` est
devenu `entryIds` sur les cartes (un renvoi peut désormais viser une
définition).

**La migration est non destructive**, et c'est la seule précaution possible
puisque l'app n'a **aucun export** : `migrateLibrary()` copie sans supprimer
(`theorems` reste en place comme sauvegarde, à effacer à la main dans la
console Firebase une fois le résultat constaté), conserve les identifiants (les
renvois pointent dessus), et sort d'elle-même dès que `library` est non vide.
Elle tourne à la connexion, comme `seedIfEmpty()` — il n'y a pas d'autre
endroit possible : pas de Node sur la machine, et les règles Firestore n'ouvrent
`users/{uid}` qu'à l'utilisateur connecté.

**À retirer plus tard** : `migrateLibrary()` et sa lecture de `theorems`, une
fois l'ancienne collection supprimée à la main.

---

## Ce qui nomme est obligatoire, ce qui développe est facultatif

**Choix** — Une carte n'exige que son **recto** ; le verso devient facultatif.
Une entrée n'exige que son **titre** ; l'énoncé (ou la définition) devient
facultatif. Aucun état, aucune pastille, aucun filtre ne distingue ce qui est
complet de ce qui ne l'est pas.

**Alternative écartée** — Marquer les cartes sans verso et les entrées sans
corps, d'une pastille dans la liste ou d'un filtre « à compléter ».

**Raison** — L'app est un **fonds** depuis le retrait du test : on y accumule.
Le geste réel est de capturer ce qui passe — un nom de théorème entendu, une
formule au tableau — quitte à revenir. Exiger le développement au moment de la
capture, c'est perdre la capture.

Une carte sans verso est tantôt une note qui se suffit, tantôt une question dont
la réponse s'écrira plus tard, et l'app **n'a pas à trancher** : c'est la même
donnée, et seul l'auteur sait laquelle des deux il a écrite. D'où le refus de
marquer : une pastille « incomplet » ferait passer la note achevée pour un
brouillon, et le suivi de ce qui reste à faire vit de toute façon hors de l'app
(voir « Pas de to-do dans l'app »).

La règle vaut **des deux côtés** parce que la création d'une entrée depuis une
carte fabrique précisément des entrées au titre seul : si l'éditeur d'entrée
continuait de les refuser, un écran rejetterait à l'enregistrement ce que
l'autre venait de créer.

---

## Créer une entrée depuis la carte, au titre seul

**Choix** — Le champ *Renvois* de l'éditeur de carte crée une entrée : on tape un
titre, on choisit l'espèce (deux boutons, `+ Théorème` / `+ Définition`), et
l'entrée est écrite en bibliothèque puis attachée, sans quitter l'écran. **Titre
seul** : ni énoncé ni appui. Les deux boutons apparaissent dès que la recherche a
du texte, y compris quand elle trouve.

**Alternative écartée** — (a) laisser l'interdiction précédente (« attacher,
c'est pointer vers ce qui existe ») ; (b) un formulaire complet en encart, avec
énoncé et esquisse ; (c) naviguer vers l'éditeur d'entrée et revenir.

**Raison** — (a) tombait sur l'usage : le moment où l'on réalise qu'un théorème
mérite sa fiche est précisément celui où on l'écrit dans une carte. Obliger à
sortir, créer, revenir — en perdant la carte en cours — faisait qu'on ne créait
pas, et que le renvoi n'existait jamais.

(b) mettait un second enregistrement dans un écran qui en a déjà un, et faisait
écrire une esquisse de preuve dans une boîte de trois centimètres. (c) coûtait de
porter l'état non enregistré de la carte à travers une navigation, ce que
l'app évite partout ailleurs (c'est déjà la raison du dépliage des renvois).

L'entrée créée est écrite **immédiatement**, et n'est pas défaite si l'on annule
la carte : deux enregistrements imbriqués dont l'un révoque l'autre seraient bien
plus surprenants qu'une entrée de trop, qui se supprime en deux clics.

Les boutons de création restent visibles même quand la recherche trouve : « Baire »
peut exister comme théorème alors qu'on veut citer la définition. Ce n'est pas un
rattrapage d'échec de recherche, c'est le cas normal.

---

## Placer un renvoi dans le texte : la marque

**Choix** — Une **marque** — `{{renvoi: Théorème de Dini}}`, sur sa propre ligne
du recto ou du verso — dit **où** un renvoi s'affiche. Elle ne porte pas le
renvoi : celui-ci reste dans `entryIds`, par identifiant. Un renvoi marqué
s'affiche à l'endroit de sa marque ; les autres restent dans le bloc « Voir
aussi », en bas, exactement comme avant. La marque se pose par un bouton
(`↓ ici`) au dernier point de saisie ; on ne la tape jamais. `js/marques.js`
(module pur) la lit, `js/carte.js` compose chaque segment de texte séparément et
intercale l'élément entre deux segments.

**Alternative écartée** — (a) le jeton **porte** le renvoi, et `saveCard`
reconstruit `entryIds` en scannant le texte ; (b) désigner l'entrée par son
identifiant (`{{renvoi:a7Fk2xY9}}`) ; (c) se contenter de choisir la face
(renvois du recto / renvois du verso), ou l'ordre des boutons.

**Raison** — Le renvoi ne s'affichait qu'après le verso, pour ne pas donner la
réponse pendant un tirage. Le tirage n'existe plus (voir « Retrait du test ») :
plus rien n'est caché, la contrainte est morte, et placer devient possible.

Le partage *quoi / où* est ce qui rend le mécanisme sûr, et c'est pour ça qu'on a
refusé (a) : aucune migration (les cartes existantes n'ont pas de marque et ne
bougent pas d'un pixel), aucun texte à réécrire quand une entrée est supprimée
(`deleteEntry` retire déjà l'identifiant ; la marque orpheline ne désigne
simplement plus rien), et `saveCard` n'a pas à rescanner le texte — donc le
« Cité par », qui repose sur `array-contains`, ne peut pas mentir. Une marque est
un **sur-placement** : sans elle, tout se comporte comme avant.

(b) rendait la source illisible : `{{renvoi: a7Fk2xY9}}` au milieu d'un verso ne
dit rien à la relecture. Le titre est possible **ici précisément** parce qu'il
n'est comparé qu'aux entrées attachées à cette carte — une à trois — et non à la
bibliothèque entière. Renommer une entrée ne casse donc pas un renvoi : la marque
cesse de résoudre, le renvoi retombe en bas, et l'aperçu le signale en rouge
plutôt que de déplacer un bloc en silence. Deux entrées attachées de même titre
(le théorème *et* la définition d'espace de Baire) ne sont pas départagées : on
refuse de deviner, pour la même raison.

(c) ne répondait pas au besoin — citer *à l'endroit du raisonnement où le
théorème sert* — et aurait de toute façon été rendu inutile par la marque.

Enfin, l'invariant de `mathtext.js` est **tenu** : il ne reçoit toujours que du
texte pur, jamais une syntaxe qu'il devrait transformer en HTML actif. C'était
l'objection principale à l'inline en 2026 ; le découpage la contourne au lieu de
la nier. Le préfixe `renvoi:` évite la confusion avec des accolades doublées de
LaTeX (`\frac{{a}}{b}`), et une marque ne peut pas contenir d'accolade — une
marque non fermée s'arrête ainsi au premier obstacle au lieu d'avaler le verso.


## La source d'un théorème : texte libre, et sur le théorème seul

**Choix** — Une entrée porte un champ `source` : où la démonstration est faite en
entier (livre et page, poly, rapport de jury). **Texte libre**, facultatif,
affiché en dernier et en petit, inclus dans le filtre de la bibliothèque. Il est
écrit en base pour les **deux** espèces, mais **seul le théorème l'expose** :
`ESPECES` ne lui donne un libellé — « Démonstration dans » — que pour le
théorème, et les écrans testent ce libellé, jamais l'espèce.

**Alternative écartée** — (a) une liste structurée `[{ book, page }]` ; (b) un
`if (kind === THEOREM)` dans chacun des trois écrans concernés (éditeur, montage,
recherche) ; (c) le libellé donné aussi à la définition.

**Raison** — Le besoin est modeste et il vaut mieux ne pas prétendre l'inverse :
retrouver, six mois plus tard, dans quel livre la preuve est écrite. Le filtre de
la bibliothèque étant déjà un filtre plein texte, ajouter `source` au foin donne
la quasi-totalité de ce que (a) promettait — taper « gourdon » sort la liste —
pour une ligne de code. (a) coûtait en revanche une interface à lignes
(ajouter/retirer), et surtout une **saisie normalisée** qu'on ne tiendrait pas :
au premier « gourdon, analyse » écrit à côté de « Gourdon *Analyse* », le
regroupement par livre ment, ce qui est pire que de ne pas l'offrir. Le texte
libre, lui, ne promet rien qu'il ne tienne. Un troisième argument a pesé : toutes
les sources ne sont pas des livres, et `{ book, page }` aurait obligé à mentir
sur la forme d'un poly ou d'un rapport de jury.

Sur (b) : la règle « seul un théorème indique où sa démonstration se lit » est
une règle d'**interface**, pas de données. L'écrire par l'absence d'un libellé
dans `ESPECES` la garde là où vivent déjà tous les mots d'espèce — un seul
endroit —, alors que trois `if (kind === THEOREM)` rouvriraient précisément la
brèche que « deux espèces d'une même entrée » avait fermée : l'espèce se remet à
voyager d'écran en écran. Conséquence directe et voulue : **la base garde un seul
schéma**, `source` vide sur une définition. `listEntries`, le tri et la recherche
n'ont donc jamais à connaître l'espèce avant de savoir quels champs lire — c'est
tout l'intérêt du document unique. Et si l'on change d'avis, ouvrir le champ aux
définitions est **une ligne** dans `ESPECES`, sans migration.

Sur (c) : rien n'interdit qu'une définition cite un livre, mais « Démonstration
dans » n'aurait pas de sens sur elle, et lui inventer un second libellé aurait
ajouté du vocabulaire pour un geste que Mathieu ne fait pas. On l'ouvrira le jour
où le manque se fera sentir, pas avant.

Rien à migrer : une entrée sans `source` est légitime, et c'est l'état de toutes
celles écrites jusqu'ici.

---

## Saisie en lot : un format texte délimité, jamais JSON

**Choix** — Le lot qu'on colle dans l'app est du **texte à lignes**, avec des
en-têtes en début de ligne : `@@ <type>` ouvre un enregistrement, `@ <champ>`
ouvre un champ, tout le reste est du contenu, pris tel quel.

**Alternative écartée** — JSON, le réflexe : `JSON.parse` est gratuit, le format
est sans ambiguïté et sait porter des tableaux.

**Raison** — JSON exige d'échapper l'antislash, c'est-à-dire exactement ce que
l'app sert à stocker. Le comportement mesuré est le pire possible, parce qu'il
est **mixte** :

    "\frac{a}{b}"     → parse SANS ERREUR → "\x0crac{a}{b}"   (formfeed + « rac »)
    "\begin{cases}"   → parse SANS ERREUR → "\x08egin{cases}" (backspace + « egin »)
    "\to"             → parse SANS ERREUR → tabulation + « o »
    "\neq"            → parse SANS ERREUR → saut de ligne + « eq »
    "\R"              → ERREUR de syntaxe

Le LaTeX standard traverse donc `JSON.parse` **silencieusement corrompu** — une
carte s'enregistre avec un caractère de contrôle à la place de sa formule, et
rien ne le signale —, tandis que les macros maison (`\R`, `\P`, `\dd`, `\ind`),
qui ne sont pas des échappements valides, font échouer le lot **entier**. Bruyant
sur ce qui nous appartient, muet sur ce qui est standard : les deux mauvais
comportements réunis.

Doubler tous les antislashs à la production supprimerait le problème, mais
reporte la charge sur la relecture : `$\int_0^1 f(t)\,\mathrm{d}t$` ne se
relit pas, et un lot qu'on ne peut pas relire avant de le coller est un lot qu'on
colle en aveugle.

Le texte délimité passe les antislashs tels quels — on écrit le LaTeX comme dans
l'éditeur — et **dégrade bien** : une ligne mal formée fait échouer *un*
enregistrement, pas les quarante autres.

Le prix assumé : un parseur maison là où `JSON.parse` était gratuit. Il est
**pur** (ni DOM, ni réseau, ni stockage) et rejoint `recherche.js` et
`marques.js` au rayon des modules testables — c'est-à-dire du côté du code dont
on sait vérifier le comportement, pas du côté de celui qu'on espère juste.

Trois choix à l'intérieur du format :

- **`@@` et `@` en début de ligne** — rien dans une carte ne commence une ligne
  par une arobase, ni le LaTeX, ni la prose. `##` aurait été plus familier, mais
  du markdown collé depuis ailleurs le produit.
- **Aucune donnée sur la ligne d'en-tête** (`@@ theoreme`, et le titre en champ).
  La forme courte `@@ theoreme: Théorème de Dini` aurait porté, sur une carte, le
  *chapitre* et non le titre : une asymétrie qui demandait un paragraphe de
  justification, donc une mauvaise forme. Chaque enregistrement se lit pareil.
- **Noms de champs en français**, ceux du glossaire, avec les deux libellés
  d'espèce (`enonce`/`esquisse` contre `definition`/`remarques`) menant au même
  champ stocké — le format parle la langue de l'interface, comme `ESPECES`.

> Ceci ne revient pas sur « Sync bidirectionnelle obligatoire (et non
> export/import manuel) » : celle-là écartait l'export/import comme **mécanisme
> de synchronisation entre appareils**, rôle que Firestore tient toujours seul.
> Ici, l'import est un **canal de saisie** — une alternative à taper au clavier,
> pas au transfert.

---

## L'éditeur est un plan de travail, pas un document

**Choix** — Au-dessus de 900 px, l'écran d'édition tient dans la hauteur de la
fenêtre : la page ne défile plus, chaque volet défile pour lui. Les zones de
saisie épousent leur contenu au lieu d'ouvrir une fenêtre de huit lignes, et
l'aperçu **vient chercher le curseur** — il amène sous les yeux le bloc qu'on est
en train d'écrire, et le souligne d'un liseré.

**Alternative écartée** — Garder le défilement de page et l'aperçu en `sticky`,
en se contentant de borner sa hauteur. Une ligne de CSS au lieu de trois fichiers
touchés.

**Raison** — Le défaut n'était pas cosmétique, il était structurel : *rien ne
défilait indépendamment*. L'aperçu collé ne pouvait pas suivre le curseur, faute
d'avoir quoi que ce soit à faire défiler, et sur un verso long il fallait pousser
la page entière — ce qui emportait la barre *Enregistrer* et l'en-tête avec.
Trois barres de défilement imbriquées (la zone de saisie, la page, l'aperçu) pour
un seul geste : écrire.

Ce qui rend le suivi possible est le point non-évident, et c'est là qu'est le
vrai coût. Un verso composé en **un seul nœud** ne dit pas *où* l'on écrit. Il
fallait donc des ancres, d'où trois changements en cascade :

- `mathtext.js` sait découper une source en **blocs** séparés par une ligne vide,
  parce qu'il est le seul à savoir ce qu'est un délimiteur : un `$$…$$` à cheval
  sur une ligne vide ne doit pas être coupé, sans quoi KaTeX signale deux moitiés
  fausses. Le séparateur reste collé au bloc qui précède — le texte s'affiche en
  `pre-wrap`, et le jeter changerait l'espacement de toutes les cartes.
- `marques.js` fait porter à chaque segment de texte sa **position dans la
  source**. Elle ne se retrouve pas après coup : les segments sont rognés.
- `carte.js` compose un nœud par bloc, étiqueté de sa face et de sa position.

Rien n'y change à l'œil : le découpage suit les lignes vides, qui séparaient
déjà. Ce qu'on y gagne est une carte montée où l'on peut **désigner un endroit**,
et le principe vaudra au-delà de l'aperçu.

Deux réglages qui ne se devinent pas :

- **On ne fait défiler que si le bloc est hors champ.** Réaligner à chaque frappe
  ferait sauter l'aperçu à chaque retour à la ligne — pire que de scroller
  soi-même. Le liseré, lui, suit toujours : sans repère, on ne saurait pas si
  l'aperçu a suivi ou s'il regarde ailleurs.
- **Les zones de saisie grandissent au lieu de défiler.** Une hauteur fixe
  imbrique le défilement du champ dans celui de la colonne, et on passe son temps
  à faire glisser la mauvaise des deux barres. `resize` disparaît du même coup :
  la frappe suivante reprendrait la main sur la hauteur, et une poignée qui se
  fait défaire toute seule est pire que pas de poignée.

Sous 900 px, rien de tout cela ne s'applique — un visage à la fois, la page
défile comme avant. C'est le chemin étroit, pas le cas nominal : la saisie se
fait sur PC.

## Enregistrer sans quitter — Ctrl+S

**Choix** — `Ctrl+S` (`Cmd+S`) enregistre et **reste** sur l'écran, dans les deux
éditeurs. Le bouton *Enregistrer* garde son sens : enregistrer **et** partir. En
création, le premier raccourci fabrique le document, l'éditeur **adopte
l'identifiant** rendu par le store, et l'adresse passe de « nouvelle » à
« modifier » par `history.replaceState`.

**Alternative écartée** — un second bouton *Enregistrer et rester* à côté du
premier. Deux boutons voisins qui ne diffèrent que par ce qu'ils font *après*
obligent à lire avant chaque clic, pour un geste qu'on répète toutes les deux
minutes. Le raccourci ne coûte rien à l'écran, et c'est celui que tout le monde
a déjà dans les doigts.

**Raison** — La saisie d'une carte un peu fournie dure dix minutes, et jusqu'ici
le seul moyen de la mettre à l'abri était de quitter l'écran, donc de perdre le
fil. Le vrai besoin n'est pas d'enregistrer plus souvent, c'est de ne pas avoir à
choisir entre « je sécurise ce que je viens de taper » et « j'ai fini ».

Le point non-évident est **l'adoption de l'identifiant**. `saveCard` et
`saveEntry` créent quand on ne leur donne pas d'`id` : sans adoption, un second
raccourci sur une carte qui vient de naître en créerait une deuxième, puis une
troisième — et l'écran continuerait d'afficher la première. D'où trois
conséquences en cascade :

- **L'adresse doit suivre.** Elle annonçait une création alors que le document
  existe ; un rechargement rendait un formulaire vide sur du contenu déjà en
  base. `replaceState` la corrige **sans** déclencher `hashchange`, donc sans
  relancer le rendu ni perdre la saisie en cours.
- **Les liens de sortie doivent suivre.** Le chapitre est un champ du formulaire :
  après un enregistrement qui l'a changé, *Annuler* renverrait vers le chapitre
  d'où la carte vient de partir. Ils sont donc recalculés, pas figés au montage.
- **Supprimer doit apparaître.** Le bouton n'existait qu'en modification. « Pas
  encore enregistrée » est désormais un état qui se termine sans quitter l'écran,
  et la zone est construite dans les deux cas, dévoilée à l'adoption.

Un **verrou** (`enCours`) garde l'écriture : un `Ctrl+S` maintenu lancerait deux
créations concurrentes, dont aucune ne porterait l'identifiant que l'autre vient
d'adopter.

L'écouteur vit sur `document` et non sur la racine de l'écran — le geste doit
marcher même quand le focus a quitté le formulaire — et **se retire lui-même**
dès qu'il constate que son écran a quitté la page : la coque ne prévient jamais
une vue qu'elle est remplacée. Le contrôle tourne avant même de regarder la
touche, donc un orphelin disparaît à la première frappe qui suit une navigation.

**Limite assumée** — le titre d'en-tête continue d'afficher « Nouvelle carte »
après le premier enregistrement. `ctx.setTitle` n'est lu qu'avant l'attache de la
vue ; ouvrir une porte dans la coque pour ce seul mot coûterait plus que le
défaut, que le témoin *Enregistré à …* dément de toute façon.

## Coller une image dans une carte

**Choix** — Dans l'éditeur de carte, `Ctrl+V` d'une image l'ajoute aux images,
**où que soit le focus**. Même tuyau que le bouton (réduction, budget), et la
réponse s'affiche dans le **témoin** de la barre d'actions. Règle de priorité :
si le presse-papiers porte du **texte** et que le focus est dans une zone de
saisie, le collage texte gagne et aucune image n'est prise. Cartes seulement :
les entrées n'ont toujours pas d'images.

**Alternative écartée** — (a) coller seulement quand le focus est sur le champ
*Images* ; (b) faire défiler jusqu'au champ *Images* pour montrer l'ajout.

**Raison** — Le geste réel est *capture d'écran, Ctrl+V*, en pleine rédaction du
verso. (a) imposait un clic de visée à chaque fois ; (b) arrachait le curseur du
texte qu'on écrit. Le témoin est déjà la réponse visible d'un geste clavier
(Ctrl+S) : il sert ici au même titre.

La règle de priorité est le point non-évident. Copier depuis Word, OneNote ou une
page web met **texte et image** dans le presse-papiers ; sans elle, coller un
paragraphe dans le verso ajouterait une image fantôme. Une capture d'écran ne
porte qu'une image, donc le cas nominal n'est pas touché. Prix assumé : pour
coller l'image d'un contenu Word, il faut cliquer hors d'une zone de saisie.

## Dupliquer une carte

**Choix** — Un bouton ⧉ sur chaque ligne de la liste d'un chapitre écrit la
copie **en base, tout de suite**, sans ouvrir l'éditeur (`duplicateCard`,
store.js). La copie emporte tous les champs, renvois et images compris. Son titre
est suffixé de « (copie) » — ou vaut « (copie) » seul si l'original n'en a pas.
Si l'original est **rangé**, la copie prend la place juste après lui et les
suivantes descendent ; s'il ne l'est pas, la copie ne l'est pas non plus.

**Alternative écartée** — (a) ouvrir un éditeur pré-rempli, sans rien écrire
avant l'enregistrement ; (b) une copie non rangée, comme toute carte créée ;
(c) une copie identique, sans marque.

**Raison** — On duplique pour faire une variante, et la variante se lit à côté
de ce dont elle varie : c'est ce qui justifie l'écart à la règle « une carte naît
non rangée » (b). La marque (c) est le prix de la contiguïté : deux lignes identiques côte à côte, on ne
sait plus laquelle on vient de créer. Sur une carte sans titre, elle devient le
titre plutôt que de toucher au recto.

Copie et renumérotation partent dans **un seul `writeBatch`** : un échec entre
les deux laisserait une copie sans place, ou un trou dans l'ordre. Le non-rangé
reste non rangé parce que cette zone est triée par identifiant aléatoire :
« juste après » n'y existe pas. Prix assumé de (a) écarté : un clic de trop
laisse un doublon en base, qu'on supprime à la main.

---

## Sous-chapitres : un niveau, dans la même collection

**Choix** — Un chapitre peut être découpé en **sous-chapitres**, sur **un seul
niveau** : un sous-chapitre ne se découpe pas. Concrètement :

- **Données** — même collection `categories`, avec un champ facultatif
  `parentId`. Sans lui, c'est un chapitre ; avec, un sous-chapitre. Une carte
  garde un unique `categoryId`, qui pointe vers l'un ou l'autre. `order` devient
  un ordre **entre frères**. C'est `store.js` qui refuse un `parentId` désignant
  un sous-chapitre : la base, elle, ne garantit pas le niveau unique.
- **Mélange autorisé** — un chapitre peut porter à la fois des cartes et des
  sous-chapitres.
- **Accueil** — les chapitres seuls, avec un compteur **cumulé** (cartes propres
  + cartes des sous-chapitres). L'écran d'un chapitre montre ses sous-chapitres,
  puis ses propres cartes.
- **Recherche** — dans l'écran d'un chapitre, elle couvre aussi ses
  sous-chapitres ; chaque résultat venu d'un sous-chapitre en porte le nom.
- **Gestion** — tout dans l'écran « Gérer » : sous-chapitres indentés sous leur
  chapitre, mêmes gestes (renommer, ↑/↓ entre frères, ×), un champ de création
  par chapitre. Supprimer un sous-chapitre non vide est refusé ; supprimer un
  chapitre qui a des sous-chapitres, même vides, aussi.
- **Déplacer une carte** — un seul `<select>` listant l'arbre, sous-chapitres
  indentés par préfixe de texte. Changer de catégorie fait perdre la place, entre
  un chapitre et ses sous-chapitres comme ailleurs.
- **Niveau figé** — une catégorie naît chapitre ou sous-chapitre et le reste :
  ni changement de parent, ni promotion, ni rétrogradation. *Rouvert le
  lendemain : voir « Rattacher une catégorie ».*

**Alternative écartée** — (a) un arbre à profondeur libre ; (b) une collection
`subcategories` à part, avec un `subcategoryId` sur la carte ; (c) interdire les
cartes directement dans un chapitre découpé ; (d) l'arbre déplié sur l'accueil ;
(e) une recherche limitée aux cartes propres du chapitre.

**Raison** — Cette entrée **rouvre** « Une seule catégorie par carte, en liste
plate », qui avait écarté l'arborescence au nom de « un test = une catégorie = un
tirage ». Le test a été retiré depuis : la raison est tombée, et un chapitre de
programme de plusieurs dizaines de cartes ne se relit plus d'un bloc.

Le reste suit une seule ligne : **l'état existant doit rester légitime**. Sans
`parentId`, les douze chapitres sont déjà des chapitres — ni migration, ni règle
Firestore à revoir, puisque tout reste sous `users/{uid}/categories`. Le mélange
autorisé (c) évite de devoir reclasser tout un chapitre au moment d'y créer le
premier sous-chapitre, et d'inventer un « divers » — la zone fourre-tout déjà
refusée pour les catégories. Une collection à part (b) aurait mis sur la carte
deux champs à tenir cohérents entre eux, désaccordables depuis un appareil hors
ligne ; avec un seul `categoryId`, l'incohérence n'est pas écrivable, et
`listCards`, `moveCard`, l'ordre et le refus de suppression marchent tels quels.

Le niveau unique et figé coupe tout le coût d'un arbre — rendu récursif, cycles,
déplacement d'un nœud avec ses enfants — pour un besoin réel qui tient en un
découpage. Le compteur cumulé et la recherche étendue (e) répondent au même
piège : sans eux, **découper un chapitre le ferait paraître vidé**, et la
recherche mentirait d'autant plus qu'on range finement.

Prix assumés : créer une carte dans un sous-chapitre depuis l'accueil coûte un
tap de plus ; un sous-chapitre créé sous le mauvais chapitre se recrée, et ses
cartes redeviennent non rangées. Le jour où ça gêne, changer de parent n'est
qu'une réécriture de `parentId` — les cartes ne bougent pas. La recherche étendue
passe par des requêtes `in`, découpées en tranches de 30 identifiants (le
plafond Firestore) : le nombre de sous-chapitres n'est donc pas borné.

---

## Rattacher une catégorie

**Choix** — Un seul geste, **Rattacher à…**, dans l'écran « Gérer » : un
sélecteur sous la ligne, qui propose « — Chapitre (aucun parent) » puis les
chapitres. Il couvre la promotion d'un sous-chapitre, la rétrogradation d'un
chapitre et le changement de parent. Trois règles :

- **Refus** pour un chapitre qui a des sous-chapitres : il ne peut que rester
  chapitre. Le niveau unique tient toujours, et c'est `attachCategory` (store.js)
  qui le garantit, comme `createCategory` à la création.
- **Place** — la catégorie arrive à la fin de ses nouveaux frères. Anciens et
  nouveaux frères sont renumérotés de 0, dans le même `writeBatch` que le
  changement de `parentId`.
- **Cartes intactes** — aucune écriture sur les cartes : même `categoryId`, même
  place, même état rangé ou non.

**Alternative écartée** — (a) trois boutons distincts, sans changement de parent
direct ; (b) sur un chapitre découpé, aplatir ses sous-chapitres sous le nouveau
parent, ou (c) les promouvoir en chapitres ; (d) placer un sous-chapitre promu
juste après son ancien parent.

**Raison** — Rouvre « Niveau figé », décidé la veille faute de besoin concret :
le besoin est venu, et le modèle avait été choisi pour que ce soit bon marché.

Les trois opérations sont **une seule écriture** — poser ou retirer `parentId` —
et un seul geste l'exprime ; trois boutons auraient été trois chemins de code, et
changer de parent aurait coûté deux gestes avec un état intermédiaire visible.
Le refus sur un chapitre découpé suit la règle de la suppression : rien ne bouge
par effet de bord, et aplatir (b) ou libérer (c) auraient été des choix
arbitraires faits à ta place, sur trois catégories d'un coup. La fin de liste
est la règle de la création ; « juste après l'ancien parent » (d) ne veut rien
dire pour un changement de parent.

Les cartes ne perdent pas leur place parce qu'elles **ne changent pas de
catégorie** : c'est la catégorie qui change d'étage. La règle « changer de
catégorie fait perdre la place » ne s'applique donc pas.

Prix assumé : promouvoir n'est pas un bouton visible, c'est l'option « aucun
parent » d'un sélecteur ; dissoudre un chapitre découpé coûte un geste par
sous-chapitre.
