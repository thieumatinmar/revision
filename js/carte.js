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

import { el, fill } from './dom.js';
import { render as renderMath } from './mathtext.js';
import { faceTheoreme } from './theoreme.js';

/**
 * Monte une carte et renvoie l'élément `.card-face`.
 *
 *   faceCarte(card)                            → recto seul (début de test)
 *   faceCarte(card, { hint: true })            → recto + indication
 *   faceCarte(card, { hint: true, back: true }) → tout (aperçu de l'éditeur)
 *
 * `hint` et `back` disent ce qui est **révélé**, pas ce qui existe : une carte
 * sans indication n'affiche rien même avec `hint: true`.
 *
 * `theorems` est la bibliothèque **déjà chargée**, passée par la vue : ce
 * composant est pur, il ne lit pas le store. Ce n'est pas un détour — les titres
 * des renvois doivent s'afficher avant tout clic, donc rien ne pouvait être
 * chargé au moment du clic.
 */
export function faceCarte(card, { hint = false, back = false, theorems = [] } = {}) {
  const images = Array.isArray(card.images) ? card.images : [];

  // Renvois résolus en théorèmes. Un identifiant inconnu est ignoré : supprimer
  // un théorème retire déjà ses renvois (store.js), mais un appareil hors ligne
  // peut réécrire une carte avec un renvoi périmé — ce filet évite d'afficher un
  // bouton qui n'ouvre rien.
  const renvois = (Array.isArray(card.theoremIds) ? card.theoremIds : [])
    .map((id) => theorems.find((t) => t.id === id))
    .filter(Boolean);

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

    // Les renvois nomment un théorème : les montrer avant le verso donnerait la
    // réponse. Même règle que les images, pour la même raison.
    back && renvois.length > 0 && blocRenvois(renvois),
  );
}

/**
 * « Voir aussi » : un bouton par théorème cité, qui le **déplie sur place**.
 *
 * Déplier et non naviguer : `test.js` garde tout son état en mémoire (mode,
 * position, verso révélé), et un lien le perdrait — on reviendrait à un test
 * reparti de zéro, pour une consultation de dix secondes.
 *
 * Un seul théorème ouvert à la fois : deux énoncés dépliés sous une carte, et
 * l'on ne sait plus ce qu'on lisait.
 */
function blocRenvois(renvois) {
  const zone = el('div');
  let ouvert = null;

  const boutons = renvois.map((t) => el('button', {
    class: 'btn-sm',
    on: { click: () => basculer(t) },
  }, t.title || 'Sans titre'));

  function basculer(t) {
    ouvert = ouvert === t.id ? null : t.id;
    boutons.forEach((b, i) => b.classList.toggle('btn-primary', renvois[i].id === ouvert));
    if (!ouvert) return fill(zone);
    fill(zone,
      faceTheoreme(t),
      // Pour qui veut vraiment y aller : la fiche complète, et la sortie du test
      // devient alors un choix explicite.
      el('p', { style: 'text-align:center;margin-top:10px' },
        el('a', { class: 'btn btn-sm btn-ghost', href: `#/theoreme/${t.id}` }, 'Ouvrir la fiche')),
    );
  }

  return el('div', { class: 'renvois' },
    el('div', { class: 'face-label' }, 'Voir aussi'),
    el('div', { class: 'renvois-boutons' }, boutons),
    zone,
  );
}
