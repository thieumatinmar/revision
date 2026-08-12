// carte.js — le montage d'une carte : ses faces, dans l'ordre, en un élément.
//
// Deux écrans doivent afficher **la même** carte : le test, qui révèle les faces
// une à une, et l'aperçu de l'éditeur, qui les montre toutes d'un coup. Écrire
// le montage deux fois le ferait diverger au premier champ ajouté — et diverger
// en silence : l'aperçu montrerait alors une carte qui n'existe pas en test,
// exactement ce qu'il est censé empêcher.
//
// Ce fichier n'est ni une vue (aucune route, aucun accès au store) ni un helper
// DOM : c'est un **composant**, le premier de l'app. Il ne lit rien, ne range
// rien — on lui donne une carte, il rend un élément.

import { el } from './dom.js';
import { render as renderMath } from './mathtext.js';

/**
 * Monte une carte et renvoie l'élément `.card-face`.
 *
 *   faceCarte(card)                            → recto seul (début de test)
 *   faceCarte(card, { hint: true })            → recto + indication
 *   faceCarte(card, { hint: true, back: true }) → tout (aperçu de l'éditeur)
 *
 * `hint` et `back` disent ce qui est **révélé**, pas ce qui existe : une carte
 * sans indication n'affiche rien même avec `hint: true`.
 */
export function faceCarte(card, { hint = false, back = false } = {}) {
  const images = Array.isArray(card.images) ? card.images : [];

  return el('div', { class: 'card-face' },
    // Le titre est facultatif : sans lui, la carte commence directement au
    // recto, sans en-tête vide.
    card.title
      ? renderMath(el('div', { class: 'titre-carte' }), card.title)
      : el('div', { class: 'face-label' }, 'Recto'),
    renderMath(el('div'), card.front),

    hint && card.hint && el('div', { class: 'hint' },
      el('div', { class: 'face-label' }, 'Indication'),
      renderMath(el('div'), card.hint),
    ),

    back && el('hr'),
    back && el('div', { class: 'face-label' }, 'Verso'),
    back && renderMath(el('div'), card.back),

    // Les images font partie de la réponse : elles n'apparaissent donc qu'avec
    // le verso, jamais avant.
    back && images.length > 0 && el('div', { class: 'images-verso' },
      images.map((url, i) => el('img', {
        src: url,
        alt: `Image ${i + 1} de la réponse`,
        loading: 'lazy',
      })),
    ),

    back && card.note && el('div', { class: 'note' }, renderMath(el('div'), card.note)),
  );
}
