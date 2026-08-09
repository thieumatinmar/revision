// firebase.js — initialisation, et rien d'autre.
//
// Un seul endroit dans l'app connaît la configuration et instancie les services.
// `auth.js` et `store.js` importent d'ici ; aucun autre fichier ne parle
// directement au SDK.
//
// Le SDK est **vendorisé** dans `vendor/firebase/` (même règle que KaTeX) : ses
// imports absolus vers le CDN Google ont été réécrits en chemins relatifs. Une
// app censée marcher dans le métro ne va pas chercher son moteur ailleurs.

import { initializeApp } from '../vendor/firebase/firebase-app.js';
import { getAuth } from '../vendor/firebase/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from '../vendor/firebase/firebase-firestore.js';

// Cette configuration n'est **pas un secret** : elle part dans le navigateur de
// chaque visiteur, c'est prévu ainsi. Ce qui protège les données, ce sont les
// règles Firestore (users/{userId} réservé à l'uid correspondant).
const firebaseConfig = {
  apiKey: 'AIzaSyBvcR_9eSUDKL4UXRP3L4_XDebxSFW63eg',
  authDomain: 'agreg-revision.firebaseapp.com',
  projectId: 'agreg-revision',
  storageBucket: 'agreg-revision.firebasestorage.app',
  messagingSenderId: '582945203516',
  appId: '1:582945203516:web:92717d49f6fea01e44aa39',
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

/**
 * Firestore avec cache local persistant : les lectures sont servies depuis le
 * disque quand le réseau manque, et les écritures faites hors ligne partent
 * toutes seules au retour du réseau.
 *
 * `persistentMultipleTabManager` autorise plusieurs onglets ouverts sur l'app ;
 * sans lui, le second onglet perd la persistance.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
