// views/test.js — l'écran de test : recto, indication à la demande, verso + note.
//
// Le flux ne se termine jamais et ne mémorise rien (décision actée). Cet écran
// garde donc un seul état, purement local : la carte courante et ce qui en est
// dévoilé. Rien n'est écrit nulle part.
//
// Il se redessine lui-même au lieu de repasser par le routeur : `ctx.refresh()`
// relirait les cartes en base à chaque « suivante », pour rien.

import { el, fill } from '../dom.js';
import { render as renderMath } from '../mathtext.js';
import { listCards, getCategory } from '../store.js';
import { draw } from '../quiz.js';

export async function render(ctx) {
  const categoryId = ctx.params[0];
  const [category, cards] = await Promise.all([getCategory(categoryId), listCards(categoryId)]);

  ctx.setTitle(category ? category.name : 'Test');
  ctx.setHeader(el('a', { class: 'btn btn-sm btn-ghost', href: '#/' }, '‹ Retour'), null);

  const stage = el('div');
  ctx.root.append(stage);

  if (cards.length === 0) {
    fill(stage, el('p', { class: 'empty' }, 'Aucune carte dans ce chapitre.'));
    return;
  }

  let card = draw(cards);
  let showHint = false;
  let showBack = false;

  function next() {
    card = draw(cards);
    showHint = false;
    showBack = false;
    paint();
  }

  function paint() {
    fill(stage,
      el('div', { class: 'card-face' },
        // Le titre est facultatif : sans lui, la carte commence directement au
        // recto, sans en-tête vide.
        card.title
          ? renderMath(el('div', { class: 'titre-carte' }), card.title)
          : el('div', { class: 'face-label' }, 'Recto'),
        renderMath(el('div'), card.front),

        showHint && card.hint && el('div', { class: 'hint' },
          el('div', { class: 'face-label' }, 'Indication'),
          renderMath(el('div'), card.hint),
        ),

        showBack && el('hr'),
        showBack && el('div', { class: 'face-label' }, 'Verso'),
        showBack && renderMath(el('div'), card.back),

        // Les images font partie de la réponse : elles n'apparaissent donc
        // qu'avec le verso, jamais avant.
        showBack && Array.isArray(card.images) && card.images.length > 0
          && el('div', { class: 'images-verso' },
            card.images.map((url, i) => el('img', {
              src: url,
              alt: `Image ${i + 1} de la réponse`,
              loading: 'lazy',
            })),
          ),

        showBack && card.note && el('div', { class: 'note' }, renderMath(el('div'), card.note)),
      ),

      el('div', { class: 'actions' },
        // L'indication ne s'offre que si la carte en a une, et disparaît une
        // fois le verso montré : elle n'a plus de sens.
        !showBack && card.hint && !showHint
          && el('button', { on: { click: () => { showHint = true; paint(); } } }, 'Indication'),
        !showBack
          ? el('button', { class: 'btn-primary', on: { click: () => { showBack = true; paint(); } } }, 'Réponse')
          : el('button', { class: 'btn-primary', on: { click: next } }, 'Suivante'),
      ),

      el('p', { class: 'small muted', style: 'text-align:center;margin-top:18px' },
        `Tirage au hasard parmi ${cards.length} carte${cards.length > 1 ? 's' : ''} — le test ne se termine pas.`),

      // Corriger sans sortir du test : le suffixe /test dit à l'éditeur de
      // revenir ici, pas dans la liste du chapitre.
      el('p', { style: 'text-align:center;margin-top:4px' },
        el('a', { class: 'btn btn-sm btn-ghost', href: `#/carte/${card.id}/test` },
          'Modifier cette carte')),
    );
  }

  paint();
}
