# app_revision

Glossaire du domaine : le vocabulaire de la révision active pour l'agrégation.
On parle français, on code en anglais — chaque terme porte donc sa traduction
dans le code, pour que le mot dit et le mot écrit se correspondent sans
ambiguïté.

## La carte et ses faces

**Carte** :
Une chose à ne pas oublier — une formule, un énoncé de théorème, ou une idée —
sous une forme interrogeable.
_Code_: `card`
_Éviter_: fiche, flashcard, item, note

**Titre** :
Le sujet de la carte, en quelques mots. Facultatif. Il nomme ce dont la carte
parle — il ne la pose pas ; c'est le recto qui demande quelque chose.
_Code_: `title`
_Éviter_: nom, intitulé, libellé, en-tête

**Recto** :
La face visible d'emblée : ce qui est demandé.
_Code_: `front`
_Éviter_: question, avant, face A

**Indication** *(en extinction)* :
Un coup de pouce, facultatif, que l'on demande explicitement quand on sèche —
avant de lire le verso. La révéler ne révèle pas la réponse. **On n'en
écrit plus** : l'éditeur ne montre le champ que sur une carte qui en porte déjà
une, et le vider l'éteint définitivement. Le terme reste au glossaire tant que
des cartes en portent.
_Code_: `hint`
_Éviter_: aide, indice, tip

**Verso** :
La face qui porte la réponse — celle qu'on ne lit qu'après avoir tenté de la
retrouver. **Facultatif** : une carte peut n'être qu'un recto. Ce qu'elle est
alors — une note qui se suffit, ou une question dont la réponse s'écrira plus
tard — ne se dit nulle part et ne se marque pas ; les deux sont légitimes.
_Code_: `back`
_Éviter_: réponse, solution, correction, face B

**Image** :
Une figure attachée à la réponse — schéma, courbe, démonstration écrite à la
main. Elle fait partie du verso : elle n'apparaît jamais avant lui.
_Code_: `images`
_Éviter_: photo, illustration, pièce jointe, figure

**Note** *(en extinction)* :
Un commentaire facultatif attaché à la carte, affiché **avec** le verso : le
piège classique, l'hypothèse qui mord, l'idée de preuve, le moyen mnémotechnique.
**On n'en écrit plus**, aux mêmes conditions que l'indication : ce qui est à dire
avec la réponse se dit désormais dans le verso.
_Code_: `note`
_Éviter_: remarque, commentaire, astuce

## L'écriture

**Aperçu** :
La carte **montée**, telle qu'elle se lira, vue depuis l'éditeur, à côté de la
saisie et redessinée à la frappe. Toutes ses faces d'un coup : c'est ce qu'on
regarde pendant qu'on écrit. C'est le **seul** endroit de
l'éditeur où le LaTeX est composé.
_Code_: `faceCarte()`
_Éviter_: prévisualisation, simulation, mode lecture, rendu

## L'organisation

**Catégorie** :
Le rangement d'une carte, calqué sur les titres du programme officiel.
_Code_: `category`
_Éviter_: chapitre, thème, tag, matière

**Ordre** :
La place d'une carte à l'intérieur de sa catégorie, décidée à la main. Deux
catégories ont chacune leur ordre ; il n'en existe pas de global.
_Code_: `order`
_Éviter_: rang, position, index, tri

**Carte non rangée** :
Une carte qui n'a pas encore reçu de place dans sa catégorie : elle vient d'être
créée, ou elle arrive d'une autre catégorie — où sa place ne voulait plus rien
dire. Elle passe après les cartes rangées, et le reste jusqu'à ce qu'on la range.
_Code_: carte sans `order` — `isPlaced(card)` est faux
_Éviter_: non classée, non triée, orpheline, en attente

## La bibliothèque

**Bibliothèque** :
Le rayon des entrées, à côté des cartes et séparé d'elles. On y **consulte** :
on cherche, on lit, on choisit quoi travailler. Elle est plate — ni chapitre, ni
ordre à la main — et les deux espèces d'entrée y sont mélangées, triées par
titre.
_Code_: route `#/bibliotheque`, collection `library`
_Éviter_: base, catalogue, fiches, recueil

**Entrée** :
Ce qu'on range en bibliothèque : un **théorème** ou une **définition**. Deux
espèces d'une même chose — un nom, un corps, un appui facultatif — qui se lisent
d'un bloc et ne s'interrogent pas. Le mot sert partout où la distinction ne
change rien : une liste d'entrées, une recherche d'entrées, un renvoi vers une
entrée.
_Code_: `entry`, collection `library`
_Éviter_: fiche, élément, item, notion (une définition définit une notion, elle
n'en est pas une)

**Espèce** :
Ce qui distingue un théorème d'une définition. Elle ne change **que les mots
affichés** — les champs, les écrans et les gestes sont les mêmes.
_Code_: `kind` — `'theorem'` ou `'definition'`
_Éviter_: type, catégorie (déjà pris par le rangement des cartes), genre

**Théorème** :
Un résultat qu'on veut garder sous la main, avec son énoncé et l'esquisse de sa
preuve. Une seule notion : on ne distingue pas ici le résultat qu'on présentera
à l'oral de celui qu'on se contentera de citer — ce jugement change trop souvent
pour tenir dans les données.
_Code_: entrée dont `kind` vaut `'theorem'`
_Éviter_: développement, résultat, lemme, propriété, énoncé (c'est une de ses parties)

**Définition** :
Ce qu'une notion **est**, exactement, avec ce qui aide à s'en servir : l'exemple
qui éclaire, le contre-exemple qui mord. Elle se range dans la même
bibliothèque et se cite dans les mêmes renvois qu'un théorème.
_Code_: entrée dont `kind` vaut `'definition'`
_Éviter_: notion, concept, énoncé, axiome

**Énoncé** *(sur un théorème)* / **Définition** *(sur une définition)* :
Le corps de l'entrée — ce qu'elle affirme ou ce qu'elle pose, hypothèses
comprises. La partie qu'on doit pouvoir citer juste. **Un seul champ**, deux
libellés : le mot change avec l'espèce, la donnée non. **Facultatif** : une
entrée peut n'être qu'un titre, née d'un renvoi posé depuis une carte, et se
remplir quand on repasse dessus.
_Code_: `statement`
_Éviter_: formulation, contenu, texte

**Esquisse** *(sur un théorème)* / **Remarques** *(sur une définition)* :
L'appui : ce qui aide à se servir de l'entrée. Pour un théorème, le squelette de
la preuve — les étapes et les leviers, pas la preuve rédigée. Pour une
définition, les exemples, contre-exemples et pièges. Facultatif, et il doit
tenir en un coup d'œil : une démonstration complète ferait de la bibliothèque un
cours, qu'on ne parcourt plus. **Un seul champ**, là encore.
_Code_: `support`
_Éviter_: démonstration, preuve, plan, note (déjà pris, et en extinction)

**Renvoi** :
Le geste par lequel une carte pointe vers une entrée de la bibliothèque —
théorème ou définition, indifféremment. Il appartient à la carte et va dans un
seul sens : l'entrée, elle, se contente d'afficher qui la cite. Un renvoi ne
contient rien : une carte privée du sien reste une carte entière.
Il s'affiche en bas de la carte, à moins qu'une **marque** ne le place ailleurs.
_Code_: `entryIds`
_Éviter_: lien, référence, citation, rattachement

**Marque** :
Ce qu'on écrit dans le texte d'une carte pour dire **où** un renvoi doit
apparaître : `{{renvoi: Théorème de Dini}}`, sur sa propre ligne. Elle ne dit que
le placement — le renvoi, lui, existe indépendamment d'elle. Une marque qui ne
désigne plus rien ne perd donc aucun renvoi : celui-ci retombe simplement en bas
de la carte. On ne la tape jamais : un bouton la pose au point de saisie.
_Code_: `marqueDe()`, `decoupe()`
_Éviter_: jeton, balise, ancre, lien, pastille (c'est la marque d'espèce, autre
chose)

**Cité par** :
L'autre bout du renvoi, vu depuis l'entrée : les cartes qui pointent vers elle.
Ce n'est pas une donnée de l'entrée — c'est une question posée aux cartes.
_Code_: `cardsCiting()`
_Éviter_: rétrolien, backlink, cartes liées
