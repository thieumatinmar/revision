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

/**
 * Découpe une source en **blocs**, séparés par une ligne vide.
 *
 * Sert à l'ancrage de l'aperçu sur le curseur : un verso composé d'un seul nœud
 * ne dit pas *où* l'on écrit, un verso composé de blocs le dit au paragraphe
 * près. Chaque bloc porte `at`, sa position dans la source — le seul lien
 * possible entre un curseur dans une zone de saisie et un nœud à l'écran.
 *
 * Deux précautions, et ce sont elles qui font que ce découpage vit ici plutôt
 * que dans `carte.js` :
 *
 *   — le séparateur reste **collé au bloc qui précède**. Le texte s'affiche en
 *     `pre-wrap` : jeter la ligne vide changerait l'espacement de toutes les
 *     cartes, pour un découpage que le lecteur n'est pas censé voir.
 *   — un `$$…$$` à cheval sur une ligne vide n'est **pas** coupé : coupé, il
 *     donnerait deux moitiés que KaTeX signalerait toutes les deux en erreur.
 *     Seul ce fichier sait ce qu'est un délimiteur, d'où la règle — on fusionne
 *     tant que le bloc laisse un délimiteur ouvert.
 */
export function paragraphes(source) {
  const src = String(source ?? '');
  const separateur = /\n[ \t]*\n/g;
  const bruts = [];
  let debut = 0;
  let coupe;

  while ((coupe = separateur.exec(src)) !== null) {
    const fin = coupe.index + coupe[0].length;
    bruts.push({ texte: src.slice(debut, fin), at: debut });
    debut = fin;
  }
  bruts.push({ texte: src.slice(debut), at: debut });

  const blocs = [];
  for (const brut of bruts) {
    const dernier = blocs[blocs.length - 1];
    if (dernier && ouvert(dernier.texte)) dernier.texte += brut.texte;
    else blocs.push({ ...brut });
  }

  return blocs.filter((b) => b.texte.trim());
}

/**
 * Vrai si le texte laisse un délimiteur mathématique non refermé.
 *
 * On compte les **délimiteurs**, pas les dollars : `$$` en est un seul, et
 * compter les caractères ferait passer `$$a` (ouvert) pour équilibré.
 */
function ouvert(texte) {
  let n = 0;
  for (let i = 0; i < texte.length; i += 1) {
    if (texte[i] === '\\' && texte[i + 1] === '$') { i += 1; continue; }
    if (texte[i] !== '$') continue;
    n += 1;
    if (texte[i + 1] === '$') i += 1;
  }
  return n % 2 === 1;
}

/**
 * Version courte, pour les listes.
 *
 * On ne coupe jamais au milieu d'une formule : une source tronquée à
 * `$\frac{1}` ne se rend pas, et afficherait du rouge dans la liste. D'où la
 * règle : si la coupe laisse un nombre impair de `$`, on recule jusqu'au
 * dernier `$` ouvrant.
 */
export function excerpt(source, max = 110) {
  const s = String(source ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const nbDollars = (cut.match(/\$/g) || []).length;
  if (nbDollars % 2 === 1) cut = cut.slice(0, cut.lastIndexOf('$'));
  return cut.trimEnd() + '…';
}

/**
 * Source dépouillée de ses délimiteurs mathématiques.
 *
 * Dans une liste, une formule rendue déforme la hauteur des lignes : on y montre
 * donc la source LaTeX en texte brut, sans les `$`. Vit ici, avec `excerpt`, du
 * jour où deux écrans en ont eu besoin — la liste des cartes et la bibliothèque.
 */
export function stripMath(source) {
  return String(source ?? '').replace(/\$\$?/g, '');
}
