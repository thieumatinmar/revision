// theoreme.js — le montage d'un théorème : son titre, son énoncé, son esquisse.
//
// Même rôle que `carte.js`, et pour la même raison : deux écrans montrent le
// même théorème — le détail de la bibliothèque, et l'aperçu de l'éditeur. Écrire
// le montage deux fois le ferait diverger au premier champ ajouté, et diverger
// en silence : l'aperçu montrerait alors autre chose que ce qu'on lira.
//
// Ce n'est ni une vue (aucune route, aucun accès au store) ni un helper DOM :
// c'est un composant. On lui donne un théorème, il rend un élément.
//
// Une différence de fond avec la carte : **rien n'est caché**. Une carte se
// révèle en deux temps parce qu'elle interroge ; un théorème se consulte, donc
// il s'affiche d'un bloc. D'où l'absence de toute option de révélation ici.

import { el } from './dom.js';
import { render as renderMath } from './mathtext.js';

/** Monte un théorème et renvoie l'élément `.card-face`. */
export function faceTheoreme(theorem) {
  return el('div', { class: 'card-face' },
    // Le titre nomme le théorème : sans lui, on ne saurait pas de quoi on parle
    // dans une liste. Il reste néanmoins tolérant au vide, comme sur la carte.
    theorem.title
      ? renderMath(el('div', { class: 'titre-carte' }), theorem.title)
      : el('div', { class: 'face-label' }, 'Sans titre'),

    el('div', { class: 'face-label' }, 'Énoncé'),
    renderMath(el('div'), theorem.statement),

    theorem.sketch && el('hr'),
    theorem.sketch && el('div', { class: 'face-label' }, 'Esquisse'),
    theorem.sketch && renderMath(el('div'), theorem.sketch),
  );
}
