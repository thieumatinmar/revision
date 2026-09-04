// views/accueil.js — la liste des catégories, point d'entrée de l'app.
//
// L'écran se contente d'orienter : un chapitre mène à ses cartes, le bloc du bas
// à la bibliothèque. Il ne compte rien lui-même — `countByCategory` le fait en
// une requête.

import { el } from '../dom.js';
import { listCategories, countByCategory, countEntries, THEOREM, DEFINITION } from '../store.js';

export async function render(ctx) {
  // Deux requêtes pour tout l'écran, quel que soit le nombre de chapitres.
  const [categories, compte, entrees] = await Promise.all([
    listCategories(), countByCategory(), countEntries(),
  ]);
  // `countByCategory` renvoie { total, unplaced } : l'accueil ne montre que le
  // total, le détail des non rangées appartient à l'écran de gestion.
  const counts = categories.map((c) => (compte.get(c.id) || { total: 0 }).total);

  // À gauche, la coque met l'accès au compte : ici on ne pose que la droite.
  ctx.setHeader(null, el('a', { class: 'btn btn-sm btn-ghost', href: '#/chapitres' }, 'Gérer'));

  ctx.root.append(
    el('p', { class: 'muted small' },
      'Touche un chapitre pour voir ses cartes, « + » pour en ajouter une.'),
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
        // Ajouter une carte sans passer par la liste du chapitre : c'est le geste
        // le plus fréquent en phase de saisie.
        el('a', { class: 'btn btn-sm', href: `#/carte/nouvelle/${cat.id}` }, '+'),
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
        entrees.total === 0
          ? 'théorèmes et définitions — vide pour l’instant'
          : `${entrees[THEOREM]} théorème${entrees[THEOREM] > 1 ? 's' : ''}, `
            + `${entrees[DEFINITION]} définition${entrees[DEFINITION] > 1 ? 's' : ''}`),
    ),
  );
}
