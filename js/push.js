// push.js — abonner cet appareil à la notification de l'interro du jour.
//
// Le chemin complet d'une notification, dont ce fichier n'est que le début :
//
//   1. ici, l'appareil s'abonne auprès de son service push (pour Chrome, les
//      serveurs de Google) avec notre clé publique VAPID, et range
//      l'abonnement dans Firestore (`store.savePushSubscription`) ;
//   2. la tâche du PC recopie cet abonnement dans les secrets GitHub
//      (`tools/interro.py`) ;
//   3. chaque matin, GitHub Actions signe un message avec la clé privée et le
//      remet au service push, qui le livre au téléphone ;
//   4. `sw.js` le reçoit (`push`), affiche la notification, et un tap ouvre
//      `#/interro`.
//
// Ni DOM ni vue : comme `store.js`, ce fichier parle à des API (navigateur,
// Firestore) ; une vue l'appelle.
//
// **Un seul appareil** reçoit la notification : le dernier qui s'est abonné.
// `localStorage` retient l'adresse (`endpoint`) que *cet* appareil a rangée.
// C'est ce qui lui permet de savoir s'il est l'appareil abonné, et de ne pas
// reprendre en douce la place d'un autre.

import { getPushSubscription, savePushSubscription } from './store.js';

/**
 * Clé publique VAPID : elle dit au service push « seul le détenteur de la clé
 * privée assortie peut écrire à cet abonnement ». Publique par nature ; la
 * privée vit hors du dépôt (docs/decisions.md, « Interro du jour »).
 */
const VAPID_PUBLIC_KEY = 'BNviH0cOWTuk3-qAAZg2csuzr_NkE_vtGGt0h_KC17dB19LiSaeZyDQl_z8DGisOpjnzl3HWKxdzMp6UaG1OW0U';

/** Clé `localStorage` : l'endpoint que cet appareil a rangé dans Firestore. */
const MEMO = 'agreg.push.endpoint';

/** Le navigateur sait-il recevoir un push ? (Il exige aussi https ou localhost.) */
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window
  && 'Notification' in window && window.isSecureContext;

/**
 * Où en est cet appareil :
 *
 *   'indisponible'  le navigateur ne sait pas faire
 *   'bloquee'       la permission a été refusée (à rouvrir dans les réglages)
 *   'inactive'      jamais abonné ici
 *   'ailleurs'      abonné ici autrefois, mais un autre appareil a pris la place
 *   'active'        c'est cet appareil qui reçoit la notification
 */
export async function pushState() {
  if (!pushSupported()) return 'indisponible';
  if (Notification.permission === 'denied') return 'bloquee';
  const memo = lireMemo();
  if (Notification.permission !== 'granted' || !memo) return 'inactive';
  const enLigne = await getPushSubscription();
  return enLigne && enLigne.endpoint === memo ? 'active' : 'ailleurs';
}

/**
 * Abonne cet appareil, à la place du précédent. Renvoie l'état final.
 *
 * À appeler **depuis un geste** (un clic) : hors geste, le navigateur refuse
 * d'afficher la demande de permission.
 */
export async function subscribe() {
  if (!pushSupported()) return 'indisponible';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return pushState();
  const sub = await abonnement();
  await savePushSubscription(sub.toJSON());
  ecrireMemo(sub.endpoint);
  return 'active';
}

/**
 * À chaque ouverture de l'app : si cet appareil est l'abonné et que son
 * abonnement a changé — Chrome le renouvelle parfois de lui-même —, on range le
 * nouveau. Sinon la notification partirait vers une adresse morte, en silence.
 *
 * Une seule lecture Firestore, et seulement quand l'adresse a changé : si un
 * autre appareil a pris la place entre-temps, on la lui laisse.
 */
export async function refreshSubscription() {
  const memo = lireMemo();
  if (!memo || !pushSupported() || Notification.permission !== 'granted') return;
  const sub = await abonnement();
  if (sub.endpoint === memo) return;
  const enLigne = await getPushSubscription();
  if (enLigne && enLigne.endpoint !== memo) {
    ecrireMemo(null);   // un autre appareil est l'abonné : on s'efface
    return;
  }
  await savePushSubscription(sub.toJSON());
  ecrireMemo(sub.endpoint);
}

/** L'abonnement de l'appareil, créé s'il n'existe pas encore. */
async function abonnement() {
  const reg = await navigator.serviceWorker.ready;
  const existant = await reg.pushManager.getSubscription();
  if (existant) return existant;
  return reg.pushManager.subscribe({
    // Chrome l'exige : tout push reçu doit afficher une notification visible.
    userVisibleOnly: true,
    applicationServerKey: base64UrlEnOctets(VAPID_PUBLIC_KEY),
  });
}

/** base64url (sans `=`) → octets : la forme qu'attend `applicationServerKey`. */
function base64UrlEnOctets(b64) {
  const complet = b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(complet), (c) => c.charCodeAt(0));
}

// `localStorage` peut manquer ou lever (navigation privée, données effacées) :
// on fait alors comme si cet appareil n'était pas abonné.
function lireMemo() {
  try { return localStorage.getItem(MEMO); } catch { return null; }
}
function ecrireMemo(endpoint) {
  try {
    if (endpoint) localStorage.setItem(MEMO, endpoint);
    else localStorage.removeItem(MEMO);
  } catch { /* rien à faire */ }
}
