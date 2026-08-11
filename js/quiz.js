// quiz.js — le tirage.
//
// Module PUR : pas de DOM, pas de réseau, pas de stockage. Il ne connaît que des
// tableaux. C'est ce qui le rendra testable le jour où on ajoutera des tests.
//
// Deux modes, et ils ne se terminent pas de la même façon :
//
//   RANDOM  — tirage **indépendant** à chaque carte : on ne mémorise rien, ni ce
//             qui est déjà sorti, ni ce qui a été su (docs/decisions.md,
//             « Déroulé d'un test »). Le prix assumé : un doublon apparaît vite,
//             et aucune passe complète n'est garantie. Ce mode ne finit jamais.
//   ORDERED — la liste dans l'ordre du chapitre, chaque carte une fois, et la
//             passe **se termine** au bout. Pas de rebouclage : c'est le seul
//             endroit de l'app où « j'ai fait le tour » veut dire quelque chose.
//
// L'appelant ne garde qu'un entier (`index`) : tout l'état du parcours tient
// là-dedans, ce qui laisse ce module sans mémoire.

export const MODES = { RANDOM: 'random', ORDERED: 'ordered' };

/**
 * Tire une carte au hasard, uniformément.
 * Renvoie `null` si la liste est vide — au cas où la catégorie n'a rien.
 */
export function draw(cards) {
  if (!cards || cards.length === 0) return null;
  return cards[Math.floor(Math.random() * cards.length)];
}

/**
 * Carte à afficher, selon le mode et la position demandée.
 *
 * Renvoie `{ card, index }` :
 *   - `card` vaut `null` quand la passe ordonnée est finie (ou la liste vide) ;
 *   - `index` est la position à repasser au tour suivant, incrémentée par
 *     l'appelant. En mode aléatoire elle ne sert à rien et reste à 0.
 */
export function nextCard(cards, mode, index = 0) {
  if (!cards || cards.length === 0) return { card: null, index: 0 };
  if (mode === MODES.ORDERED) {
    return { card: index < cards.length ? cards[index] : null, index };
  }
  return { card: draw(cards), index: 0 };
}
