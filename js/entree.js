// entree.js — le montage d'une entrée de bibliothèque, et les mots de chaque
// espèce.
//
// Même rôle que `carte.js`, et pour la même raison : trois écrans montrent la
// même entrée — le détail, l'aperçu de l'éditeur, et le dépliage d'un renvoi
// sous une carte. Écrire le montage trois fois le ferait diverger au premier
// champ ajouté, et diverger en silence : l'aperçu montrerait alors autre chose
// que ce qu'on lira.
//
// Ce n'est ni une vue (aucune route, aucun accès aux données) ni un helper
// DOM : c'est un composant. On lui donne une entrée, il rend un élément.
//
// Une différence de fond avec la carte : **rien n'est caché**. Une carte se
// révèle en deux temps parce qu'elle interroge ; une entrée se consulte, donc
// elle s'affiche d'un bloc. D'où l'absence de toute option de révélation ici.
//
// Le seul import venu de `store.js` est celui des deux constantes d'espèce et
// de `kindOf` : ce sont des valeurs, pas des données. Les définir ici et les
// faire importer par le store inverserait la dépendance — un module de données
// n'a rien à demander à un composant.

import { el } from './dom.js';
import { render as renderMath } from './mathtext.js';
import { THEOREM, DEFINITION, kindOf } from './store.js';

/**
 * Les mots de chaque espèce.
 *
 * C'est **la seule** différence entre un théorème et une définition : même
 * document, mêmes champs, mêmes écrans — d'autres libellés. Tout regrouper ici
 * fait que l'ajout d'une espèce se lit en un coup d'œil, au lieu de se chercher
 * dans cinq `if` répartis dans les vues.
 *
 *   nom       ce qu'on dit au singulier (titres d'écran, boutons, messages)
 *   pluriel   pour les compteurs (« 3 définitions »)
 *   pastille  la marque courte, en tête de ligne dans la liste
 *   labels    l'intitulé de chacun des trois champs
 */
export const ESPECES = {
  [THEOREM]: {
    nom: 'Théorème',
    pluriel: 'théorèmes',
    pastille: 'Th.',
    labels: { title: 'Titre', statement: 'Énoncé', support: 'Esquisse' },
  },
  [DEFINITION]: {
    nom: 'Définition',
    pluriel: 'définitions',
    pastille: 'Déf.',
    labels: { title: 'Nom', statement: 'Définition', support: 'Remarques' },
  },
};

/** Les mots de l'espèce d'une entrée donnée. */
export const espece = (entry) => ESPECES[kindOf(entry)];

/**
 * Le segment d'URL de chaque espèce, et sa lecture inverse.
 *
 * L'espèce n'apparaît dans une URL qu'à **un seul endroit** : la création
 * (`#/entree/nouveau/definition`), seul moment où le document n'existe pas
 * encore et où l'URL est donc la seule à pouvoir la dire. Partout ailleurs elle
 * se lit dans le document. Sans cette limite, `kind` finirait par voyager dans
 * toutes les routes — ce qu'on a justement refusé en n'ouvrant qu'une
 * collection.
 *
 * Le segment est en français comme le reste de l'interface, la valeur stockée
 * en anglais comme le reste du code : cette fonction est la couture entre les
 * deux, et le seul endroit où elle existe.
 */
export const SEGMENTS = { [THEOREM]: 'theoreme', [DEFINITION]: 'definition' };
export const kindDuSegment = (segment) => (segment === 'definition' ? DEFINITION : THEOREM);

/** Monte une entrée et renvoie l'élément `.card-face`. */
export function faceEntree(entry) {
  const mots = espece(entry);

  return el('div', { class: 'card-face' },
    // Le titre nomme l'entrée : sans lui, on ne saurait pas de quoi on parle
    // dans une liste. Il reste néanmoins tolérant au vide, comme sur la carte.
    entry.title
      ? renderMath(el('div', { class: 'titre-carte' }), entry.title)
      : el('div', { class: 'face-label' }, `${mots.nom} sans titre`),

    // C'est ce libellé qui dit l'espèce — « Énoncé » ou « Définition ». Une
    // pastille de plus au-dessus du titre ferait redite.
    //
    // Le corps est **facultatif** : une entrée peut naître d'un renvoi posé
    // depuis une carte, avec son seul titre, et se remplir plus tard. Le libellé
    // du champ disparaît alors — il annoncerait du vide — mais l'espèce doit
    // rester lisible, sans quoi on ne saurait plus si l'on regarde un théorème
    // ou une définition. D'où le repli sur son nom.
    el('div', { class: 'face-label' }, entry.statement ? mots.labels.statement : mots.nom),
    entry.statement && renderMath(el('div'), entry.statement),

    entry.support && el('hr'),
    entry.support && el('div', { class: 'face-label' }, mots.labels.support),
    entry.support && renderMath(el('div'), entry.support),
  );
}
