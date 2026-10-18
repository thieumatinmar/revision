// sw.js — service worker : c'est lui qui rend l'app installable sur l'écran
// d'accueil et utilisable sans réseau.
//
// Deux stratégies, et le partage est délibéré :
//
//   vendor/**            → **cache d'abord**. KaTeX, ses polices et le SDK
//                          Firebase pèsent ~1,7 Mo et ne changent que lorsqu'on
//                          les revendorise à la main. Les relire depuis le
//                          réseau à chaque ouverture serait du gaspillage.
//
//   tout le reste        → **réseau d'abord**, avec repli sur le cache.
//                          Nos propres fichiers changent à chaque déploiement.
//                          Or GitHub Pages les sert avec `max-age=600` : un
//                          cache d'abord empilerait son propre retard sur celui
//                          du navigateur, et on ne saurait plus jamais si une
//                          fonctionnalité est cassée ou simplement pas arrivée.
//                          D'où aussi le `cache: 'reload'`, qui court-circuite
//                          le cache HTTP du navigateur.
//
// Les données, elles, ne passent pas par ici : Firestore tient son propre cache
// local persistant.

const CACHE = 'agreg-revision-v1';

// Le strict nécessaire pour que l'app démarre hors ligne. Les polices KaTeX et
// les bundles Firebase s'ajoutent au cache à la première utilisation — les
// précharger ferait ~1,7 Mo au premier lancement, sur un réseau peut-être mauvais.
const COQUE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/dom.js',
  'js/store.js',
  'js/auth.js',
  'js/firebase.js',
  'js/mathtext.js',
  'js/carte.js',
  'js/entree.js',
  'js/recherche.js',
  'js/raccourcis.js',
  'js/images.js',
  'js/version.js',
  'js/jours.js',
  'js/push.js',
  'js/views/accueil.js',
  'js/views/cartes.js',
  'js/views/editeur.js',
  'js/views/chapitres.js',
  'js/views/connexion.js',
  'js/views/bibliotheque.js',
  'js/views/entree_detail.js',
  'js/views/editeur_entree.js',
  'js/views/interro.js',
  'icons/icon-192.png',
  'vendor/katex/katex.min.css',
  'vendor/katex/katex.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(COQUE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // On ne touche qu'aux GET de notre origine : les appels à Firestore et à
  // l'authentification Google doivent passer sans interférence.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    url.pathname.includes('/vendor/') ? cacheDAbord(req) : reseauDAbord(req)
  );
});

// ------------------------------------------------- Notification de l'interro
//
// Chaque matin, GitHub Actions envoie un Web Push (voir js/push.js pour le
// chemin complet). Il arrive ici, même app fermée : le service worker est
// réveillé pour l'occasion. Le message est un petit JSON `{ title, body, url }`,
// tout facultatif — sans lui, on dit l'essentiel quand même.
//
// `tag` : une notification non lue de la veille est **remplacée**, pas empilée.

self.addEventListener('push', (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { /* texte brut : on l'ignore */ }
  event.waitUntil(self.registration.showNotification(msg.title || 'Interro du jour', {
    body: msg.body || 'Cinq questions t’attendent.',
    icon: 'icons/icon-192.png',
    tag: 'interro-du-jour',
    data: { url: msg.url || '#/interro' },
  }));
});

// Un tap sur la notification : on ramène l'app au premier plan, sur l'interro.
// Si une fenêtre de l'app est déjà ouverte, on la réutilise plutôt que d'en
// ouvrir une seconde.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '#/interro', self.registration.scope).href;
  event.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const ouverte = fenetres.find((f) => f.url.startsWith(self.registration.scope));
    if (ouverte) {
      await ouverte.focus();
      // `navigate` n'est permis que sur une fenêtre que ce service worker
      // contrôle ; à défaut, on en ouvre une neuve.
      try { return await ouverte.navigate(url); } catch { /* repli ci-dessous */ }
    }
    return self.clients.openWindow(url);
  })());
});

async function cacheDAbord(req) {
  const cache = await caches.open(CACHE);
  const trouve = await cache.match(req);
  if (trouve) return trouve;
  const rep = await fetch(req);
  if (rep.ok) cache.put(req, rep.clone());
  return rep;
}

async function reseauDAbord(req) {
  const cache = await caches.open(CACHE);
  try {
    // `cache: 'reload'` force un vrai aller-retour : sans lui, le cache HTTP du
    // navigateur (max-age=600) répondrait à notre place.
    const rep = await fetch(req, { cache: 'reload' });
    if (rep.ok) cache.put(req, rep.clone());
    return rep;
  } catch (err) {
    const trouve = await cache.match(req);
    if (trouve) return trouve;
    // Hors ligne sur une URL jamais visitée : on rend la coque, le routeur par
    // ancre fera le reste.
    if (req.mode === 'navigate') {
      const coque = await cache.match('index.html');
      if (coque) return coque;
    }
    throw err;
  }
}
