// store.js — seule porte d'entrée vers les données.
//
// Aucune vue ne lit ni n'écrit autrement qu'à travers ce fichier. C'est ce qui a
// permis de remplacer le stockage en mémoire par Firestore sans toucher un seul
// écran : les signatures n'ont pas bougé.
//
// Arborescence dans Firestore :
//
//   users/{uid}/categories/{id}   { name, order }
//   users/{uid}/cards/{id}        { categoryId, title, front, hint, back, note,
//                                   images: string[], entryIds: string[], order? }
//   users/{uid}/library/{id}      { kind, title, statement, support }
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
  writeBatch, query, where, orderBy, arrayRemove,
} from '../vendor/firebase/firebase-firestore.js';

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

export async function listCategories() {
  const snap = await getDocs(query(col('categories'), orderBy('order')));
  return snap.docs.map(toObj);
}

export async function getCategory(id) {
  const d = await getDoc(ref('categories', id));
  return d.exists() ? toObj(d) : null;
}

export async function createCategory(name) {
  const existantes = await listCategories();
  const d = await addDoc(col('categories'), { name, order: existantes.length });
  return { id: d.id, name, order: existantes.length };
}

export async function renameCategory(id, name) {
  await setDoc(ref('categories', id), { name }, { merge: true });
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
 * Supprime une catégorie — **refuse** si elle contient des cartes.
 * Décision actée : aucune donnée ne disparaît par effet de bord, et il n'existe
 * pas de zone « sans catégorie » où reléguer les orphelines.
 */
export async function deleteCategory(id) {
  const cartes = await listCards(id);
  if (cartes.length > 0) {
    throw new Error(`Ce chapitre contient ${cartes.length} carte(s). Vide-le ou déplace-les d'abord.`);
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
 * Compteurs par chapitre, en **une seule** requête :
 * `Map(categoryId → { total, unplaced })`.
 *
 * L'accueil affiche douze compteurs : douze requêtes séparées seraient douze
 * allers-retours pour afficher un écran. On lit toutes les cartes une fois et on
 * compte ici — à l'échelle d'une préparation personnelle, c'est le bon compromis.
 *
 * `unplaced` sert à l'écran de gestion : voir d'un coup d'œil quels chapitres
 * contiennent des cartes qui n'ont pas encore de place.
 */
export async function countByCategory() {
  const snap = await getDocs(col('cards'));
  const compte = new Map();
  snap.forEach((d) => {
    const donnees = d.data();
    const cat = donnees.categoryId;
    const c = compte.get(cat) || { total: 0, unplaced: 0 };
    c.total += 1;
    if (typeof donnees.order !== 'number') c.unplaced += 1;
    compte.set(cat, c);
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
    // Les renvois vers la bibliothèque : des identifiants, jamais des titres —
    // renommer un théorème ne doit pas casser ce qui pointe vers lui.
    entryIds: Array.isArray(champs.entryIds) ? champs.entryIds : [],
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

export async function deleteCard(id) {
  await deleteDoc(ref('cards', id));
}

// ---------------------------------------------------------------- Entrées
//
// Une **entrée** vit dans `users/{uid}/library/{id}` :
//
//   { kind: 'theorem' | 'definition', title, statement, support }
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
  };
  if (id) {
    await setDoc(ref('library', id), donnees);
    return { id, ...donnees };
  }
  const d = await addDoc(col('library'), donnees);
  return { id: d.id, ...donnees };
}

/**
 * Les cartes qui **citent** cette entrée.
 *
 * `array-contains` est une requête native : Firestore indexe les tableaux tout
 * seul, il n'y a donc pas d'index composite à déclarer, et la réponse vient de
 * son cache local quand on est hors ligne. On ne charge pas toutes les cartes
 * pour en filtrer trois.
 *
 * Le tri se fait ici, faute d'ordre commun : ces cartes viennent de chapitres
 * différents, où leurs positions ne se comparent pas.
 */
export async function cardsCiting(entryId) {
  const snap = await getDocs(query(col('cards'), where('entryIds', 'array-contains', entryId)));
  return snap.docs.map(toObj)
    .sort((a, b) => (a.title || a.front || '').localeCompare(b.title || b.front || '', 'fr'));
}

/**
 * Supprime une entrée **et les renvois qui pointent vers elle**.
 *
 * Les deux dans le même `writeBatch`, donc de façon atomique : sans ça, un
 * échec entre les deux laisserait l'état bâtard « entrée partie, renvois
 * restés », c'est-à-dire des pointeurs vers rien.
 *
 * On nettoie plutôt que de laisser mourir les identifiants sur place : la donnée
 * reste vraie, et rien n'a besoin d'un écran de maintenance plus tard. Les vues
 * restent malgré tout tolérantes à un identifiant inconnu — un appareil hors
 * ligne peut réécrire une carte avec un renvoi périmé — mais c'est un filet, pas
 * le mécanisme.
 *
 * Plafond assumé : un `writeBatch` fait 500 écritures. Il faudrait qu'une entrée
 * soit citée par 499 cartes pour le toucher.
 */
export async function deleteEntry(id) {
  const citantes = await cardsCiting(id);
  const batch = writeBatch(db);
  citantes.forEach((c) => batch.set(ref('cards', c.id), { entryIds: arrayRemove(id) }, { merge: true }));
  batch.delete(ref('library', id));
  await batch.commit();
  return citantes.length;
}

/**
 * Migration unique : `theorems` → `library`, et `theoremIds` → `entryIds`.
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
 *    les renvois des cartes pointent dessus, et une URL déjà ouverte tombe juste.
 * 3. **Rien n'est supprimé** — `theorems` reste en place, intacte et invisible :
 *    c'est la sauvegarde. À supprimer à la main dans la console Firebase une
 *    fois la migration constatée. Idem pour `theoremIds` sur les cartes : on
 *    écrit `entryIds` à côté sans retirer l'ancien champ, qui disparaîtra tout
 *    seul au premier réenregistrement de la carte — `saveCard` remplaçant le
 *    document entier.
 *
 * Renvoie le nombre d'entrées migrées — 0 quand il n'y avait rien à faire.
 *
 * Plafond assumé, ici encore : 500 écritures par `writeBatch`, soit les
 * théorèmes plus les cartes citantes. À l'échelle d'une préparation personnelle,
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

  const cartes = await getDocs(col('cards'));
  cartes.forEach((d) => {
    const ids = d.data().theoremIds;
    if (Array.isArray(ids) && ids.length > 0) {
      batch.set(ref('cards', d.id), { entryIds: ids }, { merge: true });
    }
  });

  await batch.commit();
  return anciens.size;
}
