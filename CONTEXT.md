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

**Indication** :
Un coup de pouce, facultatif, que l'on demande explicitement quand on sèche —
avant de retourner la carte. La révéler ne révèle pas la réponse.
_Code_: `hint`
_Éviter_: aide, indice, tip

**Verso** :
La face cachée : la réponse, révélée une fois l'effort de rappel fait.
_Code_: `back`
_Éviter_: réponse, solution, correction, face B

**Note** :
Un commentaire facultatif attaché à la carte, affiché **avec** le verso : le
piège classique, l'hypothèse qui mord, l'idée de preuve, le moyen mnémotechnique.
_Code_: `note`
_Éviter_: remarque, commentaire, astuce

## L'organisation

**Catégorie** :
Le rangement d'une carte, calqué sur les titres du programme officiel.
_Code_: `category`
_Éviter_: chapitre, thème, tag, matière

## Le travail

**Test** :
Une suite de cartes tirées au hasard dans une catégorie, présentées une par une.
_Code_: `quiz`
_Éviter_: session, révision, entraînement, exercice
