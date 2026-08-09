// app.js — coque de l'application : connexion, routeur, en-tête, démarrage.
//
// Ce fichier **oriente**, il ne calcule rien : le tirage vit dans `quiz.js`, les
// données dans `store.js`, le rendu des maths dans `mathtext.js`, chaque écran
// dans `views/`.

import { el, fill } from './dom.js';
import { onUserChange, currentUser, signOut } from './auth.js';
import { seedIfEmpty } from './store.js';
import { ecranConnexion } from './views/connexion.js';

import * as accueil from './views/accueil.js';
import * as test from './views/test.js';
import * as cartes from './views/cartes.js';
import * as editeur from './views/editeur.js';
import * as chapitres from './views/chapitres.js';

// L'ordre compte : la première expression qui correspond gagne. « nouvelle » est
// placée avant la route générique d'édition pour que l'intention soit lisible
// ici, sans avoir à raisonner sur la forme des identifiants.
const ROUTES = [
  { path: /^\/$/,                            view: accueil,   title: 'Agrég' },
  { path: /^\/chapitres$/,                   view: chapitres, title: 'Chapitres' },
  { path: /^\/test\/(.+)$/,                  view: test,    title: 'Test' },
  { path: /^\/cartes\/(.+)$/,                view: cartes,  title: 'Cartes' },
  { path: /^\/carte\/nouvelle\/(.+)$/,       view: editeur, title: 'Nouvelle carte', mode: 'creation' },
  { path: /^\/carte\/([^/]+)(?:\/(test))?$/, view: editeur, title: 'Modifier',       mode: 'edition' },
];

const mount = document.getElementById('view');
const titleEl = document.getElementById('view-title');
const leftEl = document.getElementById('header-left');
const rightEl = document.getElementById('header-right');

// Un rendu est asynchrone (il interroge Firestore). Si une navigation survient
// entre-temps, le rendu en cours devient périmé : ce compteur permet de le jeter
// au lieu de le laisser écrire par-dessus le nouvel écran. Chaque rendu travaille
// d'ailleurs dans un conteneur détaché, attaché seulement à la toute fin.
let renderToken = 0;

/** Vrai une fois l'utilisateur connecté ; sinon, seul le mur d'entrée s'affiche. */
let connecte = false;

async function renderRoute() {
  const token = ++renderToken;
  const isStale = () => token !== renderToken;

  if (!connecte) {
    titleEl.textContent = 'Agrég';
    fill(leftEl);
    fill(rightEl);
    mount.replaceChildren(ecranConnexion());
    return;
  }

  const path = (location.hash || '#/').slice(1);
  const found = ROUTES.map((r) => ({ r, m: path.match(r.path) })).find(({ m }) => m);
  const { r, m } = found || { r: ROUTES[0], m: ['/'] };

  const container = el('div');
  const header = { title: r.title, left: null, right: null };

  // Contexte donné à la vue : de quoi écrire dans la coque sans la connaître.
  const ctx = {
    root: container,
    params: m.slice(1),
    // Certaines vues servent plusieurs routes (l'éditeur : création ou
    // modification). La route le dit explicitement, la vue n'a rien à deviner.
    mode: r.mode,
    setTitle(t) { header.title = t; },
    setHeader(left, right) { header.left = left; header.right = right; },
    go(to) { location.hash = '#' + to; },
    refresh() { renderRoute(); },
  };

  try {
    await r.view.render(ctx);
  } catch (err) {
    console.error(err);
    fill(container, el('p', { class: 'empty' }, 'Erreur : ' + err.message));
  }
  if (isStale()) return;

  titleEl.textContent = header.title;
  // Sur l'accueil, la place à gauche est libre (rien d'où revenir) : on y met
  // l'accès au compte. Ailleurs elle sert au retour, posé par la vue.
  fill(leftEl, header.left || (path === '/' ? boutonCompte() : null));
  fill(rightEl, header.right);
  mount.replaceChildren(container);
  window.scrollTo(0, 0);
}

/** Bouton discret de déconnexion, avec l'initiale du compte connecté. */
function boutonCompte() {
  const u = currentUser();
  const initiale = (u && (u.displayName || u.email) || '?').trim()[0].toUpperCase();
  return el('button', {
    class: 'btn-sm',
    title: u ? `Connecté : ${u.email}` : '',
    on: { click: () => { if (confirm('Se déconnecter ?')) signOut(); } },
  }, initiale);
}

// Point de départ : on attend que Firebase ait restauré la session enregistrée.
// Sans cette attente, l'app afficherait le mur de connexion une fraction de
// seconde à chaque ouverture, même déjà connecté.
onUserChange(async (user) => {
  connecte = !!user;
  if (connecte) {
    try {
      await seedIfEmpty();
    } catch (err) {
      console.error('Création des chapitres :', err);
    }
  }
  renderRoute();
});

window.addEventListener('hashchange', renderRoute);
