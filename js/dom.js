// dom.js — micro-outils de construction du DOM.
//
// Pas de framework : l'app est trop petite pour en justifier un, et un
// bundler imposerait Node/npm — qui ne sont pas installés (cf. CLAUDE.md).
// Ces deux fonctions suffisent à écrire des vues lisibles.

/**
 * Crée un élément.
 *   el('div', { class: 'card' }, 'texte', autreElement)
 *
 * Clés spéciales : `class`, `on` ({ click: fn }), `dataset`. Tout le reste
 * devient un attribut. Les enfants `null`/`false` sont ignorés, ce qui permet
 * d'écrire `condition && el(...)` directement dans la liste.
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Vide un conteneur et y place de nouveaux enfants. */
export function fill(node, ...children) {
  node.replaceChildren();
  append(node, children);
  return node;
}
