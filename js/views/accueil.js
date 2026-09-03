// views/accueil.js — la liste des catégories, point d'entrée de l'app.
//
// Un test porte toujours sur une seule catégorie : il n'y a donc pas d'entrée
// « toutes catégories » ici, c'est une décision actée (docs/decisions.md).

import { el } from '../dom.js';
import { listCategories, countByCategory, countTheorems } from '../store.js';

export async function render(ctx) {
  // Deux requêtes pour tout l'écran, quel que soit le nombre de chapitres.
  const [categories, compte, theoremes] = await Promise.all([
    listCategories(), countByCategory(), countTheorems(),
  ]);
  // `countByCategory` renvoie { total, unplaced } : l'accueil ne montre que le
  // total, le détail des non rangées appartient à l'écran de gestion.
  const counts = categories.map((c) => (compte.get(c.id) || { total: 0 }).total);

  // À gauche, la coque met l'accès au compte : ici on ne pose que la droite.
  ctx.setHeader(null, el('a', { class: 'btn btn-sm btn-ghost', href: '#/chapitres' }, 'Gérer'));

  ctx.root.append(
    el('p', { class: 'muted small' },
      'Touche le nom d’un chapitre pour voir ses cartes, « Tester » pour lancer un tirage.'),
    el('ul', { class: 'list' },
      categories.map((cat, i) => el('li', {},
        el('a', {
          class: 'grow',
          href: `#/cartes/${cat.id}`,
          style: 'text-decoration:none;color:inherit',
        },
          el('div', { class: 'name' }, cat.name),
          el('div', { class: 'small muted' },
            counts[i] === 0 ? 'aucune carte' : `${counts[i]} carte${counts[i] > 1 ? 's' : ''}`),
        ),
        // « Tester » n'apparaît que s'il y a de quoi tirer. Un chapitre vide
        // renvoie vers sa liste, seul endroit d'où en créer une.
        counts[i] > 0
          ? el('a', { class: 'btn btn-sm btn-primary', href: `#/test/${cat.id}` }, 'Tester')
          : el('a', { class: 'btn btn-sm', href: `#/carte/nouvelle/${cat.id}` }, '+'),
      )),
    ),
  );

  // La bibliothèque est un **second rayon** : elle n'a pas de chapitre, donc pas
  // sa place dans la liste ci-dessus. Un bloc pleine largeur en dessous, plutôt
  // qu'un troisième bouton dans l'en-tête — sur un téléphone, « compte »,
  // « Gérer » et un troisième feraient trois cibles collées.
  ctx.root.append(
    el('a', { class: 'bloc-bibliotheque', href: '#/bibliotheque' },
      el('div', { class: 'name' }, 'Bibliothèque'),
      el('div', { class: 'small muted' },
        theoremes === 0
          ? 'énoncés et esquisses de preuve — vide pour l’instant'
          : `${theoremes} théorème${theoremes > 1 ? 's' : ''} — énoncés et esquisses de preuve`),
    ),
  );
}
