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

**Lien** :
Dans le texte, un passage cliquable qui mène à une autre carte — « cf. la démo
qui est là ». On choisit les mots qui le portent ; la carte citée s'ouvre à part,
sans quitter celle qu'on lit. Il désigne la carte elle-même, pas son titre :
renommer la cible ne le casse pas. Rien ne le tient à jour : si la carte citée
disparaît, le lien reste et ne mène plus nulle part. Il ne vise qu'une carte,
jamais une entrée.
_Code_: `[libellé](#/carte/{id})`
_Éviter_: renvoi (le mot de la fonctionnalité retirée), référence, citation

## L'organisation

**Catégorie** :
Le rangement d'une carte, quel que soit son niveau : un chapitre ou un
sous-chapitre. Une carte en a exactement une. Le mot sert partout où le niveau
ne change rien — ranger, déplacer, ordonner, compter les cartes.
_Code_: `category`
_Éviter_: thème, tag, matière, dossier

**Chapitre** :
Une catégorie de premier niveau, calquée sur un titre du programme officiel.
Il peut porter des cartes directement, des sous-chapitres, ou les deux à la
fois.
_Code_: catégorie sans `parentId`
_Éviter_: titre (c'est le mot du programme, et déjà celui d'une carte), section

**Sous-chapitre** :
Une catégorie rattachée à un chapitre, pour le découper. Il ne se découpe pas
lui-même.
_Code_: catégorie portant un `parentId`
_Éviter_: sous-catégorie, section, rubrique, partie, dossier

**Livres** :
Ce qu'on note sur les livres qui traitent une catégorie — lesquels, quelles
pages, ce qu'ils valent. Texte libre, facultatif, propre à chaque chapitre et à
chaque sous-chapitre : celui d'un chapitre ne reprend pas ceux de ses
sous-chapitres.
_Code_: `books`, sur la catégorie
_Éviter_: bibliographie, références, source (déjà pris, sur un théorème)

**Rattacher** :
Changer l'étage d'une catégorie : la placer sous un chapitre, ou la ramener au
premier niveau. Un seul geste couvre les trois cas — un chapitre qui devient
sous-chapitre, un sous-chapitre qui devient chapitre, un sous-chapitre qui
change de chapitre. Ses cartes ne changent pas de catégorie : elles gardent
leur place. Un chapitre qui a des sous-chapitres ne se rattache pas.
_Code_: `attachCategory()`
_Éviter_: convertir, promouvoir, rétrograder, déplacer (c'est ce qu'on fait
d'une carte)

**Ordre** :
La place d'une carte à l'intérieur de sa catégorie, décidée à la main. Deux
catégories ont chacune leur ordre ; il n'en existe pas de global. Un chapitre et
ses sous-chapitres sont des catégories distinctes : passer de l'un à l'autre, c'est
changer de catégorie.
_Code_: `order`
_Éviter_: rang, position, index, tri

**Carte non rangée** :
Une carte qui n'a pas encore reçu de place dans sa catégorie : elle vient d'être
créée, ou elle arrive d'une autre catégorie — où sa place ne voulait plus rien
dire. Elle passe après les cartes rangées, et le reste jusqu'à ce qu'on la range.
_Code_: carte sans `order` — `isPlaced(card)` est faux
_Éviter_: non classée, non triée, orpheline, en attente

**Voisine** :
La carte qui précède ou qui suit, dans sa catégorie : les cartes rangées dans
leur ordre, puis les non rangées. Une carte n'a pas de voisine hors de sa
catégorie — ni dans un sous-chapitre, ni dans le chapitre d'à côté.
_Code_: `voisines`, gestes « carte précédente » / « carte suivante »
_Éviter_: fiche suivante, adjacente, prochaine

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
change rien : une liste d'entrées, une recherche d'entrées.
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
bibliothèque qu'un théorème.
_Code_: entrée dont `kind` vaut `'definition'`
_Éviter_: notion, concept, énoncé, axiome

**Énoncé** *(sur un théorème)* / **Définition** *(sur une définition)* :
Le corps de l'entrée — ce qu'elle affirme ou ce qu'elle pose, hypothèses
comprises. La partie qu'on doit pouvoir citer juste. **Un seul champ**, deux
libellés : le mot change avec l'espèce, la donnée non. **Facultatif** : une
entrée peut n'être qu'un titre, et se remplir quand on repasse dessus.
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

**Source** *(sur un théorème)* :
Où la démonstration est faite en entier : un livre et sa page, un poly, un
rapport de jury. Elle dit **d'où lire**, jamais ce qu'il faut savoir — ce qui
doit tenir en tête vit dans l'énoncé et l'esquisse. Facultative, en texte libre,
et **propre au théorème** : une définition n'en porte pas, parce qu'on ne
démontre pas une définition.
_Code_: `source`
_Éviter_: référence, bibliographie, livre (une source n'est pas toujours un livre), preuve

## L'interro du jour

**Interro du jour** :
Cinq questions posées chaque jour, sur les thèmes déjà entamés, toujours dans le
même ordre : deux **énoncés piégeux**, deux **questions de base**, une
**démonstration**. Elle n'est écrite ni par l'utilisateur ni à partir de ses
cartes : elle est **générée**, et ne fait pas partie du fonds. On lit une
question, on cherche, puis on dévoile la réponse ; rien n'est noté. Une interro
par jour, ni plus ni moins.
_Code_: `daily`, route `#/interro`
_Éviter_: quiz, test, tirage (le mot de la fonctionnalité retirée), série

**Question** :
Un des cinq éléments d'une interro : ce qui est demandé, son thème, et la
réponse, cachée tant qu'on ne la demande pas. Une question n'est pas une carte :
elle ne se modifie pas, ne se range pas, ne se déplace pas.
_Code_: `question` — `{ theme, question, answer }`
_Éviter_: carte, recto, verso (ce sont les mots de la carte)

**Énoncé piégeux** :
Une question sur un théorème dont tout le poids est dans les hypothèses — on
le cite de travers dès qu'on en oublie une. La réponse donne l'énoncé exact, et
ce qui casse quand une hypothèse saute. Questions 1 et 2 d'une interro.
_Code_: nature `piege` dans la banque ; dans l'interro, sa place (1 et 2)
_Éviter_: question piège (rien n'y est caché), théorème difficile

**Question de base** :
Une définition, ou un résultat simple mais central, ou un exemple ou un
contre-exemple à produire. Questions 3 et 4 d'une interro.
_Code_: nature `base` dans la banque ; dans l'interro, sa place (3 et 4)
_Éviter_: question facile, question de cours (toutes le sont)

**Démonstration** *(dans une interro)* :
Une preuve à refaire, du niveau d'une première question d'écrit ou d'une
question d'oral : ni triviale ni longue. La réponse en donne l'idée, le plan et
les étapes justifiées. Question 5 d'une interro.
_Code_: nature `demonstration` dans la banque ; dans l'interro, sa place (5)
_Éviter_: développement (c'est un mot de l'oral, et plus long), exercice

**Thème** :
Un sujet du planning de la prépa, côté analyse ou côté algèbre — « Calcul
différentiel », « Groupes ». Les séances numérotées du planning (Groupes 1 et 2)
forment **un seul** thème, daté de la première. Un thème est **entamé** dès sa
date de début, et le reste. Ce n'est pas une catégorie : les catégories suivent
les titres du programme, les thèmes suivent le calendrier de la prépa.
_Code_: `theme`
_Éviter_: chapitre, catégorie, titre (trois mots déjà pris), bloc, séquence

**Banque** :
Toutes les questions des interros à venir, générées d'un coup jusqu'à la fin des
écrits et rangées par thème. Chaque question y porte son thème et sa nature. La
banque est **distribuée** sur le calendrier une fois pour toutes : chaque jour
reçoit son interro d'avance. Si le planning de la prépa bouge, on redistribue
les jours à venir.
_Code_: un fichier par thème, distribué par `interro.py plan`
_Éviter_: réserve (l'idée abandonnée d'un stock de sept jours), stock, base
(c'est la question de base), pool

**Nature** :
Ce qu'une question demande : un énoncé piégeux, une question de base, ou une
démonstration. Elle décide de la place de la question dans l'interro.
_Code_: `nature` — `piege`, `base`, `demonstration` (dans la banque seulement)
_Éviter_: type, espèce (c'est le mot des entrées), catégorie, genre
