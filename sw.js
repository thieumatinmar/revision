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
  'js/quiz.js',
  'js/auth.js',
  'js/firebase.js',
  'js/mathtext.js',
  'js/images.js',
  'js/version.js',
  'js/views/accueil.js',
  'js/views/test.js',
  'js/views/cartes.js',
  'js/views/editeur.js',
  'js/views/chapitres.js',
  'js/views/connexion.js',
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
