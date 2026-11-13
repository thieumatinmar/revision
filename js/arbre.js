// arbre.js — l'arbre des catégories, calculé depuis leur liste plate.
//
// Module PUR, comme `recherche.js` : ni DOM, ni réseau, ni store. Il reçoit des
// catégories déjà lues et ne fait que calculer. C'est la logique la plus facile
// à casser en silence (récursion, cycles, niveaux), donc la prochaine cible le
// jour où on écrira de vrais tests.
//
// Le modèle (docs/decisions.md, « Trois niveaux de catégories ») :
//
//   - une catégorie sans `parentId` est un **chapitre** (niveau 1) ;
//   - une catégorie avec `parentId` est un **sous-chapitre** de son **parent
//     direct** — chapitre ou sous-chapitre ;
//   - trois niveaux au plus (`MAX_DEPTH`). Le plafond n'est garanti par rien
//     dans la base : ce sont `createCategory` et `attachCategory` (store.js) qui
//     le tiennent, en demandant leur refus aux deux fonctions d'en bas.
//
// Deux formes de l'arbre circulent :
//
//   - l'**arbre** (`buildTree`) : les chapitres, chacun portant `children`,
//     récursivement. C'est la forme pour dessiner une hiérarchie ;
//   - la **liste à plat** (`flattenTree`) : l'arbre lu de haut en bas, chaque
//     catégorie suivie de ses sous-chapitres, chacune portant `depth` (0, 1, 2).
//     C'est la forme d'un `<select>`, et celle sur laquelle travaillent toutes
//     les fonctions de ce module : dans une liste à plat, les descendants d'une
//     catégorie sont **les éléments qui la suivent avec une profondeur plus
//     grande**, jusqu'au premier qui remonte à son niveau. Pas de récursion à
//     écrire, et donc pas de cycle possible.

/** Nombre de niveaux de l'arbre : chapitre, sous-chapitre, sous-chapitre de sous-chapitre. */
export const MAX_DEPTH = 3;

/**
 * L'arbre des catégories, à partir de leur liste plate **triée par `order`**
 * (c'est l'ordre de `listCategories`) : les frères gardent l'ordre de lecture.
 *
 * Filet, contre ce que la base peut contenir malgré les refus du store — deux
 * appareils hors ligne qui écrivent chacun une opération valide :
 *
 *   - un sous-chapitre dont le parent n'existe plus devient une **racine** :
 *     le faire disparaître rendrait ses cartes introuvables ;
 *   - un **cycle** (A sous B et B sous A) ne descend d'aucun chapitre. Ses
 *     membres sont repris dans l'ordre de lecture : le premier devient racine,
 *     le reste se rattache sous lui, et l'ensemble des catégories visitées
 *     coupe la boucle ;
 *   - un niveau 4 s'affiche tel quel. Rien n'est tronqué.
 *
 * Les nœuds renvoyés sont des **copies** : ajouter `children` ne touche pas la
 * liste plate de l'appelant.
 */
export function buildTree(categories) {
  const ids = new Set(categories.map((c) => c.id));
  // Les enfants de chaque parent, dans l'ordre de lecture.
  const enfants = new Map();
  categories.forEach((c) => {
    if (!c.parentId) return;
    if (!enfants.has(c.parentId)) enfants.set(c.parentId, []);
    enfants.get(c.parentId).push(c);
  });

  const vues = new Set();
  // Descente en profondeur : chaque catégorie n'est posée qu'une fois, même si
  // les données bouclent.
  const noeud = (c) => {
    vues.add(c.id);
    const fils = (enfants.get(c.id) || []).filter((f) => !vues.has(f.id));
    return { ...c, children: fils.map(noeud) };
  };

  const estRacine = (c) => !c.parentId || !ids.has(c.parentId);
  const racines = categories.filter(estRacine).map(noeud);
  // Ce qui reste n'est relié à aucun chapitre : un cycle, et ce qui pend dessous.
  categories.forEach((c) => { if (!vues.has(c.id)) racines.push(noeud(c)); });
  return racines;
}

/**
 * L'arbre remis à plat, dans l'ordre de lecture : chaque catégorie suivie de
 * ses sous-chapitres. Chaque élément porte `depth` (0 pour un chapitre) et plus
 * de `children`. Le libellé (indentation) appartient à la vue.
 */
export function flattenTree(roots, depth = 0) {
  return roots.flatMap(({ children, ...cat }) => [
    { ...cat, depth },
    ...flattenTree(children, depth + 1),
  ]);
}

/** Position d'une catégorie dans la liste à plat, ou -1. */
const indexOf = (flat, id) => flat.findIndex((c) => c.id === id);

/**
 * Les descendants d'une catégorie — sous-chapitres, et leurs sous-chapitres —
 * dans l'ordre de lecture, sans la catégorie elle-même.
 */
export function descendantsOf(flat, id) {
  const i = indexOf(flat, id);
  if (i < 0) return [];
  const sous = [];
  for (let j = i + 1; j < flat.length && flat[j].depth > flat[i].depth; j++) sous.push(flat[j]);
  return sous;
}

/** Les sous-chapitres **directs** d'une catégorie, dans leur ordre. */
export function childrenOf(flat, id) {
  const i = indexOf(flat, id);
  if (i < 0) return [];
  return descendantsOf(flat, id).filter((c) => c.depth === flat[i].depth + 1);
}

/**
 * Les ancêtres d'une catégorie, du chapitre au parent direct. Vide pour un
 * chapitre. On remonte la liste à plat : le parent est le premier élément
 * précédent d'un niveau de moins, et ainsi de suite.
 *
 * Lu dans l'arbre **affiché**, pas dans `parentId` : une catégorie que le filet
 * a faite racine n'a pas d'ancêtre, même si son `parentId` désigne quelqu'un.
 */
export function ancestorsOf(flat, id) {
  const i = indexOf(flat, id);
  if (i < 0) return [];
  const chaine = [];
  let niveau = flat[i].depth;
  for (let j = i - 1; j >= 0 && niveau > 0; j--) {
    if (flat[j].depth === niveau - 1) {
      chaine.unshift(flat[j]);
      niveau -= 1;
    }
  }
  return chaine;
}

/**
 * Nombre de niveaux **sous** une catégorie : 0 si elle n'est pas découpée, 1 si
 * ses sous-chapitres ne le sont pas, etc.
 */
export function heightOf(flat, id) {
  const i = indexOf(flat, id);
  if (i < 0) return 0;
  return descendantsOf(flat, id).reduce((h, c) => Math.max(h, c.depth - flat[i].depth), 0);
}

/** Une catégorie peut-elle être découpée ? Non au dernier niveau. */
export const canHaveChildren = (cat) => cat.depth < MAX_DEPTH - 1;

/**
 * Pourquoi on ne peut **pas** créer un sous-chapitre sous `parentId` — ou
 * `null` si on peut. Sans `parentId`, c'est un chapitre : toujours permis.
 */
export function createRefusal(flat, parentId) {
  if (!parentId) return null;
  const parent = flat[indexOf(flat, parentId)];
  if (!parent) return 'Catégorie parente introuvable.';
  if (!canHaveChildren(parent)) return `« ${parent.name} » est au dernier niveau : il ne se découpe pas.`;
  return null;
}

/**
 * Pourquoi on ne peut **pas** rattacher la catégorie `id` sous `targetId` — ou
 * `null` si on peut. `targetId` nul : ramener au premier niveau.
 *
 * Le sous-arbre suit la catégorie (docs/decisions.md, « Trois niveaux de
 * catégories ») : ses descendants descendent ou remontent avec elle. D'où deux
 * refus, en plus des introuvables :
 *
 *   - **cycle** — la cible est la catégorie elle-même ou l'un de ses
 *     descendants : le sous-arbre ne serait plus relié à aucun chapitre ;
 *   - **profondeur** — son descendant le plus bas arriverait sous le dernier
 *     niveau.
 *
 * Remonter au premier niveau n'est jamais refusé : ça ne fait que raccourcir.
 * C'est cette fonction que `attachCategory` consulte avant d'écrire, et que
 * l'écran « Gérer » consulte pour ne proposer que des cibles valides — une
 * seule règle, lue aux deux endroits.
 */
export function attachRefusal(flat, id, targetId) {
  const cat = flat[indexOf(flat, id)];
  if (!cat) return 'Catégorie introuvable.';
  if (!targetId) return null;
  if (targetId === id) return 'Une catégorie ne se rattache pas à elle-même.';
  const cible = flat[indexOf(flat, targetId)];
  if (!cible) return 'Catégorie parente introuvable.';
  if (descendantsOf(flat, id).some((c) => c.id === targetId)) {
    return `« ${cible.name} » est sous « ${cat.name} » : une catégorie ne se range pas sous elle-même.`;
  }
  const hauteur = heightOf(flat, id);
  // Profondeur 0-indexée du plus bas descendant, une fois rattaché.
  if (cible.depth + 1 + hauteur > MAX_DEPTH - 1) {
    return hauteur === 0
      ? `« ${cible.name} » est au dernier niveau : il ne se découpe pas.`
      : `Sous « ${cible.name} », les sous-chapitres de « ${cat.name} » dépasseraient le `
        + `${MAX_DEPTH}e niveau.`;
  }
  return null;
}
