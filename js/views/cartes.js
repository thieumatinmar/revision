// views/cartes.js — les cartes d'un chapitre : relire, chercher, ouvrir, créer.
//
// La recherche filtre sans repasser par le routeur : elle doit répondre à chaque
// frappe, et rien n'a changé en base entre deux caractères tapés.

import { el, fill } from '../dom.js';
import { render as renderMath, excerpt } from '../mathtext.js';
import { listCards, getCategory } from '../store.js';

export async function render(ctx) {
  const categoryId = ctx.params[0];
  const [category, cards] = await Promise.all([getCategory(categoryId), listCards(categoryId)]);

  ctx.setTitle(category ? category.name : 'Cartes');
  ctx.setHeader(
    el('a', { class: 'btn btn-sm btn-ghost', href: '#/' }, '‹ Chapitres'),
    el('a', { class: 'btn btn-sm btn-primary', href: `#/carte/nouvelle/${categoryId}` }, '+ Carte'),
  );

  const search = el('input', {
    type: 'search',
    placeholder: 'Chercher…',
    on: { input: (e) => paint(e.target.value.trim().toLowerCase()) },
  });

  const list = el('div');
  ctx.root.append(cards.length > 0 && search, list);

  function paint(query = '') {
    // On cherche dans les quatre champs : une carte se retrouve aussi bien par
    // sa réponse ou par un mot de la note que par son recto.
    const found = cards.filter((c) => !query
      || [c.front, c.hint, c.back, c.note].join(' ').toLowerCase().includes(query));

    if (found.length === 0) {
      fill(list, el('p', { class: 'empty' },
        query
          ? 'Aucune carte ne correspond.'
          : 'Aucune carte dans ce chapitre.',
        el('br'),
        !query && el('a', { class: 'btn btn-primary', href: `#/carte/nouvelle/${categoryId}`, style: 'margin-top:16px' },
          'Créer la première'),
      ));
      return;
    }

    fill(list,
      el('p', { class: 'small muted' },
        `${found.length} carte${found.length > 1 ? 's' : ''}${query ? ' trouvée' + (found.length > 1 ? 's' : '') : ''}`),
      el('ul', { class: 'list' },
        found.map((card) => el('li', {},
          el('a', { class: 'grow', href: `#/carte/${card.id}`, style: 'text-decoration:none;color:inherit' },
            renderMath(el('div', { class: 'name' }), excerpt(card.front)),
            el('div', { class: 'small muted' }, excerpt(stripMath(card.back), 70)),
          ),
        )),
      ),
    );
  }

  paint();
}

/**
 * Aperçu du verso en texte brut : dans une liste, une formule rendue déforme la
 * hauteur des lignes. On garde la source LaTeX, dépouillée de ses délimiteurs.
 */
function stripMath(source) {
  return String(source ?? '').replace(/\$\$?/g, '');
}
