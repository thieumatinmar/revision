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

import { el, fill } from './dom.js';
import { render as renderMath } from './mathtext.js';
import { faceEntree } from './entree.js';
import { decoupe } from './marques.js';

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
 *
 * `entries` est la bibliothèque **déjà chargée**, passée par la vue : ce
 * composant est pur, il ne lit pas le store. Ce n'est pas un détour — les titres
 * des renvois doivent s'afficher avant tout clic, donc rien ne pouvait être
 * chargé au moment du clic.
 */
export function faceCarte(card, { hint = false, back = false, entries = [] } = {}) {
  const images = Array.isArray(card.images) ? card.images : [];

  // Renvois résolus en entrées. Un identifiant inconnu est ignoré : supprimer
  // une entrée retire déjà ses renvois (store.js), mais un appareil hors ligne
  // peut réécrire une carte avec un renvoi périmé — ce filet évite d'afficher un
  // bouton qui n'ouvre rien.
  const renvois = (Array.isArray(card.entryIds) ? card.entryIds : [])
    .map((id) => entries.find((e) => e.id === id))
    .filter(Boolean);

  // Un seul dépliage pour toute la carte, blocs du texte et « Voir aussi »
  // confondus : deux énoncés ouverts en même temps, et l'on ne sait plus ce
  // qu'on lisait.
  const depliage = creeDepliage();

  // Les marques ne sont lues que dans le recto et le verso — jamais dans le
  // titre, qui nomme la carte et n'est pas un endroit où poser un bloc.
  const segRecto = decoupe(card.front, renvois);
  const segVerso = decoupe(card.back, renvois);

  // Un renvoi marqué s'affiche là où sa marque est posée ; les autres restent
  // dans le bloc du bas, qui garde le comportement d'avant. C'est ce qui fait
  // que la marque est un **sur-placement** : sans elle, rien ne change.
  const places = new Set(
    [...segRecto, ...segVerso].map((s) => s.entry && s.entry.id).filter(Boolean),
  );
  const restants = renvois.filter((e) => !places.has(e.id));

  return el('div', { class: 'card-face' },
    // Le titre est facultatif : sans lui, la carte commence directement au
    // recto, sans en-tête vide.
    card.title
      ? renderMath(el('div', { class: 'titre-carte' }), card.title)
      : el('div', { class: 'face-label' }, 'Recto'),
    corps(segRecto, depliage),

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
    back && card.back && corps(segVerso, depliage),

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

    // Ce qui n'a pas été placé à la main atterrit ici, sous « Voir aussi ».
    back && restants.length > 0 && blocRenvois(restants, depliage),
  );
}

/**
 * Le corps d'une face : le texte composé, et les renvois posés dedans.
 *
 * Chaque segment de texte est composé **séparément** par `mathtext.js`, qui
 * continue de ne recevoir que du texte pur — c'est son invariant, et c'est la
 * seule chose qui empêche une carte de casser la page. Une marque n'est donc
 * jamais du HTML : elle est un endroit où l'on cesse de composer du texte pour
 * insérer un élément, puis où l'on reprend.
 */
function corps(segments, depliage) {
  return segments.map((s) => {
    if (s.texte !== undefined) return renderMath(el('div'), s.texte);
    if (s.entry) return el('div', { class: 'renvoi-place' }, ...depliage.attache(s.entry));
    // Une marque qui ne désigne plus rien : le renvoi, lui, n'est pas perdu — il
    // est retombé dans « Voir aussi ». On le dit quand même, au lieu de laisser
    // un bloc se déplacer en silence après un renommage.
    return el('div', { class: 'marque-morte' }, `Renvoi introuvable : ${s.inconnu}`);
  });
}

/**
 * « Voir aussi » : les renvois qu'aucune marque n'a placés.
 *
 * Les boutons d'abord, les zones de dépliage ensuite : une zone posée entre deux
 * boutons casserait la rangée. Une seule est remplie à la fois, les autres sont
 * vides et ne prennent pas de place.
 */
function blocRenvois(renvois, depliage) {
  const paires = renvois.map((e) => depliage.attache(e));

  return el('div', { class: 'renvois' },
    el('div', { class: 'face-label' }, 'Voir aussi'),
    el('div', { class: 'renvois-boutons' }, paires.map(([bouton]) => bouton)),
    paires.map(([, zone]) => zone),
  );
}

/**
 * Le dépliage, partagé par toute la carte.
 *
 * Déplier et non naviguer : l'écran appelant garde son état en mémoire — dans
 * l'éditeur, les saisies non enregistrées — et un lien le perdrait, pour une
 * consultation de dix secondes.
 *
 * `attache(entry)` rend le couple `[bouton, zone]` ; l'appelant les place où il
 * veut. L'état vit ici, une seule fois : ouvrir un renvoi ferme celui d'avant,
 * qu'il soit posé dans le texte ou dans le bloc du bas.
 */
function creeDepliage() {
  const abonnes = [];
  let ouvert = null;

  function bascule(id) {
    ouvert = ouvert === id ? null : id;
    for (const a of abonnes) {
      const actif = a.entry.id === ouvert;
      a.bouton.classList.toggle('btn-primary', actif);
      if (!actif) { fill(a.zone); continue; }
      fill(a.zone,
        faceEntree(a.entry),
        // Pour qui veut vraiment y aller : la fiche complète, et quitter l'écran
        // devient alors un choix explicite.
        el('p', { style: 'text-align:center;margin-top:10px' },
          el('a', { class: 'btn btn-sm btn-ghost', href: `#/entree/${a.entry.id}` }, 'Ouvrir la fiche')),
      );
    }
  }

  function attache(entry) {
    const bouton = el('button', {
      class: 'btn-sm',
      on: { click: () => bascule(entry.id) },
    }, entry.title || 'Sans titre');
    const zone = el('div');
    abonnes.push({ entry, bouton, zone });
    return [bouton, zone];
  }

  return { attache };
}
