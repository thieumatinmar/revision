// views/theoreme_detail.js — un théorème, en entier.
//
// Rien n'y est caché ni révélé : c'est ce qui sépare la bibliothèque du test.
// Le montage lui-même vient de `theoreme.js`, partagé avec l'aperçu de
// l'éditeur — deux montages divergeraient en silence.

import { el } from '../dom.js';
import { render as renderMath, excerpt, stripMath } from '../mathtext.js';
import { faceTheoreme } from '../theoreme.js';
import { getTheorem, cardsCiting } from '../store.js';

export async function render(ctx) {
  const id = ctx.params[0];
  // « Cité par » n'est pas une donnée du théorème : c'est une question posée aux
  // cartes. Les deux lectures partent ensemble, l'une n'attend pas l'autre.
  const [theorem, citantes] = await Promise.all([getTheorem(id), cardsCiting(id)]);

  if (!theorem) {
    ctx.setTitle('Théorème');
    ctx.root.append(el('p', { class: 'empty' }, 'Théorème introuvable.'));
    return;
  }

  ctx.setTitle('Théorème');
  ctx.setHeader(
    el('a', { class: 'btn btn-sm btn-ghost', href: '#/bibliotheque' }, '‹ Bibliothèque'),
    el('a', { class: 'btn btn-sm', href: `#/theoreme/${id}/editer` }, 'Modifier'),
  );

  ctx.root.append(
    faceTheoreme(theorem),

    // L'autre bout du renvoi. Absent quand personne ne cite : un encart « aucune
    // carte » sur chaque fiche serait du bruit permanent pour une information
    // qui ne sert qu'au moment où elle existe.
    citantes.length > 0 && el('div', { class: 'cite-par' },
      el('div', { class: 'face-label' },
        `Cité par ${citantes.length} carte${citantes.length > 1 ? 's' : ''}`),
      el('ul', { class: 'list' }, citantes.map(ligneCarte)),
    ),
  );
}

/**
 * Une carte citante. Elle mène à l'éditeur : c'est le **seul** écran qui montre
 * une carte entière (son aperçu), et la question derrière « qui cite ce
 * théorème ? » est presque toujours « et qu'est-ce que j'en disais ? ». D'où
 * « Ouvrir » plutôt que « Modifier » : on vient lire, la correction n'est qu'une
 * possibilité.
 *
 * Le recto n'est pas composé mais dépouillé de ses `$` : dans une liste, une
 * formule rendue déforme la hauteur des lignes.
 */
function ligneCarte(card) {
  return el('li', {},
    el('a', {
      class: 'grow',
      href: `#/carte/${card.id}`,
      style: 'text-decoration:none;color:inherit',
    },
      renderMath(el('div', { class: 'name' }), excerpt(card.title || card.front)),
      card.title && el('div', { class: 'small muted' }, excerpt(stripMath(card.front), 70)),
    ),
    el('a', { class: 'btn btn-sm', href: `#/carte/${card.id}` }, 'Ouvrir'),
  );
}
