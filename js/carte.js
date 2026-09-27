// carte.js — le montage d'une carte : ses faces, dans l'ordre, en un élément.
//
// Le montage d'une carte vit ici, en un seul endroit : écrit deux fois, il
// divergerait au premier champ ajouté, et il divergerait en silence.
//
// Depuis le retrait du test, il n'a plus qu'un appelant — l'aperçu de
// l'éditeur. On le garde séparé quand même : `hint` et `back` décrivent ce qui
// est **révélé**, et ce vocabulaire resservira dès qu'un second écran montrera
// des cartes.
//
// Ce fichier n'est ni une vue (aucune route, aucun accès au store) ni un helper
// DOM : c'est un **composant**, le premier de l'app. Il ne lit rien, ne range
// rien — on lui donne une carte, il rend un élément.

import { el } from './dom.js';
import { render as renderMath, paragraphes } from './mathtext.js';

/**
 * Monte une carte et renvoie l'élément `.card-face`.
 *
 *   faceCarte(card)                            → recto seul
 *   faceCarte(card, { hint: true })            → recto + indication
 *   faceCarte(card, { hint: true, back: true }) → tout (aperçu de l'éditeur)
 *
 * `hint` et `back` disent ce qui est **révélé**, pas ce qui existe : une carte
 * sans indication n'affiche rien même avec `hint: true`. Le verso est
 * facultatif, et une carte qui n'en porte pas s'arrête au recto.
 */
export function faceCarte(card, { hint = false, back = false } = {}) {
  const images = Array.isArray(card.images) ? card.images : [];

  return el('div', { class: 'card-face' },
    // Le titre est facultatif : sans lui, la carte commence directement au
    // recto, sans en-tête vide.
    card.title
      ? renderMath(el('div', { class: 'titre-carte' }), card.title)
      : el('div', { class: 'face-label' }, 'Recto'),
    corps(card.front, 'front'),

    hint && card.hint && el('div', { class: 'hint' },
      el('div', { class: 'face-label' }, 'Indication'),
      renderMath(el('div'), card.hint),
    ),

    // Le verso est **facultatif** : sans lui la carte s'arrête au recto, sans
    // trait ni étiquette annonçant une face vide. Le trait revient dès qu'il y a
    // quelque chose après le recto — images comprises, sinon elles colleraient
    // au texte.
    back && (card.back || images.length > 0) && el('hr'),
    back && card.back && el('div', { class: 'face-label' }, 'Verso'),
    back && card.back && corps(card.back, 'back'),

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

/**
 * Le corps d'une face : le texte composé, **un nœud par paragraphe**.
 *
 * Chaque paragraphe est étiqueté de la face dont il vient et de sa position
 * dans la source. Rien ne change à l'œil — le découpage suit les lignes vides,
 * qui séparaient déjà visuellement. Ce que ça donne, c'est une carte où l'on
 * peut **désigner un endroit** : l'aperçu de l'éditeur s'en sert pour suivre le
 * curseur (`views/editeur.js`), et un texte monolithique ne l'aurait jamais
 * permis.
 *
 * `champ` vaut `'front'` ou `'back'` : deux paragraphes peuvent porter le même
 * offset, un dans chaque face, et sans lui l'aperçu sauterait de l'une à l'autre.
 */
function corps(texte, champ) {
  return paragraphes(texte || '').map((bloc) => renderMath(
    el('div', { class: 'bloc', dataset: { champ, at: String(bloc.at) } }),
    bloc.texte,
  ));
}
