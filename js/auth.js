// auth.js — connexion Google, et rien d'autre.
//
// La connexion est **obligatoire** : sans compte, l'app n'affiche qu'un écran de
// connexion (docs/decisions.md). Un seul chemin de données, donc aucune histoire
// de « cartes locales à remonter » le jour où l'on se connecte.

import { auth } from './firebase.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
} from '../vendor/firebase/firebase-auth.js';

const provider = new GoogleAuthProvider();

/**
 * Ouvre la fenêtre de connexion Google.
 *
 * On utilise la **popup** et non la redirection : la redirection s'appuie sur du
 * stockage tiers, que les navigateurs bloquent désormais, sauf à héberger sur un
 * domaine Firebase — ce qui n'est pas notre cas (GitHub Pages).
 */
export async function signIn() {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    // Fermer la fenêtre soi-même n'est pas une erreur à signaler.
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
    throw err;
  }
}

export const signOut = () => fbSignOut(auth);

/** L'utilisateur courant, ou null. Disponible seulement après `whenReady()`. */
export const currentUser = () => auth.currentUser;

export const currentUid = () => (auth.currentUser ? auth.currentUser.uid : null);

/**
 * Attend que Firebase ait fini de restaurer la session enregistrée, puis
 * prévient à chaque changement (connexion, déconnexion).
 *
 * Ce détour est nécessaire : au chargement de la page, `auth.currentUser` vaut
 * `null` pendant un instant même quand la session est valide. Afficher l'écran
 * de connexion sur cette base ferait clignoter l'app à chaque ouverture.
 */
export function onUserChange(callback) {
  return onAuthStateChanged(auth, callback);
}
