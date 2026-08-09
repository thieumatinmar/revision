// quiz.js — le tirage.
//
// Module PUR : pas de DOM, pas de réseau, pas de stockage. Il ne connaît que des
// tableaux. C'est ce qui le rendra testable le jour où on ajoutera des tests.
//
// Le tirage est **indépendant à chaque carte** : on ne mémorise rien, ni ce qui
// est déjà sorti, ni ce qui a été su. C'est un choix explicite de Mathieu
// (docs/decisions.md, « Déroulé d'un test ») : le prix assumé est qu'un doublon
// apparaît vite, et qu'aucune passe complète n'est garantie.
//
// D'où la maigreur de ce fichier. Elle est le résultat de la décision, pas un
// oubli — si un jour on veut un paquet mélangé rebattu, c'est ici et nulle part
// ailleurs que ça se change.

/**
 * Tire une carte au hasard, uniformément.
 * Renvoie `null` si la liste est vide — au cas où la catégorie n'a rien.
 */
export function draw(cards) {
  if (!cards || cards.length === 0) return null;
  return cards[Math.floor(Math.random() * cards.length)];
}
