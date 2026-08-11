// views/test.js — l'écran de test : recto, indication à la demande, verso + note.
//
// Deux modes, choisis ici même (pas d'écran ni de route de plus) :
//   — **Aléatoire** : le flux ne se termine jamais et ne mémorise rien.
//   — **Dans l'ordre** : les cartes du chapitre dans leur ordre, une fois
//     chacune, puis un écran de fin. Les cartes non rangées passent à la fin,
//     jamais sautées : une carte hors du tirage est une carte jamais révisée.
//
// Le mode n'est pas mémorisé d'une session à l'autre : rien n'est écrit nulle
// part pendant un test (décision « test sans état »). Il repart donc en
// aléatoire, le comportement historique.
//
// L'écran se redessine lui-même au lieu de repasser par le routeur :
// `ctx.refresh()` relirait les cartes en base à chaque « suivante », pour rien.

import { el, fill } from '../dom.js';
import { render as renderMath } from '../mathtext.js';
import { listCards, getCategory } from '../store.js';
import { nextCard, MODES } from '../quiz.js';

export async function render(ctx) {
  const categoryId = ctx.params[0];
  // `listCards` rend déjà les cartes dans l'ordre du chapitre : la vue n'a rien
  // à trier, elle ne fait que parcourir.
  const [category, cards] = await Promise.all([getCategory(categoryId), listCards(categoryId)]);

  ctx.setTitle(category ? category.name : 'Test');
  ctx.setHeader(el('a', { class: 'btn btn-sm btn-ghost', href: '#/' }, '‹ Retour'), null);

  const stage = el('div');
  ctx.root.append(stage);

  if (cards.length === 0) {
    fill(stage, el('p', { class: 'empty' }, 'Aucune carte dans ce chapitre.'));
    return;
  }

  let mode = MODES.RANDOM;
  let index = 0;
  let card = nextCard(cards, mode, index).card;
  let showHint = false;
  let showBack = false;

  function suivante() {
    // En ordonné on avance d'un cran ; en aléatoire l'index ne sert pas.
    const suite = nextCard(cards, mode, mode === MODES.ORDERED ? index + 1 : 0);
    card = suite.card;
    index = suite.index;
    showHint = false;
    showBack = false;
    paint();
  }

  /** Changer de mode (ou recommencer une passe) repart du début. */
  function demarrer(nouveauMode) {
    mode = nouveauMode;
    index = 0;
    const suite = nextCard(cards, mode, 0);
    card = suite.card;
    showHint = false;
    showBack = false;
    paint();
  }

  function selecteurDeMode() {
    const bouton = (libelle, valeur) => el('button', {
      class: 'btn-sm' + (mode === valeur ? ' btn-primary' : ''),
      on: { click: () => demarrer(valeur) },
    }, libelle);

    return el('div', { class: 'modes' },
      bouton('Aléatoire', MODES.RANDOM),
      bouton('Dans l’ordre', MODES.ORDERED),
    );
  }

  function paint() {
    // Passe ordonnée terminée : c'est le seul écran de fin de l'app, et il n'est
    // atteignable que dans ce mode.
    if (!card) {
      fill(stage,
        selecteurDeMode(),
        el('div', { class: 'card-face' },
          el('div', { class: 'face-label' }, 'Fin du chapitre'),
          el('div', {},
            `Tour complet : ${cards.length} carte${cards.length > 1 ? 's' : ''} vue`
            + `${cards.length > 1 ? 's' : ''}.`),
        ),
        el('div', { class: 'actions' },
          el('button', { class: 'btn-primary', on: { click: () => demarrer(MODES.ORDERED) } },
            'Recommencer'),
          el('a', { class: 'btn', href: '#/' }, 'Retour'),
        ),
      );
      return;
    }

    fill(stage,
      selecteurDeMode(),

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
          : el('button', { class: 'btn-primary', on: { click: suivante } }, 'Suivante'),
      ),

      el('p', { class: 'small muted', style: 'text-align:center;margin-top:18px' },
        mode === MODES.ORDERED
          ? `Carte ${index + 1} / ${cards.length} — dans l’ordre du chapitre.`
          : `Tirage au hasard parmi ${cards.length} carte${cards.length > 1 ? 's' : ''} — le test ne se termine pas.`),

      // Corriger sans sortir du test : le suffixe /test dit à l'éditeur de
      // revenir ici, pas dans la liste du chapitre.
      el('p', { style: 'text-align:center;margin-top:4px' },
        el('a', { class: 'btn btn-sm btn-ghost', href: `#/carte/${card.id}/test` },
          'Modifier cette carte')),
    );
  }

  paint();
}
