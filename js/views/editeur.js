// views/editeur.js — création et modification d'une carte.
//
// Chaque champ montre son rendu juste en dessous, mis à jour à la frappe. Écrire
// du LaTeX à l'aveugle et découvrir la coquille en plein test est exactement ce
// qu'on cherche à éviter (docs/decisions.md, « Corriger une carte depuis le
// test »).
//
// Deux points d'entrée, d'où deux retours possibles :
//   #/carte/nouvelle/<categoryId>   création  → retour à la liste du chapitre
//   #/carte/<cardId>                          → retour à la liste du chapitre
//   #/carte/<cardId>/test                     → retour au test en cours

import { el } from '../dom.js';
import { render as renderMath } from '../mathtext.js';
import { getCard, saveCard, deleteCard, listCategories } from '../store.js';

/** Insertions rapides : ce qu'on tape le plus souvent, en un tap sur mobile. */
const RACCOURCIS = [
  ['$…$',   '$', '$'],
  ['$$…$$', '$$\n', '\n$$'],
  ['frac',  '\\frac{', '}{}'],
  ['sum',   '\\sum_{k=0}^{n} ', ''],
  ['int',   '\\int_a^b ', '\\,\\dd x'],
  ['lim',   '\\lim_{n\\to\\infty} ', ''],
  ['P',     '\\P(', ')'],
  ['E',     '\\E[', ']'],
  ['Var',   '\\V(', ')'],
  ['≤',     '\\le ', ''],
  ['⇒',     '\\Rightarrow ', ''],
];

export async function render(ctx) {
  // `ctx.mode` vient de la route (voir app.js) : il dit si le premier paramètre
  // désigne un chapitre (création) ou une carte (modification). Sans lui, il
  // faudrait deviner à partir de la forme de l'identifiant — fragile.
  const creation = ctx.mode === 'creation';
  const [param, origine] = ctx.params;
  const categories = await listCategories();

  const card = creation
    ? { categoryId: param, front: '', hint: '', back: '', note: '' }
    : await getCard(param);

  if (!card) {
    ctx.root.append(el('p', { class: 'empty' }, 'Carte introuvable.'));
    return;
  }

  const retour = origine === 'test' && card.categoryId
    ? `#/test/${card.categoryId}`
    : `#/cartes/${card.categoryId}`;

  ctx.setTitle(creation ? 'Nouvelle carte' : 'Modifier');
  ctx.setHeader(el('a', { class: 'btn btn-sm btn-ghost', href: retour }, '‹ Annuler'), null);

  // --- Champs -----------------------------------------------------------------
  const categorie = el('select', {},
    categories.map((c) => el('option', { value: c.id, selected: c.id === card.categoryId }, c.name)),
  );

  const recto = champ('Recto — ce qui est demandé', card.front,
    'Ex. : Inégalité de Bienaymé–Tchebychev : énoncé et hypothèses ?');
  const indication = champ('Indication (facultatif) — le coup de pouce, pas la réponse', card.hint,
    'Ex. : partir de l’inégalité de Markov, appliquée à une variable bien choisie.');
  const verso = champ('Verso — la réponse', card.back,
    'Ex. : $$\\P(|X-\\E[X]|\\ge\\varepsilon)\\le \\V(X)/\\varepsilon^2$$');
  const note = champ('Note (facultatif) — affichée avec le verso : le piège, l’idée de preuve', card.note,
    'Ex. : hypothèse qui mord — variance finie, donc $X\\in L^2$.');

  const erreur = el('p', { class: 'small', style: 'color:#e8695f;min-height:1.2em' });

  ctx.root.append(
    el('label', { class: 'small muted' }, 'Chapitre'),
    categorie,
    recto.bloc, indication.bloc, verso.bloc, note.bloc,
    erreur,
    el('div', { class: 'actions' },
      el('button', { class: 'btn-primary', on: { click: enregistrer } }, 'Enregistrer'),
      el('a', { class: 'btn', href: retour }, 'Annuler'),
    ),
    !creation && el('div', { style: 'margin-top:28px;text-align:center' },
      el('button', {
        class: 'btn-sm',
        style: 'color:#e8695f',
        on: { click: supprimer },
      }, 'Supprimer cette carte'),
    ),
  );

  async function enregistrer() {
    if (!recto.input.value.trim() || !verso.input.value.trim()) {
      erreur.textContent = 'Le recto et le verso sont obligatoires.';
      return;
    }
    await saveCard({
      ...card,
      categoryId: categorie.value,
      front: recto.input.value,
      hint: indication.input.value,
      back: verso.input.value,
      note: note.input.value,
    });
    // La catégorie a pu changer : on repart de celle qui vient d'être choisie.
    location.hash = origine === 'test' ? `#/test/${categorie.value}` : `#/cartes/${categorie.value}`;
  }

  async function supprimer() {
    if (!confirm('Supprimer définitivement cette carte ?')) return;
    await deleteCard(card.id);
    location.hash = `#/cartes/${card.categoryId}`;
  }
}

/**
 * Un champ = libellé, zone de saisie, barre d'insertion, aperçu rendu.
 * Renvoie le bloc à insérer et la zone de saisie, pour lire sa valeur ensuite.
 */
function champ(libelle, valeur, placeholder) {
  const apercu = el('div', { class: 'apercu mathtext' });
  const input = el('textarea', { placeholder, value: valeur || '' });
  const rafraichir = () => renderMath(apercu, input.value);
  input.addEventListener('input', rafraichir);

  const barre = el('div', { class: 'raccourcis' },
    RACCOURCIS.map(([texte, avant, apres]) => el('button', {
      type: 'button',
      class: 'btn-sm',
      on: { click: () => entourer(input, avant, apres) },
    }, texte)),
  );

  const bloc = el('div', { class: 'champ' },
    el('label', { class: 'small muted' }, libelle),
    input,
    barre,
    apercu,
  );

  rafraichir();
  return { bloc, input };
}

/** Entoure la sélection (ou insère au curseur), puis rend le focus au champ. */
function entourer(input, avant, apres) {
  const { selectionStart: d, selectionEnd: f, value } = input;
  input.value = value.slice(0, d) + avant + value.slice(d, f) + apres + value.slice(f);
  const curseur = d + avant.length + (f - d);
  input.focus();
  input.setSelectionRange(curseur, curseur);
  input.dispatchEvent(new Event('input'));   // déclenche le rafraîchissement de l'aperçu
}
