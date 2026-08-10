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

import { el, fill } from '../dom.js';
import { render as renderMath } from '../mathtext.js';
import { getCard, saveCard, deleteCard, listCategories } from '../store.js';
import { depuisFichier, poidsTotal, formatePoids, BUDGET } from '../images.js';

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
    ? { categoryId: param, title: '', front: '', hint: '', back: '', note: '', images: [] }
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

  const titre = champTitre(card.title);

  const recto = champ('Recto — ce qui est demandé', card.front,
    'Ex. : Inégalité de Bienaymé–Tchebychev : énoncé et hypothèses ?');
  const indication = champ('Indication (facultatif) — le coup de pouce, pas la réponse', card.hint,
    'Ex. : partir de l’inégalité de Markov, appliquée à une variable bien choisie.');
  const verso = champ('Verso — la réponse', card.back,
    'Ex. : $$\\P(|X-\\E[X]|\\ge\\varepsilon)\\le \\V(X)/\\varepsilon^2$$');
  const note = champ('Note (facultatif) — affichée avec le verso : le piège, l’idée de preuve', card.note,
    'Ex. : hypothèse qui mord — variance finie, donc $X\\in L^2$.');

  const erreur = el('p', { class: 'small', style: 'color:#e8695f;min-height:1.2em' });

  const images = champImages(Array.isArray(card.images) ? [...card.images] : []);

  ctx.root.append(
    el('label', { class: 'small muted' }, 'Chapitre'),
    categorie,
    titre.bloc,
    recto.bloc, indication.bloc, verso.bloc, images.bloc, note.bloc,
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
      title: titre.input.value.trim(),
      front: recto.input.value,
      hint: indication.input.value,
      back: verso.input.value,
      note: note.input.value,
      images: images.valeur(),
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
 * Le titre : une seule ligne, pas de barre d'insertion.
 *
 * Facultatif. Il sert à retrouver la carte dans la liste et la recherche, et il
 * est affiché pendant le test, au-dessus du recto, comme intitulé de ce dont on
 * parle.
 *
 * Le LaTeX y est accepté : « Fonction génératrice $G_X$ » est un titre légitime.
 * D'où l'aperçu, réduit à une ligne.
 */
function champTitre(valeur) {
  const apercu = el('div', { class: 'apercu mathtext', style: 'min-height:0;padding:8px 12px' });
  const input = el('input', { value: valeur || '', placeholder: 'Ex. : Inégalité de Bienaymé–Tchebychev' });
  const rafraichir = () => renderMath(apercu, input.value);
  input.addEventListener('input', rafraichir);

  const bloc = el('div', { class: 'champ' },
    el('label', { class: 'small muted' }, 'Titre (facultatif) — de quoi parle la carte'),
    input,
    // L'aperçu ne s'affiche que s'il y a une formule à montrer : sinon c'est une
    // boîte vide qui répète bêtement ce qu'on vient de taper.
    apercu,
  );

  const majVisibilite = () => { apercu.style.display = input.value.includes('$') ? '' : 'none'; };
  input.addEventListener('input', majVisibilite);
  rafraichir();
  majVisibilite();

  return { bloc, input };
}

/**
 * Les images de la réponse : import, vignettes, suppression, jauge de budget.
 *
 * La jauge n'est pas décorative. Les images vivent **dans** le document
 * Firestore, plafonné à 1 Mo : sans repère visible, on découvrirait la limite au
 * moment d'enregistrer, c'est-à-dire au pire moment. Ici, on la voit venir.
 */
function champImages(images) {
  const galerie = el('div', { class: 'galerie' });
  const jauge = el('div', { class: 'small muted' });
  const etat = el('p', { class: 'small', style: 'min-height:1.2em;margin:6px 0 0' });

  const fichier = el('input', {
    type: 'file',
    accept: 'image/*',
    multiple: true,
    style: 'display:none',
  });

  const bouton = el('button', { type: 'button', class: 'btn-sm', on: { click: () => fichier.click() } },
    'Ajouter une image');

  fichier.addEventListener('change', async () => {
    const choisis = [...fichier.files];
    fichier.value = '';                      // pour pouvoir reprendre le même fichier
    if (choisis.length === 0) return;

    bouton.disabled = true;
    etat.style.color = 'var(--fg-dim)';
    etat.textContent = 'Traitement…';
    const refus = [];

    for (const f of choisis) {
      try {
        const url = await depuisFichier(f);
        // On vérifie le budget **après** réduction : refuser sur la taille du
        // fichier d'origine rejetterait des photos de 4 Mo qui tiennent en 150 Ko.
        if (poidsTotal(images) + url.length > BUDGET) {
          refus.push(f.name);
          continue;
        }
        images.push(url);
      } catch (err) {
        refus.push(f.name + ' (' + err.message + ')');
      }
    }

    bouton.disabled = false;
    if (refus.length) {
      etat.style.color = '#e8695f';
      etat.textContent = 'Non ajouté, budget dépassé : ' + refus.join(', ')
        + '. Supprime une image existante pour faire de la place.';
    } else {
      etat.textContent = '';
    }
    dessiner();
  });

  function dessiner() {
    fill(galerie, images.map((url, i) => el('div', { class: 'vignette' },
      el('img', { src: url, alt: `Image ${i + 1} de la réponse` }),
      el('button', {
        type: 'button',
        class: 'btn-sm',
        title: 'Retirer cette image',
        on: { click: () => { images.splice(i, 1); etat.textContent = ''; dessiner(); } },
      }, '×'),
    )));

    const total = poidsTotal(images);
    jauge.textContent = images.length === 0
      ? 'Aucune image.'
      : `${images.length} image${images.length > 1 ? 's' : ''} — `
        + `${formatePoids(total)} sur ${formatePoids(BUDGET)} utilisés.`;
  }

  const bloc = el('div', { class: 'champ' },
    el('label', { class: 'small muted' },
      'Images de la réponse (facultatif) — schéma, figure, démonstration écrite'),
    galerie,
    el('div', { class: 'row', style: 'margin-top:8px' }, bouton, fichier, jauge),
    etat,
  );

  dessiner();
  return { bloc, valeur: () => [...images] };
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
