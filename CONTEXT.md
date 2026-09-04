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
avant de retourner la carte. La révéler ne révèle pas la réponse. **On n'en
écrit plus** : l'éditeur ne montre le champ que sur une carte qui en porte déjà
une, et le vider l'éteint définitivement. Le terme reste au glossaire tant que
des cartes en portent.
_Code_: `hint`
_Éviter_: aide, indice, tip

**Verso** :
La face cachée : la réponse, révélée une fois l'effort de rappel fait.
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
La carte **montée**, telle qu'elle apparaîtra en test, vue depuis l'éditeur, à
côté de la saisie et redessinée à la frappe. Toutes ses faces d'un coup : rien
n'y est caché, rien ne s'y révèle — ce n'est donc pas un test sur une seule
carte, c'est ce qu'on regarde pendant qu'on écrit. C'est le **seul** endroit de
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
Le rayon des théorèmes, à côté des cartes et séparé d'elles. On y **consulte** :
on cherche, on lit, on choisit quoi travailler. On ne s'y fait pas interroger —
c'est ce qui la distingue d'un chapitre de cartes.
_Code_: route `#/bibliotheque`
_Éviter_: base, catalogue, fiches, recueil

**Théorème** :
Un résultat qu'on veut garder sous la main, avec son énoncé et l'esquisse de sa
preuve. Une seule notion : on ne distingue pas ici le résultat qu'on présentera
à l'oral de celui qu'on se contentera de citer — ce jugement change trop souvent
pour tenir dans les données.
_Code_: `theorem`
_Éviter_: développement, résultat, lemme, propriété, énoncé (c'est une de ses parties)

**Énoncé** :
Ce que le théorème affirme, hypothèses comprises. La partie qu'on doit pouvoir
citer juste.
_Code_: `statement`
_Éviter_: formulation, définition, théorème

**Esquisse** :
Le squelette de la preuve : les étapes et les leviers, pas la preuve rédigée.
Elle doit tenir en un coup d'œil — une démonstration complète ferait de la
bibliothèque un cours, qu'on ne parcourt plus.
_Code_: `sketch`
_Éviter_: démonstration, preuve, démo, plan, idée

**Renvoi** :
Le geste par lequel une carte pointe vers un théorème de la bibliothèque. Il
appartient à la carte et va dans un seul sens — le théorème, lui, se contente
d'afficher qui le cite. Un renvoi ne contient rien : une carte privée du sien
reste une carte entière.
_Code_: `theoremIds`
_Éviter_: lien, référence, citation, rattachement

**Cité par** :
L'autre bout du renvoi, vu depuis le théorème : les cartes qui pointent vers
lui. Ce n'est pas une donnée du théorème — c'est une question posée aux cartes.
_Code_: `cardsCiting()`
_Éviter_: rétrolien, backlink, cartes liées

## Le travail

**Test** :
Une suite de cartes d'une seule catégorie, présentées une par une, dans l'un des
deux modes ci-dessous.
_Code_: `quiz`
_Éviter_: session, révision, entraînement, exercice

**Mode aléatoire** :
Chaque carte est tirée au hasard, indépendamment des précédentes. Le test ne se
termine jamais, et une même carte peut retomber.
_Code_: `MODES.RANDOM`
_Éviter_: shuffle, mélange, tirage libre

**Mode dans l'ordre** :
Les cartes de la catégorie dans leur ordre, chacune une fois — les non rangées à
la fin. La passe **se termine** : c'est le seul endroit où « j'ai fait le tour »
veut dire quelque chose.
_Code_: `MODES.ORDERED`
_Éviter_: mode séquentiel, parcours, révision complète
