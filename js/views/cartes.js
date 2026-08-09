// views/cartes.js — les cartes d'un chapitre : relire, chercher, ouvrir, créer,
// déplacer.
//
// La recherche filtre sans repasser par le routeur : elle doit répondre à chaque
// frappe, et rien n'a changé en base entre deux caractères tapés.
//
// Le déplacement est ici, et pas seulement dans l'éditeur : ranger une carte
// ailleurs ne devrait pas obliger à l'ouvrir, à changer un sélecteur, puis à
// enregistrer — surtout quand on vide un chapitre pour pouvoir le supprimer.

import { el, fill } from '../dom.js';
import { render as renderMath, excerpt } from '../mathtext.js';
import { listCards, getCategory, listCategories, moveCard } from '../store.js';

export async function render(ctx) {
  const categoryId = ctx.params[0];
  const [category, cards, categories] = await Promise.all([
    getCategory(categoryId), listCards(categoryId), listCategories(),
  ]);

  ctx.setTitle(category ? category.name : 'Cartes');
  ctx.setHeader(
    el('a', { class: 'btn btn-sm btn-ghost', href: '#/' }, '‹ Chapitres'),
    el('a', { class: 'btn btn-sm btn-primary', href: `#/carte/nouvelle/${categoryId}` }, '+ Carte'),
  );

  // Les chapitres où l'on peut ranger une carte : tous sauf celui-ci.
  const destinations = categories.filter((c) => c.id !== categoryId);

  let query = '';
  // Carte dont le sélecteur de déplacement est ouvert (une seule à la fois).
  let deplacementDe = null;
  let annonce = null;

  const search = el('input', {
    type: 'search',
    placeholder: 'Chercher…',
    on: { input: (e) => { query = e.target.value.trim().toLowerCase(); paint(); } },
  });

  const list = el('div');
  ctx.root.append(cards.length > 0 && search, list);

  function paint() {
    // On cherche dans les quatre champs : une carte se retrouve aussi bien par
    // sa réponse ou par un mot de la note que par son recto.
    const found = cards.filter((c) => !query
      || [c.title, c.front, c.hint, c.back, c.note].join(' ').toLowerCase().includes(query));

    if (found.length === 0) {
      fill(list, el('p', { class: 'empty' },
        query ? 'Aucune carte ne correspond.' : 'Aucune carte dans ce chapitre.',
        el('br'),
        !query && el('a', {
          class: 'btn btn-primary', href: `#/carte/nouvelle/${categoryId}`, style: 'margin-top:16px',
        }, 'Créer la première'),
      ));
      return;
    }

    fill(list,
      el('p', { class: 'small muted' },
        `${found.length} carte${found.length > 1 ? 's' : ''}`
        + (query ? ` trouvée${found.length > 1 ? 's' : ''}` : '')),
      annonce && el('p', { class: 'small', style: 'color:var(--fg-dim)' }, annonce),
      el('ul', { class: 'list' }, found.flatMap(ligne)),
    );
  }

  function ligne(card) {
    const item = el('li', {},
      // Le titre, quand il existe, tient la ligne principale et le recto passe
      // en dessous. Sans titre, le recto reprend cette place : une liste où
      // certaines lignes seraient vides serait illisible.
      el('a', { class: 'grow', href: `#/carte/${card.id}`, style: 'text-decoration:none;color:inherit' },
        renderMath(el('div', { class: 'name' }), excerpt(card.title || card.front)),
        el('div', { class: 'small muted' },
          card.title ? excerpt(stripMath(card.front), 70) : excerpt(stripMath(card.back), 70)),
      ),
      el('button', {
        class: 'btn-sm',
        title: 'Déplacer vers un autre chapitre',
        disabled: destinations.length === 0,
        on: { click: () => { deplacementDe = deplacementDe === card.id ? null : card.id; annonce = null; paint(); } },
      }, '⇄'),
    );

    if (deplacementDe !== card.id) return [item];

    // Le sélecteur prend la place d'une ligne de liste, sous la carte concernée :
    // le regard est déjà là, et rien ne se déplace hors de l'écran.
    const choix = el('select', {},
      el('option', { value: '' }, 'Déplacer vers…'),
      destinations.map((c) => el('option', { value: c.id }, c.name)),
    );
    choix.addEventListener('change', async () => {
      if (!choix.value) return;
      const cible = destinations.find((c) => c.id === choix.value);
      choix.disabled = true;
      await moveCard(card.id, cible.id);
      // La carte quitte ce chapitre : on la retire de la liste affichée plutôt
      // que de tout recharger — l'écran ne montre que ce chapitre-ci.
      cards.splice(cards.indexOf(card), 1);
      deplacementDe = null;
      annonce = `Carte déplacée vers « ${cible.name} ».`;
      paint();
    });

    return [item, el('li', { class: 'annonce info' },
      el('div', { class: 'row' },
        choix,
        el('button', {
          class: 'btn-sm',
          on: { click: () => { deplacementDe = null; paint(); } },
        }, 'Annuler'),
      ),
    )];
  }

  paint();
}

/**
 * Aperçu du verso en texte brut : dans une liste, une formule rendue déforme la
 * hauteur des lignes. On garde la source LaTeX, dépouillée de ses délimiteurs.
 */
function stripMath(source) {
  return String(source ?? '').replace(/\$\$?/g, '');
}
