// store.js — seule porte d'entrée vers les données.
//
// Aucune vue ne lit ni n'écrit autrement qu'à travers ce fichier. C'est ce qui a
// permis de remplacer le stockage en mémoire par Firestore sans toucher un seul
// écran : les signatures n'ont pas bougé.
//
// Arborescence dans Firestore :
//
//   users/{uid}/categories/{id}   { name, order }
//   users/{uid}/cards/{id}        { categoryId, front, hint, back, note }
//
// Tout est rangé **sous l'identifiant de l'utilisateur**, et les règles publiées
// n'autorisent `users/{userId}` qu'à l'uid correspondant. C'est cette forme
// d'arborescence qui rend la règle de sécurité tenable en une ligne ; la changer
// obligerait à revoir les règles.

import { db } from './firebase.js';
import { currentUid } from './auth.js';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, writeBatch,
  query, where, orderBy,
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

export async function listCards(categoryId) {
  const snap = await getDocs(query(col('cards'), where('categoryId', '==', categoryId)));
  return snap.docs.map(toObj);
}

/**
 * Nombre de cartes par chapitre, en **une seule** requête.
 *
 * L'accueil affiche douze compteurs : douze requêtes séparées seraient douze
 * allers-retours pour afficher un écran. On lit toutes les cartes une fois et on
 * compte ici — à l'échelle d'une préparation personnelle, c'est le bon compromis.
 */
export async function countByCategory() {
  const snap = await getDocs(col('cards'));
  const compte = new Map();
  snap.forEach((d) => {
    const cat = d.data().categoryId;
    compte.set(cat, (compte.get(cat) || 0) + 1);
  });
  return compte;
}

export async function getCard(id) {
  const d = await getDoc(ref('cards', id));
  return d.exists() ? toObj(d) : null;
}

/** Crée ou met à jour une carte, selon qu'elle porte déjà un identifiant. */
export async function saveCard(card) {
  const { id, ...champs } = card;
  const donnees = {
    categoryId: champs.categoryId,
    front: champs.front || '',
    hint: champs.hint || '',
    back: champs.back || '',
    note: champs.note || '',
  };
  if (id) {
    await setDoc(ref('cards', id), donnees);
    return { id, ...donnees };
  }
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
 */
export async function moveCard(id, categoryId) {
  await setDoc(ref('cards', id), { categoryId }, { merge: true });
}

export async function deleteCard(id) {
  await deleteDoc(ref('cards', id));
}
