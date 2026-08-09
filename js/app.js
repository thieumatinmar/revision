// app.js — coque de l'application : routeur, en-tête, démarrage.
//
// Ce fichier **oriente**, il ne calcule rien : le tirage vit dans `quiz.js`, les
// données dans `store.js`, le rendu des maths dans `mathtext.js`, chaque écran
// dans `views/`.

import { el, fill } from './dom.js';

import * as accueil from './views/accueil.js';
import * as test from './views/test.js';

const ROUTES = [
  { path: /^\/$/,              view: accueil, title: 'Agrég' },
  { path: /^\/test\/(.+)$/,    view: test,    title: 'Test' },
];

const mount = document.getElementById('view');
const titleEl = document.getElementById('view-title');
const leftEl = document.getElementById('header-left');
const rightEl = document.getElementById('header-right');

// Un rendu est asynchrone (il interrogera Firestore). Si une navigation survient
// entre-temps, le rendu en cours devient périmé : ce compteur permet de le jeter
// au lieu de le laisser écrire par-dessus le nouvel écran. Chaque rendu travaille
// d'ailleurs dans un conteneur détaché, attaché seulement à la toute fin.
let renderToken = 0;

async function renderRoute() {
  const token = ++renderToken;
  const isStale = () => token !== renderToken;

  const path = (location.hash || '#/').slice(1);
  const found = ROUTES.map((r) => ({ r, m: path.match(r.path) })).find(({ m }) => m);
  const { r, m } = found || { r: ROUTES[0], m: ['/'] };

  const container = el('div');
  const header = { title: r.title, left: null, right: null };

  // Contexte donné à la vue : de quoi écrire dans la coque sans la connaître.
  const ctx = {
    root: container,
    params: m.slice(1),
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
  fill(leftEl, header.left);
  fill(rightEl, header.right);
  mount.replaceChildren(container);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', renderRoute);
renderRoute();
