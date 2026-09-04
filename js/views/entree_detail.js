// views/entree_detail.js — une entrée de bibliothèque, en entier.
//
// Rien n'y est caché ni révélé : une entrée se consulte. Le montage lui-même
// vient de `entree.js`, partagé avec l'aperçu de l'éditeur et le dépliage d'un
// renvoi — trois montages divergeraient en silence.

import { el, fill } from '../dom.js';
import { render as renderMath, excerpt, stripMath } from '../mathtext.js';
import { faceEntree, espece } from '../entree.js';
import { getEntry, cardsCiting } from '../store.js';

export async function render(ctx) {
  const id = ctx.params[0];
  // « Cité par » n'est pas une donnée de l'entrée : c'est une question posée aux
  // cartes. Les deux lectures partent ensemble, l'une n'attend pas l'autre.
  const [entry, citantes] = await Promise.all([getEntry(id), cardsCiting(id)]);

  if (!entry) {
    ctx.setTitle('Entrée');
    ctx.root.append(el('p', { class: 'empty' }, 'Entrée introuvable.'));
    return;
  }

  // Le titre de l'écran dit l'espèce : c'est le repère qu'on lit sans réfléchir
  // en arrivant depuis une liste où les deux se mélangent.
  ctx.setTitle(espece(entry).nom);
  ctx.setHeader(
    el('a', { class: 'btn btn-sm btn-ghost', href: '#/bibliotheque' }, '‹ Bibliothèque'),
    el('a', { class: 'btn btn-sm', href: `#/entree/${id}/editer` }, 'Modifier'),
  );

  fill(ctx.root,
    faceEntree(entry),

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
 * une carte entière (son aperçu), et la question derrière « qui cite cette
 * entrée ? » est presque toujours « et qu'est-ce que j'en disais ? ». D'où
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
