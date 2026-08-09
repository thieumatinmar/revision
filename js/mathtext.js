// mathtext.js — texte libre + LaTeX → HTML.
//
// Convention de saisie, la même partout dans l'app :
//   $ ... $    formule dans le fil du texte
//   $$ ... $$  formule centrée sur sa propre ligne
//   \$         dollar littéral
//
// Tout ce qui n'est pas une formule est du texte : il est **échappé**, jamais
// interprété comme du HTML. C'est la seule garantie qu'une carte ne puisse pas
// casser la page.
//
// Le rendu s'appuie sur KaTeX, chargé en <script> classique avant les modules,
// donc disponible sous `window.katex`. Voir docs/decisions.md pour le choix
// KaTeX plutôt que MathJax.

/** Échappe les caractères qui auraient un sens en HTML. */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Raccourcis maison, pour ne pas réécrire \mathbb{} trente fois par jour.
 * Ils n'existent que dans cette app : une carte n'est pas un fichier .tex.
 */
const MACROS = {
  '\\P': '\\mathbb{P}',
  '\\E': '\\mathbb{E}',
  '\\V': '\\operatorname{Var}',
  '\\R': '\\mathbb{R}',
  '\\C': '\\mathbb{C}',
  '\\N': '\\mathbb{N}',
  '\\Z': '\\mathbb{Z}',
  '\\Q': '\\mathbb{Q}',
  '\\dd': '\\mathrm{d}',
  '\\ind': '\\mathbf{1}',
};

/** Rend un fragment LaTeX, ou affiche l'erreur en clair plutôt que de planter. */
function renderTex(tex, displayMode) {
  const delim = displayMode ? '$$' : '$';
  if (!window.katex) return escapeHtml(delim + tex + delim);
  try {
    return window.katex.renderToString(tex, {
      displayMode,
      throwOnError: true,
      strict: false,
      macros: MACROS,
    });
  } catch (err) {
    // Une formule fausse ne doit pas faire disparaître la carte : on montre la
    // source en rouge, avec le message KaTeX en infobulle.
    return `<span class="math-error" title="${escapeHtml(err.message)}">${escapeHtml(tex)}</span>`;
  }
}

/**
 * Découpe la chaîne en alternant texte et formules, puis assemble le HTML.
 *
 * On balaie caractère par caractère plutôt qu'avec une expression régulière
 * globale : c'est le seul moyen simple de gérer à la fois `\$`, `$$` et `$`
 * sans se tromper de frontière.
 */
export function toHtml(source) {
  const src = String(source ?? '');
  let out = '';     // HTML déjà produit
  let text = '';    // texte en attente d'échappement
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (ch === '\\' && src[i + 1] === '$') {   // \$ → dollar littéral
      text += '$';
      i += 2;
      continue;
    }

    if (ch === '$') {
      const display = src[i + 1] === '$';
      const delim = display ? '$$' : '$';
      const end = src.indexOf(delim, i + delim.length);
      if (end !== -1) {
        out += escapeHtml(text);
        text = '';
        out += renderTex(src.slice(i + delim.length, end), display);
        i = end + delim.length;
        continue;
      }
      // Délimiteur jamais refermé : ce n'est pas une formule, c'est du texte.
    }

    text += ch;
    i += 1;
  }

  return out + escapeHtml(text);
}

/** Rend `source` dans l'élément `node`. */
export function render(node, source) {
  node.classList.add('mathtext');
  node.innerHTML = toHtml(source);
  return node;
}
