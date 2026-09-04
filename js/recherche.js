// recherche.js — le filtre de la bibliothèque.
//
// Module PUR : pas de DOM, pas de réseau, pas de stockage. C'est le seul de
// l'app depuis le retrait du tirage, et donc la première cible le jour où on
// écrira de vrais tests.
//
// Le filtrage est **local** : on charge toute la bibliothèque, puis on filtre en
// mémoire. Firestore ne sait pas chercher dans du texte, et un filtre local est
// le seul qui marche hors ligne (docs/decisions.md, « La bibliothèque de
// théorèmes »).
//
// Limite assumée : la recherche porte sur le **source**, donc sur le LaTeX tel
// qu'il a été tapé. Chercher « epsilon » ne trouvera pas `\varepsilon`.
// Normaliser les macros, ce serait écrire un moteur de recherche ; ici on veut
// un filtre.

/**
 * Met un texte sous une forme comparable : sans accents, en minuscules.
 *
 * `NFD` sépare chaque lettre accentuée en (lettre + accent) ; on jette ensuite
 * les accents. C'est ce qui fait que « théorème » se trouve en tapant
 * « theoreme » — sans quoi il faudrait taper les accents justes pour retrouver
 * quoi que ce soit.
 */
export function normalise(texte) {
  return (texte || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Les théorèmes qui correspondent à la requête.
 *
 * La recherche porte sur les **trois** champs réunis (titre, énoncé, esquisse) :
 * chercher dans l'esquisse est un vrai geste — « quels théorèmes s'appuient sur
 * Baire ? » — et ça ne coûte pas une ligne de plus.
 *
 * Les mots de la requête sont exigés **tous** (et non l'un d'entre eux), dans
 * n'importe quel ordre : taper « dini uniforme » doit resserrer la liste, pas
 * l'élargir. Une requête vide ne filtre rien.
 */
export function filtre(theorems, requete) {
  const mots = normalise(requete).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return theorems;
  return theorems.filter((t) => {
    const foin = normalise(`${t.title} ${t.statement} ${t.sketch}`);
    return mots.every((m) => foin.includes(m));
  });
}
