// views/bibliotheque.js — le rayon des théorèmes : chercher, parcourir, ouvrir.
//
// La liste est plate, triée par titre, sans chapitre ni ordre à la main : c'est
// la recherche qui sert de rangement (docs/decisions.md, « La bibliothèque de
// théorèmes »).
//
// La recherche filtre sans repasser par le routeur — elle doit répondre à chaque
// frappe, et rien n'a changé en base entre deux caractères tapés. Le filtre
// lui-même vit dans `recherche.js` : une vue orchestre, elle ne calcule pas.

import { el, fill } from '../dom.js';
import { render as renderMath, excerpt, stripMath } from '../mathtext.js';
import { listTheorems } from '../store.js';
import { filtre } from '../recherche.js';

export async function render(ctx) {
  const theorems = await listTheorems();

  ctx.setTitle('Bibliothèque');
  ctx.setHeader(
    el('a', { class: 'btn btn-sm btn-ghost', href: '#/' }, '‹ Chapitres'),
    el('a', { class: 'btn btn-sm btn-primary', href: '#/theoreme/nouveau' }, '+ Théorème'),
  );

  let query = '';

  const search = el('input', {
    type: 'search',
    placeholder: 'Chercher un théorème, un mot de l’énoncé, un outil de la preuve…',
    on: { input: (e) => { query = e.target.value; paint(); } },
  });

  const list = el('div');
  ctx.root.append(theorems.length > 0 && search, list);

  function paint() {
    const vus = filtre(theorems, query);

    if (vus.length === 0) {
      fill(list, el('p', { class: 'empty' },
        query ? 'Aucun théorème ne correspond.' : 'La bibliothèque est vide.',
        el('br'),
        !query && el('a', {
          class: 'btn btn-primary', href: '#/theoreme/nouveau', style: 'margin-top:16px',
        }, 'Ajouter le premier'),
      ));
      return;
    }

    fill(list,
      el('p', { class: 'small muted' },
        `${vus.length} théorème${vus.length > 1 ? 's' : ''}`
        + (query ? ` trouvé${vus.length > 1 ? 's' : ''}` : '')),
      el('ul', { class: 'list' }, vus.map(ligne)),
    );
  }

  /**
   * Une ligne : le titre, et la première ligne de l'énoncé en gris.
   *
   * L'énoncé n'y est **pas composé** — une formule rendue déforme la hauteur des
   * lignes, et une liste qui ondule ne se balaye plus. On montre donc la source
   * dépouillée de ses `$`, tronquée : de quoi reconnaître, pas de quoi lire.
   * Pour lire, on ouvre.
   */
  function ligne(t) {
    return el('li', {},
      el('a', {
        class: 'grow',
        href: `#/theoreme/${t.id}`,
        style: 'text-decoration:none;color:inherit',
      },
        renderMath(el('div', { class: 'name' }), excerpt(t.title || t.statement)),
        el('div', { class: 'small muted' }, excerpt(stripMath(t.statement), 70)),
      ),
    );
  }

  paint();
}
