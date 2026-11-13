// store.js — seule porte d'entrée vers les données.
//
// Aucune vue ne lit ni n'écrit autrement qu'à travers ce fichier. C'est ce qui a
// permis de remplacer le stockage en mémoire par Firestore sans toucher un seul
// écran : les signatures n'ont pas bougé.
//
// Arborescence dans Firestore :
//
//   users/{uid}/categories/{id}   { name, order, parentId?, books? }
//   users/{uid}/cards/{id}        { categoryId, title, front, hint, back, note,
//                                   images: string[], order? }
//   users/{uid}/library/{id}      { kind, title, statement, support, source }
//   users/{uid}/daily/{AAAA-MM-JJ} { date, questions: [{ id, theme, question, answer }] }
//   users/{uid}/marks/{idQuestion} { mark, day, updatedAt }
//   users/{uid}/push/phone        { subscription, updatedAt }
//
// Sur une carte, `order` est **facultatif** : son absence signifie « non rangée »,
// c'est-à-dire pas encore placée dans son chapitre. Un seul état, une seule
// écriture — les cartes écrites avant cette fonctionnalité sont déjà dans cet
// état, il n'y a donc rien à migrer.
//
// `images` contient des data URL, donc les images elles-mêmes, pas des liens.
// C'est ce qui les fait suivre la carte sans Firebase Storage — au prix du
// plafond de 1 Mo par document, tenu par `js/images.js`.
//
// Tout est rangé **sous l'identifiant de l'utilisateur**, et les règles publiées
// n'autorisent `users/{userId}` qu'à l'uid correspondant. C'est cette forme
// d'arborescence qui rend la règle de sécurité tenable en une ligne ; la changer
// obligerait à revoir les règles.

import { db } from './firebase.js';
import { currentUid } from './auth.js';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, deleteField,
  writeBatch, query, where, orderBy, documentId,
} from '../vendor/firebase/firebase-firestore.js';
import {
  buildTree, flattenTree, descendantsOf, ancestorsOf, createRefusal, attachRefusal,
} from './arbre.js';

/** Les 12 titres du programme officiel 2027 (../ressources/programme_officiel_2027.md). */
const TITRES = [
  'Algèbre linéaire',
  'Groupes',
  'Anneaux, corps et polynômes',
  'Formes bilinéaires et quadratiques',
  'Géométries affine et euclidienne',
  'Analyse à une variable réelle',
  'Analyse à une variable complexe',
  'Topologie',
  'Calcul différentiel',
  'Calcul intégral',
  'Probabilités et statistiques',
  'Méthodes numériques',
];

/** Chemin d'une collection de l'utilisateur courant. */
function col(nom) {
  const uid = currentUid();
  if (!uid) throw new Error('Non connecté.');
  return collection(db, 'users', uid, nom);
}

function ref(nom, id) {
  const uid = currentUid();
  if (!uid) throw new Error('Non connecté.');
  return doc(db, 'users', uid, nom, id);
}

/** Un document Firestore → un objet simple portant son identifiant. */
const toObj = (d) => ({ id: d.id, ...d.data() });

// ---------------------------------------------------------------- Catégories
//
// Trois niveaux au plus, **une seule collection** (docs/decisions.md,
// « Sous-chapitres » puis « Trois niveaux de catégories ») :
//
//   - un **chapitre** ne porte pas de `parentId` ;
//   - un **sous-chapitre** porte le `parentId` de son **parent direct** —
//     chapitre ou sous-chapitre.
//
// Les douze chapitres écrits avant cette fonctionnalité n'ont pas le champ : ils
// sont donc déjà des chapitres, sans rien migrer. Une carte, elle, ne sait pas à
// quel niveau elle vit — son `categoryId` pointe vers n'importe laquelle.
//
// `order` est un ordre **entre frères** : les chapitres entre eux, et les
// sous-chapitres d'un même parent entre eux.
//
// Le calcul de l'arbre (niveaux, descendants, ancêtres, refus) vit dans
// `arbre.js`, module pur. Le plafond de niveaux n'est garanti par rien dans la
// base : ce sont `createCategory` et `attachCategory`, les deux seuls endroits
// où un `parentId` s'écrit, qui demandent son refus à `arbre.js` avant d'écrire.

/** Une catégorie est un **sous-chapitre** quand elle désigne un parent. */
export const isSubchapter = (cat) => typeof cat.parentId === 'string' && cat.parentId !== '';

/** Toutes les catégories, tous niveaux mélangés, triées par `order`. */
export async function listCategories() {
  const snap = await getDocs(query(col('categories'), orderBy('order')));
  return snap.docs.map(toObj);
}

/**
 * L'arbre des catégories : les chapitres dans leur ordre, chacun portant
 * `children`, ses sous-chapitres dans leur ordre, récursivement.
 *
 * Le regroupement se fait dans `arbre.js` (`buildTree`), pour qu'aucune vue
 * n'ait à le refaire — et à le refaire différemment d'une autre. C'est lui qui
 * porte le filet : une catégorie qu'aucune chaîne de parents ne relie à un
 * chapitre (parent supprimé depuis un autre appareil hors ligne, cycle écrit
 * par deux appareils) est affichée **comme un chapitre**, plutôt que de rendre
 * ses cartes introuvables.
 */
export async function listChapters() {
  return buildTree(await listCategories());
}

/**
 * L'arbre de `listChapters()` remis à plat, **dans l'ordre de lecture** : chaque
 * catégorie suivie de ses sous-chapitres. Chaque élément porte `depth` — 0 pour
 * un chapitre, 1 et 2 pour les sous-chapitres — et plus de `children`.
 *
 * C'est la forme qu'attend un `<select>` de destination : une seule liste, où le
 * chapitre reste choisissable. Le libellé (indentation) appartient à la vue.
 */
export function flattenChapters(chapters) {
  return flattenTree(chapters);
}

/** L'arbre relu, directement à plat : la forme où se lisent les descendants. */
async function listFlat() {
  return flattenTree(await listChapters());
}

/**
 * Crée un chapitre, ou un sous-chapitre si `parentId` est donné.
 *
 * La nouvelle catégorie prend la dernière place **parmi ses frères** : compter
 * toutes les catégories donnerait à un premier sous-chapitre la position 12,
 * ce qui ne veut rien dire sous un chapitre qui n'en a aucun autre.
 *
 * C'est ici que tient le plafond de niveaux : un parent introuvable, ou qui est
 * déjà au dernier niveau, est refusé (`createRefusal`, arbre.js).
 */
export async function createCategory(name, parentId = null) {
  const existantes = await listCategories();
  const refus = createRefusal(flattenTree(buildTree(existantes)), parentId);
  if (refus) throw new Error(refus);
  const freres = existantes.filter((c) => (parentId ? c.parentId === parentId : !isSubchapter(c)));
  const donnees = { name, order: freres.length };
  // Pas de `parentId: null` sur un chapitre : l'absence du champ **est** l'état
  // « chapitre », comme sur les douze documents d'origine. Deux représentations
  // du même état finiraient par diverger dans une requête.
  if (parentId) donnees.parentId = parentId;
  const d = await addDoc(col('categories'), donnees);
  return { id: d.id, ...donnees };
}

/**
 * Renomme une catégorie et rend le nom tel qu'il a été écrit.
 *
 * La règle vit ici, pas dans les vues : deux écrans renomment (« Gérer » et
 * celui de la catégorie), et une règle recopiée finit par diverger
 * (docs/decisions.md, « Renommer depuis l'écran de la catégorie »).
 * Un titre vide n'a pas de sens : refusé, rien n'est écrit.
 */
export async function renameCategory(id, name) {
  const nom = name.trim();
  if (!nom) throw new Error('Un titre vide n’a pas de sens : nom inchangé.');
  await setDoc(ref('categories', id), { name: nom }, { merge: true });
  return nom;
}

/**
 * Écrit les commentaires sur les livres d'une catégorie : texte libre, un seul
 * champ par chapitre ou sous-chapitre (docs/decisions.md, « Livres d'une
 * catégorie »).
 *
 * Écriture ciblée (`merge`), comme le renommage : le nom et l'ordre ne passent
 * pas par ici, et un écran ouvert depuis longtemps ne doit pas les écraser.
 * Facultatif : l'absence du champ vaut « rien d'écrit », sans rien migrer.
 */
export async function setCategoryBooks(id, books) {
  await setDoc(ref('categories', id), { books }, { merge: true });
}

/**
 * Réécrit l'ordre de **tous** les chapitres d'un coup, à partir de la liste
 * ordonnée de leurs identifiants.
 *
 * Réécrire tout plutôt que d'échanger deux valeurs : après quelques
 * suppressions, les `order` ne sont plus contigus (0, 1, 4, 7…) et un échange
 * deux à deux finit par produire des doublons — donc un ordre d'affichage
 * instable. Ici, on repart de 0 à chaque fois.
 *
 * `writeBatch` rend l'opération atomique : soit tout l'ordre change, soit rien.
 * Un ordre à moitié écrit serait pire que l'ancien.
 */
export async function setCategoriesOrder(orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, order) => batch.set(ref('categories', id), { order }, { merge: true }));
  await batch.commit();
}

/**
 * **Rattache** une catégorie : sous la catégorie `parentId`, ou au premier
 * niveau si `parentId` est nul. Un seul geste pour trois cas — un chapitre qui
 * devient sous-chapitre, un sous-chapitre qui devient chapitre, un sous-chapitre
 * qui change de parent (docs/decisions.md, « Rattacher une catégorie »).
 *
 * **Le sous-arbre suit** (« Trois niveaux de catégories ») : seule la catégorie
 * rattachée change de `parentId` ; ses descendants désignent toujours leur
 * parent direct, ils descendent ou remontent donc avec elle, sans écriture.
 *
 * Refus (`attachRefusal`, arbre.js) : catégorie ou parent introuvable ; parent
 * qui est la catégorie elle-même ou l'un de ses descendants (cycle) ;
 * descendant le plus bas qui passerait sous le dernier niveau.
 *
 * La catégorie arrive **à la fin de ses nouveaux frères**, comme à la création.
 * Anciens et nouveaux frères sont renumérotés de 0 dans le **même** `writeBatch`
 * que le changement de `parentId` : un trou laissé d'un côté et un « fin =
 * nombre de frères » de l'autre finiraient en positions doublées, donc en ordre
 * instable — et un arbre à moitié réécrit serait pire que l'ancien.
 *
 * **Aucune écriture sur les cartes** : elles ne changent pas de catégorie, c'est
 * la catégorie qui change d'étage. Elles gardent donc leur place.
 *
 * On relit l'arbre plutôt que de croire l'écran appelant : un sous-chapitre a pu
 * être ajouté depuis un autre appareil à la catégorie qu'on s'apprête à
 * rattacher, et changer sa hauteur.
 *
 * @returns {Promise<object>} la catégorie telle qu'écrite (`order`, `parentId`?)
 */
export async function attachCategory(id, parentId = null) {
  const cible = parentId || null;
  const toutes = await listCategories();
  const cat = toutes.find((c) => c.id === id);
  if (!cat) throw new Error('Catégorie introuvable.');

  const actuel = isSubchapter(cat) ? cat.parentId : null;
  // Déjà là : rien à écrire, et surtout pas de renumérotation gratuite.
  if (cible === actuel) return { ...cat };

  const refus = attachRefusal(flattenTree(buildTree(toutes)), id, cible);
  if (refus) throw new Error(refus);

  // Les frères d'un niveau, sans la catégorie elle-même, dans leur ordre.
  // `toutes` est déjà trié par `order`.
  const freresDe = (p) => toutes.filter((c) => c.id !== id
    && (p ? c.parentId === p : !isSubchapter(c)));
  const anciens = freresDe(actuel);
  const nouveaux = freresDe(cible);

  const batch = writeBatch(db);
  [anciens, nouveaux].forEach((liste) => liste.forEach((c, order) => {
    batch.set(ref('categories', c.id), { order }, { merge: true });
  }));
  const order = nouveaux.length;
  // Au premier niveau, on **retire** le champ plutôt que d'écrire `null` : son
  // absence est l'état « chapitre », comme sur les documents d'origine.
  batch.set(ref('categories', id),
    { order, parentId: cible ? cible : deleteField() }, { merge: true });
  await batch.commit();

  const { parentId: _ancien, ...reste } = cat;
  return cible ? { ...reste, order, parentId: cible } : { ...reste, order };
}

/** Les sous-chapitres **directs** d'une catégorie, dans leur ordre. */
async function listSubchapters(chapterId) {
  // Filtre par `where`, tri en mémoire : `where` + `orderBy` sur deux champs
  // différents exigerait un index composite déclaré à la main.
  const snap = await getDocs(query(col('categories'), where('parentId', '==', chapterId)));
  return snap.docs.map(toObj).sort((a, b) => a.order - b.order);
}

/**
 * Supprime une catégorie — **refuse** si elle contient des cartes, ou si elle a
 * encore des sous-chapitres, même vides. Les sous-chapitres directs suffisent à
 * le savoir : on ne supprime jamais qu'une feuille, de bas en haut.
 * Décision actée : aucune donnée ne disparaît par effet de bord, et il n'existe
 * pas de zone « sans catégorie » où reléguer les orphelines.
 */
export async function deleteCategory(id) {
  const [cartes, sous] = await Promise.all([listCards(id), listSubchapters(id)]);
  if (sous.length > 0) {
    throw new Error(`Cette catégorie a ${sous.length} sous-chapitre(s). Supprime-les d'abord.`);
  }
  if (cartes.length > 0) {
    throw new Error(`Cette catégorie contient ${cartes.length} carte(s). Vide-la ou déplace-les d'abord.`);
  }
  await deleteDoc(ref('categories', id));
}

/**
 * Crée les 12 chapitres du programme si l'utilisateur n'en a aucun.
 * Appelé à chaque connexion : la garde « aucune catégorie » suffit, on ne veut
 * pas ressusciter un chapitre supprimé exprès.
 */
export async function seedIfEmpty() {
  const existantes = await listCategories();
  if (existantes.length > 0) return false;
  await Promise.all(TITRES.map((name, order) => addDoc(col('categories'), { name, order })));
  return true;
}

// ---------------------------------------------------------------- Cartes

/** Une carte est **rangée** quand elle porte une position dans son chapitre. */
export const isPlaced = (card) => typeof card.order === 'number';

/**
 * Ordre d'affichage d'un chapitre : les cartes rangées d'abord, par position,
 * puis les non rangées, par identifiant (stable, faute de mieux).
 *
 * Le tri se fait **ici, en mémoire**, et non par un `orderBy('order')` : une
 * requête Firestore triée sur un champ **exclut les documents qui ne le portent
 * pas**: toutes les cartes non rangées disparaîtraient de l'écran. Un
 * `where` + `orderBy` exigerait de surcroît un index composite à déclarer.
 */
function compareCards(a, b) {
  const ra = isPlaced(a) ? a.order : Infinity;
  const rb = isPlaced(b) ? b.order : Infinity;
  if (ra !== rb) return ra < rb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export async function listCards(categoryId) {
  const snap = await getDocs(query(col('cards'), where('categoryId', '==', categoryId)));
  return snap.docs.map(toObj).sort(compareCards);
}

/** Plafond de valeurs d'un `where(…, 'in', …)` Firestore. */
const IN_MAX = 30;

/**
 * Les cartes **d'une catégorie et de tout ce qui est dessous** — sous-chapitres,
 * et leurs sous-chapitres — pour la recherche de l'écran d'une catégorie
 * découpée, qui mentirait si elle ignorait ce qu'on a découpé.
 *
 * Ordre renvoyé : les cartes propres à la catégorie d'abord, puis celles de
 * chaque descendant dans l'ordre de lecture de l'arbre ; à l'intérieur de chaque
 * catégorie, l'ordre habituel (`compareCards`). Les positions de deux catégories
 * ne se comparent pas, d'où ce groupement plutôt qu'un tri unique.
 *
 * Une requête `in` par tranche de 30 identifiants : le plafond Firestore ne
 * devient donc pas une limite du nombre de sous-chapitres.
 */
export async function listCardsUnder(chapterId) {
  const sous = descendantsOf(await listFlat(), chapterId);
  const ids = [chapterId, ...sous.map((s) => s.id)];

  const tranches = [];
  for (let i = 0; i < ids.length; i += IN_MAX) tranches.push(ids.slice(i, i + IN_MAX));
  const snaps = await Promise.all(
    tranches.map((t) => getDocs(query(col('cards'), where('categoryId', 'in', t)))));

  const rang = new Map(ids.map((id, i) => [id, i]));
  return snaps.flatMap((s) => s.docs.map(toObj))
    .sort((a, b) => (rang.get(a.categoryId) - rang.get(b.categoryId)) || compareCards(a, b));
}

/**
 * Réécrit la position des cartes **rangées** d'un chapitre, à partir de la liste
 * ordonnée de leurs identifiants — même geste que `setCategoriesOrder`, et pour
 * la même raison : on renumérote de 0 plutôt que d'échanger deux valeurs, sinon
 * les positions finissent trouées puis en doublon, donc l'ordre devient instable.
 *
 * Ne concerne **que** les cartes qu'on lui passe : les non rangées le restent.
 * Sans ça, la première pression sur une flèche rangerait implicitement tout le
 * chapitre, et le repère « non rangée » disparaîtrait sans qu'on l'ait décidé.
 */
export async function setCardsOrder(orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, order) => batch.set(ref('cards', id), { order }, { merge: true }));
  await batch.commit();
}

/**
 * Compteurs par catégorie : `Map(categoryId → { total, unplaced, cumulative })`.
 *
 * L'accueil affiche douze compteurs : douze requêtes séparées seraient douze
 * allers-retours pour afficher un écran. On lit toutes les cartes une fois et on
 * compte ici — à l'échelle d'une préparation personnelle, c'est le bon compromis.
 *
 * - `total` — les cartes rangées **directement** dans la catégorie ;
 * - `unplaced` — parmi elles, celles qui n'ont pas de place : l'écran de gestion
 *   s'en sert pour montrer où il reste de l'ordre à mettre ;
 * - `cumulative` — `total` plus les cartes de **tout ce qui est dessous**
 *   (sous-chapitres, et leurs sous-chapitres). C'est le compteur de l'accueil et
 *   des lignes de sous-chapitres : sans lui, découper une catégorie la ferait
 *   paraître vidée.
 *
 * Seules les catégories qui portent au moins une carte, ou un descendant qui en
 * porte, figurent dans la table : l'appelant replie sur zéro.
 */
export async function countByCategory() {
  const [snap, categories] = await Promise.all([getDocs(col('cards')), listCategories()]);
  const compte = new Map();
  const entree = (id) => {
    if (!compte.has(id)) compte.set(id, { total: 0, unplaced: 0, cumulative: 0 });
    return compte.get(id);
  };

  snap.forEach((d) => {
    const donnees = d.data();
    const c = entree(donnees.categoryId);
    c.total += 1;
    c.cumulative += 1;
    if (typeof donnees.order !== 'number') c.unplaced += 1;
  });

  // Report de chaque catégorie sur **tous** ses ancêtres, lus dans l'arbre
  // affiché. Même filet que `listChapters` : une catégorie que le filet a faite
  // chapitre n'a pas d'ancêtre, elle garde son propre compte et ne le reporte
  // nulle part.
  const plat = flattenTree(buildTree(categories));
  plat.forEach((cat) => {
    if (!compte.has(cat.id)) return;
    const propres = compte.get(cat.id).total;
    ancestorsOf(plat, cat.id).forEach((a) => { entree(a.id).cumulative += propres; });
  });
  return compte;
}

export async function getCard(id) {
  const d = await getDoc(ref('cards', id));
  return d.exists() ? toObj(d) : null;
}

/**
 * Crée ou met à jour une carte, selon qu'elle porte déjà un identifiant.
 *
 * Règle de position, tenue **ici** et pas dans l'éditeur : une carte naît non
 * rangée, garde sa place tant qu'elle reste dans son chapitre, et la perd si on
 * la change de chapitre — la position 3 du chapitre d'où elle vient ne veut rien
 * dire dans celui où elle arrive. C'est aussi la règle de `moveCard` ; la mettre
 * dans les vues, c'est la voir diverger entre les deux chemins.
 */
export async function saveCard(card) {
  const { id, ...champs } = card;
  // Liste explicite des champs écrits : une carte relue depuis Firestore porte
  // aussi son `id`, qu'on ne veut pas dupliquer dans le document.
  const donnees = {
    categoryId: champs.categoryId,
    title: champs.title || '',
    front: champs.front || '',
    hint: champs.hint || '',
    back: champs.back || '',
    note: champs.note || '',
    images: Array.isArray(champs.images) ? champs.images : [],
    // Plus d'`entryIds` : les renvois ont été retirés (docs/decisions.md,
    // « Retrait des renvois »). L'écriture remplaçant le document entier, une
    // ancienne carte perd le champ au premier réenregistrement.
  };
  if (id) {
    // L'écriture remplace le document entier : sans ce report, `order`
    // disparaîtrait à chaque simple correction de coquille. On relit l'ancien
    // état plutôt que de faire confiance à l'objet reçu — il peut venir d'un
    // écran ouvert depuis longtemps.
    const ancien = await getCard(id);
    if (ancien && ancien.categoryId === donnees.categoryId && isPlaced(ancien)) {
      donnees.order = ancien.order;
    }
    await setDoc(ref('cards', id), donnees);
    return { id, ...donnees };
  }
  // Création : pas d'`order`, la carte arrive non rangée.
  const d = await addDoc(col('cards'), donnees);
  return { id: d.id, ...donnees };
}

/**
 * Range une carte dans un autre chapitre.
 *
 * Écriture **ciblée** (`merge`), et non un `saveCard` complet : déplacer ne doit
 * pas dépendre de la fraîcheur des quatre champs détenus par l'appelant. Une
 * liste affichée depuis dix minutes déplacerait sinon la carte *et* réécrirait
 * un contenu périmé par-dessus une correction faite entre-temps ailleurs.
 *
 * La carte **perd sa place** en changeant de chapitre : `deleteField` retire le
 * champ, ce qui la remet dans l'état « non rangée ». On efface plutôt que
 * d'écrire une position de fin de liste — la placer d'office, c'est prétendre
 * décider à la place de l'utilisateur, et masquer la carte au milieu d'un
 * chapitre où elle vient d'arriver.
 */
export async function moveCard(id, categoryId) {
  await setDoc(ref('cards', id), { categoryId, order: deleteField() }, { merge: true });
}

/** La marque que porte le titre d'une copie. */
const MARQUE_COPIE = '(copie)';

/**
 * Duplique une carte, **en base, tout de suite** — aucun éditeur ne s'ouvre.
 *
 * Deux écarts délibérés à la règle « une carte naît non rangée »
 * (docs/decisions.md, « Dupliquer une carte ») :
 *
 * 1. **Place** — si l'original est rangé, la copie prend la position juste
 *    après lui et les suivantes descendent d'un cran : on duplique pour faire
 *    une variante, et la variante se lit à côté de ce dont elle varie. Si
 *    l'original n'est pas rangé, la copie ne l'est pas non plus : les non
 *    rangées sont triées par identifiant, tiré au hasard, et « juste après » n'y
 *    veut rien dire.
 * 2. **Titre** — suffixé de « (copie) », ou réduit à « (copie) » sur une carte
 *    sans titre : c'est ce qui distingue les deux lignes, sans toucher au recto.
 *
 * On relit l'original plutôt que de recevoir la carte affichée : une liste
 * ouverte depuis dix minutes dupliquerait sinon un contenu périmé.
 *
 * Tout passe par **un seul** `writeBatch` : ni copie sans sa place, ni chapitre
 * renuméroté autour d'une copie absente. L'identifiant vient de
 * `doc(col('cards'))`, qui le tire côté client, avant toute écriture — c'est ce
 * qui permet de le glisser dans la renumérotation du même lot.
 *
 * @returns {Promise<object>} la copie, avec son `id` (et son `order` si rangée)
 */
export async function duplicateCard(id) {
  const original = await getCard(id);
  if (!original) throw new Error('Carte introuvable.');

  // Mêmes champs que `saveCard`, écrits explicitement : pas d'`id` ni d'`order`
  // hérités, et les tableaux recopiés pour ne rien partager avec l'original.
  const copie = {
    categoryId: original.categoryId,
    title: original.title ? `${original.title} ${MARQUE_COPIE}` : MARQUE_COPIE,
    front: original.front || '',
    hint: original.hint || '',
    back: original.back || '',
    note: original.note || '',
    images: Array.isArray(original.images) ? [...original.images] : [],
  };

  const nouvelle = doc(col('cards'));
  const batch = writeBatch(db);

  if (isPlaced(original)) {
    // Renumérotation de 0, comme `setCardsOrder`, et pour la même raison : des
    // positions trouées finissent en doublons. Seules les rangées sont touchées.
    const rangees = (await listCards(original.categoryId)).filter(isPlaced).map((c) => c.id);
    rangees.splice(rangees.indexOf(id) + 1, 0, nouvelle.id);
    rangees.forEach((cid, order) => {
      if (cid === nouvelle.id) copie.order = order;
      else batch.set(ref('cards', cid), { order }, { merge: true });
    });
  }

  batch.set(nouvelle, copie);
  await batch.commit();
  return { id: nouvelle.id, ...copie };
}

export async function deleteCard(id) {
  await deleteDoc(ref('cards', id));
}

// ---------------------------------------------------------------- Entrées
//
// Une **entrée** vit dans `users/{uid}/library/{id}` :
//
//   { kind: 'theorem' | 'definition', title, statement, support, source }
//
// **Deux espèces, un seul document.** Un théorème et une définition ont la même
// forme — un nom, un corps, un appui facultatif — et le même comportement : on
// les lit d'un bloc, on les cherche ensemble, on ne les tire jamais. Seuls les
// libellés affichés changent (« Énoncé / Esquisse » contre « Définition /
// Remarques »), et un libellé n'est pas une raison de dédoubler un schéma :
// deux jeux de noms de champs obligeraient le tri, la liste et la recherche à
// demander l'espèce avant de savoir quel champ lire (docs/decisions.md,
// « Théorèmes et définitions : deux espèces d'une même entrée »).
//
// La collection s'appelle `library`, et non `theorems` : elle porte les deux
// espèces, et un nom qui ment se paie à chaque relecture. Le renommage a coûté
// une migration — faite une fois, par `migrateLibrary()`.
//
// Volontairement **sans catégorie et sans ordre** : la bibliothèque est plate,
// triée par titre, et se parcourt par la recherche. Il n'y a donc ici ni
// `order`, ni `where`, ni notion de « non rangée » : rien à ranger.

/** Les deux espèces d'entrée. Le code ne connaît que ces deux valeurs. */
export const THEOREM = 'theorem';
export const DEFINITION = 'definition';

/**
 * L'espèce d'une entrée, avec son repli.
 *
 * Tout ce qui n'est pas explicitement une définition est un théorème : c'est ce
 * qui rend justes, sans rien réécrire, les documents antérieurs à cette
 * fonctionnalité. Un `kind` inconnu — venu d'une version plus récente ouverte
 * sur un autre appareil — retombe sur la même valeur plutôt que de casser
 * l'écran.
 */
export const kindOf = (entry) => (entry && entry.kind === DEFINITION ? DEFINITION : THEOREM);

/**
 * Toutes les entrées, triées par titre.
 *
 * Le tri se fait **ici, en mémoire**, et non par `orderBy('title')` : la
 * comparaison de Firestore est binaire, donc « Élément » passerait après
 * « Zorn ». `localeCompare` en français range les accents comme un lecteur
 * français les attend. À l'échelle d'une bibliothèque personnelle, lire tout
 * puis trier ne coûte rien — et c'est de toute façon ce que la recherche exige,
 * elle qui filtre sur la liste complète.
 *
 * Les deux espèces sont **mélangées** dans un seul tri : chercher « Baire » doit
 * ramener le théorème et la définition d'espace de Baire côte à côte, et non
 * dans deux blocs à parcourir l'un après l'autre.
 */
export async function listEntries() {
  const snap = await getDocs(col('library'));
  return snap.docs.map(toObj)
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'fr', { sensitivity: 'base' }));
}

export async function getEntry(id) {
  const d = await getDoc(ref('library', id));
  return d.exists() ? toObj(d) : null;
}

/**
 * Combien d'entrées, et de quelle espèce — pour le repère affiché sur l'accueil.
 *
 * Une seule lecture : compter par espèce en deux requêtes coûterait deux
 * allers-retours pour une ligne de texte.
 */
export async function countEntries() {
  const snap = await getDocs(col('library'));
  const compte = { total: snap.size, [THEOREM]: 0, [DEFINITION]: 0 };
  snap.forEach((d) => { compte[kindOf(d.data())] += 1; });
  return compte;
}

/**
 * Crée ou met à jour une entrée, selon qu'elle porte déjà un identifiant.
 *
 * Champs écrits explicitement, comme pour une carte : l'objet reçu porte aussi
 * son `id` quand il vient d'une lecture, et on ne veut pas le dupliquer dans le
 * document. Rien à reporter d'un ancien état ici — une entrée n'a aucun champ
 * que l'éditeur ignorerait.
 *
 * L'espèce passe par `kindOf` plutôt que d'être recopiée telle quelle : c'est le
 * seul endroit où elle s'écrit, donc le seul où l'on puisse garantir qu'aucune
 * troisième valeur n'entre en base.
 */
export async function saveEntry(entry) {
  const { id, ...champs } = entry;
  const donnees = {
    kind: kindOf(champs),
    title: champs.title || '',
    statement: champs.statement || '',
    support: champs.support || '',
    // Où lire la démonstration en entier. Le champ est écrit pour **les deux**
    // espèces, vide sur une définition : un seul schéma, donc `listEntries`, la
    // recherche et le tri n'ont jamais à demander l'espèce avant de lire. C'est
    // l'interface qui réserve la source au théorème (`ESPECES`, entree.js), pas
    // la base.
    source: champs.source || '',
  };
  if (id) {
    await setDoc(ref('library', id), donnees);
    return { id, ...donnees };
  }
  const d = await addDoc(col('library'), donnees);
  return { id: d.id, ...donnees };
}

export async function deleteEntry(id) {
  await deleteDoc(ref('library', id));
}

// ---------------------------------------------------------- Interro du jour
//
// Une interro par jour, rangée sous sa date : `daily/2026-10-16`. La date est
// l'identifiant, donc lire un jour est un `getDoc` — ni requête, ni index.
//
// L'app **ne fait que lire**. C'est la tâche planifiée du PC qui écrit
// (`tools/interro.py`, avec un compte de service, qui passe outre les règles) :
// une interro est générée, on ne la modifie pas. Voir docs/decisions.md,
// « Interro du jour ».

/** L'interro du jour `day` (clé `AAAA-MM-JJ`), ou `null` s'il n'y en a pas. */
export async function getDaily(day) {
  const d = await getDoc(ref('daily', day));
  return d.exists() ? toObj(d) : null;
}

// ------------------------------------------------------------------ Marques
//
// La marque d'une question de l'interro (faite, à revoir, plus tard), rangée
// **à côté** de l'interro et non dedans : `interro.py plan --replace` réécrit
// les documents `daily` en entier, et emporterait tout ce que l'app y aurait
// écrit. Voir docs/decisions.md, « Marquer une question de l'interro ».
//
//   users/{uid}/marks/{idQuestion}   { mark, day, updatedAt }
//
// L'identifiant est celui de la banque (`al-p01`) : la marque appartient à la
// question, pas au jour. Pas de marque, pas de document — une question sans
// document est « à faire ». `day` ne sert qu'à retrouver l'énoncé depuis une
// liste ; on ne s'en sert pas pour lire, il peut être périmé.

/**
 * Les marques des questions `ids`, en `{ id: mark }` — une question sans
 * marque n'y figure pas.
 *
 * Une requête sur les identifiants plutôt qu'un `getDoc` par question : hors
 * ligne, une requête rend ce que le cache connaît, alors qu'un `getDoc` sur un
 * document jamais lu lève une erreur — et l'écran de l'interro tomberait.
 */
export async function getMarks(ids) {
  const tranches = [];
  for (let i = 0; i < ids.length; i += IN_MAX) tranches.push(ids.slice(i, i + IN_MAX));
  const snaps = await Promise.all(
    tranches.map((t) => getDocs(query(col('marks'), where(documentId(), 'in', t)))));

  const marques = {};
  for (const s of snaps) s.forEach((d) => { marques[d.id] = d.data().mark; });
  return marques;
}

/** Pose la marque `mark` sur la question `id`, vue le jour `day`. */
export async function setMark(id, mark, day) {
  await setDoc(ref('marks', id), { mark, day, updatedAt: new Date().toISOString() });
}

/** Retire la marque de la question `id` : elle redevient « à faire ». */
export async function clearMark(id) {
  await deleteDoc(ref('marks', id));
}

// ------------------------------------------------------------- Notification
//
// L'abonnement push de l'appareil qui reçoit la notification du matin, sous un
// identifiant fixe : **un seul** appareil la reçoit, le dernier abonné. L'app
// l'écrit (`js/push.js`), la tâche du PC le lit pour le recopier dans les
// secrets GitHub, d'où part l'envoi.
//
//   users/{uid}/push/phone   { subscription: { endpoint, keys }, updatedAt }

/** L'abonnement rangé (`{ endpoint, keys }`), ou `null`. */
export async function getPushSubscription() {
  const d = await getDoc(ref('push', 'phone'));
  return d.exists() ? d.data().subscription || null : null;
}

/** Range l'abonnement de cet appareil, à la place de celui d'avant. */
export async function savePushSubscription(subscription) {
  await setDoc(ref('push', 'phone'), { subscription, updatedAt: new Date().toISOString() });
}

/**
 * Migration unique : `theorems` → `library`.
 *
 * Appelée à chaque connexion, sur le modèle de `seedIfEmpty()`. Il n'y a pas
 * d'autre endroit possible : la machine n'a pas Node, et les règles Firestore
 * n'ouvrent `users/{uid}` qu'à l'utilisateur connecté — le code de migration est
 * donc forcément du code d'app.
 *
 * Trois précautions, parce que l'app n'a **aucun export** et qu'une migration
 * ratée ici perdrait des données pour de bon :
 *
 * 1. **Idempotence** — dès qu'une entrée existe, on sort. Une bibliothèque non
 *    vide signifie soit que la migration est passée, soit qu'on a écrit depuis :
 *    dans les deux cas, réécrire par-dessus serait pire que ne rien faire.
 * 2. **Identifiants conservés** (`setDoc` sur l'id existant, jamais `addDoc`) —
 *    une URL déjà ouverte tombe juste.
 * 3. **Rien n'est supprimé** — `theorems` reste en place, intacte et invisible :
 *    c'est la sauvegarde. À supprimer à la main dans la console Firebase une
 *    fois la migration constatée.
 *
 * Renvoie le nombre d'entrées migrées — 0 quand il n'y avait rien à faire.
 *
 * Plafond assumé : 500 écritures par `writeBatch`, une par théorème. À l'échelle d'une préparation personnelle,
 * on n'en approche pas.
 */
export async function migrateLibrary() {
  const deja = await getDocs(col('library'));
  if (!deja.empty) return 0;

  const anciens = await getDocs(col('theorems'));
  if (anciens.empty) return 0;

  const batch = writeBatch(db);

  anciens.forEach((d) => {
    const t = d.data();
    batch.set(ref('library', d.id), {
      kind: THEOREM,
      title: t.title || '',
      statement: t.statement || '',
      // `sketch` devient `support` : « esquisse » ne veut rien dire sur une
      // définition, et c'était le moment de le corriger — on réécrivait déjà.
      support: t.sketch || '',
    });
  });

  await batch.commit();
  return anciens.size;
}
