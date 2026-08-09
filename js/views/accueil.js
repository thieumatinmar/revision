// views/accueil.js — la liste des catégories, point d'entrée de l'app.
//
// Un test porte toujours sur une seule catégorie : il n'y a donc pas d'entrée
// « toutes catégories » ici, c'est une décision actée (docs/decisions.md).

import { el } from '../dom.js';
import { listCategories, countByCategory } from '../store.js';

export async function render(ctx) {
  // Deux requêtes pour tout l'écran, quel que soit le nombre de chapitres.
  const [categories, compte] = await Promise.all([listCategories(), countByCategory()]);
  const counts = categories.map((c) => compte.get(c.id) || 0);

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
}
