// marques.js — la marque d'un renvoi dans le texte d'une carte, et sa lecture.
//
// Une **marque** est ce qu'on écrit dans le recto ou le verso pour dire où le
// renvoi doit apparaître : `{{renvoi: Théorème de Dini}}`, sur sa propre ligne.
// Elle ne dit que le **placement**. Le renvoi lui-même vit dans `entryIds`, par
// identifiant, et c'est lui qui fait foi (docs/decisions.md, « Placer un renvoi
// dans le texte : la marque »).
//
// Deux conséquences de cette séparation, et ce sont elles qui rendent le
// mécanisme sûr :
//
//   — une marque qui ne résout plus ne perd rien : le renvoi retombe dans le
//     bloc « Voir aussi », son affichage par défaut ;
//   — supprimer une entrée n'oblige à réécrire aucun texte : `deleteEntry`
//     retire déjà l'identifiant des cartes, et la marque orpheline devient
//     simplement une marque qui ne désigne rien.
//
// C'est aussi pourquoi la marque porte un **titre** et non un identifiant : elle
// se relit dans la zone de saisie, où `{{renvoi: a7Fk2xY9}}` n'aurait rien dit.
// Le titre n'est comparé qu'aux entrées **attachées à cette carte** — une à
// trois, pas la bibliothèque entière — ce qui rend la collision quasi
// impossible, et sans gravité quand elle arrive.
//
// Module **PUR** : pas de DOM, pas de réseau, pas de stockage. Il n'importe que
// `normalise`, d'un autre module pur. Second module testable de l'app, avec
// `recherche.js`.

import { normalise } from './recherche.js';

/**
 * La marque, telle qu'on l'écrit et telle qu'on la lit.
 *
 * Le préfixe `renvoi:` n'est pas décoratif : sans lui, `{{…}}` se confondrait
 * avec des accolades doublées de LaTeX (`\frac{{a}}{b}`), et une carte pourrait
 * perdre un morceau de formule sans qu'on comprenne pourquoi.
 *
 * `[^{}]` interdit les accolades dans le titre : une marque non fermée s'arrête
 * ainsi au premier obstacle au lieu d'avaler la moitié du verso.
 */
const MOTIF = /\{\{\s*renvoi\s*:\s*([^{}]*?)\s*\}\}/gi;

/** La marque à écrire pour une entrée. Le seul endroit où on la fabrique. */
export function marqueDe(entry) {
  return `{{renvoi: ${(entry && entry.title) || ''}}}`;
}

/**
 * Découpe un texte en segments, marques résolues.
 *
 *   decoupe('a\n\n{{renvoi: Dini}}\n\nb', [dini])
 *   → [{ texte: 'a' }, { entry: dini }, { texte: 'b' }]
 *
 * Trois formes de segment, et une seule clé chacune :
 *   { texte }    du texte à composer
 *   { entry }    une marque résolue : l'entrée à déplier ici
 *   { inconnu }  une marque qui ne désigne rien parmi `renvois` — le titre brut
 *
 * `renvois` est la liste des entrées **attachées à la carte**, déjà résolues par
 * l'appelant. On ne cherche pas plus loin : une marque ne crée pas de renvoi,
 * elle place un renvoi qui existe.
 *
 * Les segments de texte sont **rognés**, et ceux qui ne contenaient que des
 * blancs disparaissent : le texte s'affiche en `pre-wrap`, et les deux sauts de
 * ligne qui isolent la marque laisseraient sinon un trou au-dessus et au-dessous
 * de chaque renvoi.
 */
export function decoupe(texte, renvois = []) {
  const source = texte || '';
  const segments = [];
  let curseur = 0;

  // `lastIndex` doit être remis à zéro : le drapeau `g` fait qu'une expression
  // régulière garde sa position entre deux appels, et le second texte découpé
  // reprendrait là où le premier s'est arrêté.
  MOTIF.lastIndex = 0;

  let trouve;
  while ((trouve = MOTIF.exec(source)) !== null) {
    pousseTexte(segments, source.slice(curseur, trouve.index));
    segments.push(resout(trouve[1], renvois));
    curseur = trouve.index + trouve[0].length;
  }
  pousseTexte(segments, source.slice(curseur));

  return segments;
}

function pousseTexte(segments, brut) {
  const texte = brut.trim();
  if (texte) segments.push({ texte });
}

/**
 * Le titre d'une marque → l'entrée qu'il désigne.
 *
 * Comparaison sans accents ni casse (`normalise`) : c'est la même tolérance que
 * la recherche, et on ne veut pas qu'un accent oublié déplace un bloc.
 *
 * **Deux entrées attachées de même titre** — le théorème *et* la définition
 * d'espace de Baire, cités par la même carte — ne sont pas départagées : on
 * refuse de deviner. La marque devient inconnue, le renvoi retombe en bas, et
 * l'aperçu le signale. Deviner afficherait le mauvais énoncé en silence.
 */
function resout(titre, renvois) {
  const cible = normalise(titre);
  const trouves = renvois.filter((e) => normalise(e.title) === cible);
  return trouves.length === 1 ? { entry: trouves[0] } : { inconnu: titre };
}
