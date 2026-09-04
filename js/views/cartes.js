// views/cartes.js — les cartes d'un chapitre : relire, chercher, ouvrir, créer,
// ordonner, déplacer.
//
// La recherche filtre sans repasser par le routeur : elle doit répondre à chaque
// frappe, et rien n'a changé en base entre deux caractères tapés.
//
// Le déplacement est ici, et pas seulement dans l'éditeur : ranger une carte
// ailleurs ne devrait pas obliger à l'ouvrir, à changer un sélecteur, puis à
// enregistrer — surtout quand on vide un chapitre pour pouvoir le supprimer.
//
// L'écran est coupé en **deux zones** : les cartes rangées, dans leur ordre, et
// en dessous celles qui n'ont pas encore de place. La frontière ne se franchit
// que dans un sens (« Ranger »), et la renumérotation ne touche que la zone du
// haut : sans cette séparation, la première pression sur une flèche rangerait
// implicitement tout le chapitre et le repère « non rangée » disparaîtrait sans
// qu'on l'ait décidé.

import { el, fill } from '../dom.js';
import { render as renderMath, excerpt, stripMath } from '../mathtext.js';
import {
  listCards, getCategory, listCategories, moveCard, setCardsOrder, isPlaced,
} from '../store.js';

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

  // Les deux zones. `listCards` livre déjà les rangées en tête, dans l'ordre.
  const rangees = cards.filter(isPlaced);
  const nonRangees = cards.filter((c) => !isPlaced(c));

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
  // `fill` et non `append` : le `append` natif écrirait « false » à l'écran
  // quand le chapitre est vide (voir dom.js).
  fill(ctx.root, cards.length > 0 && search, list);

  // On cherche dans les cinq champs : une carte se retrouve aussi bien par sa
  // réponse ou par un mot de la note que par son recto.
  const correspond = (c) => !query
    || [c.title, c.front, c.hint, c.back, c.note].join(' ').toLowerCase().includes(query);

  function paint() {
    const rangeesVues = rangees.filter(correspond);
    const nonRangeesVues = nonRangees.filter(correspond);
    const total = rangeesVues.length + nonRangeesVues.length;

    if (total === 0) {
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
        `${total} carte${total > 1 ? 's' : ''}`
        + (query ? ` trouvée${total > 1 ? 's' : ''}` : '')),
      annonce && el('p', { class: 'small', style: 'color:var(--fg-dim)' }, annonce),
      el('ul', { class: 'list' },
        rangeesVues.flatMap((c) => ligne(c, rangees.indexOf(c))),

        // Séparateur : il n'apparaît que s'il reste des cartes sans place.
        nonRangeesVues.length > 0 && el('li', { class: 'separateur' },
          el('span', { class: 'grow small muted' },
            `Non rangées — ${nonRangeesVues.length}`),
          // Tout ranger d'un coup : sur un chapitre entier jamais ordonné,
          // c'est ce qui évite quarante pressions avant de pouvoir affiner.
          !query && nonRangees.length > 1 && el('button', {
            class: 'btn-sm',
            title: 'Ranger toutes ces cartes à la suite, dans l’ordre affiché',
            on: { click: rangerTout },
          }, 'Tout ranger'),
        ),

        nonRangeesVues.flatMap((c) => ligne(c, null)),
      ),
    );
  }

  /**
   * Une ligne. `position` est le rang dans la zone rangée, ou `null` quand la
   * carte n'a pas encore de place.
   */
  function ligne(card, position) {
    const placee = position !== null;

    const item = el('li', { class: placee ? null : 'non-rangee' },
      // Le titre, quand il existe, tient la ligne principale et le recto passe
      // en dessous. Sans titre, le recto reprend cette place : une liste où
      // certaines lignes seraient vides serait illisible.
      el('a', { class: 'grow', href: `#/carte/${card.id}`, style: 'text-decoration:none;color:inherit' },
        renderMath(el('div', { class: 'name' }), excerpt(card.title || card.front)),
        el('div', { class: 'small muted' },
          card.title ? excerpt(stripMath(card.front), 70) : excerpt(stripMath(card.back), 70)),
      ),

      // Les flèches n'ont de sens que sur la liste complète : dans une liste
      // filtrée, « monter d'un cran » désignerait un voisin qu'on ne voit pas.
      placee && el('button', {
        class: 'btn-sm',
        title: query ? 'Efface la recherche pour réordonner' : 'Monter',
        disabled: !!query || position === 0,
        on: { click: () => deplacerDansOrdre(position, -1) },
      }, '↑'),
      placee && el('button', {
        class: 'btn-sm',
        title: query ? 'Efface la recherche pour réordonner' : 'Descendre',
        disabled: !!query || position === rangees.length - 1,
        on: { click: () => deplacerDansOrdre(position, +1) },
      }, '↓'),

      // « Ranger » reste possible même en cours de recherche : ajouter à la fin
      // ne dépend pas des voisins affichés.
      !placee && el('button', {
        class: 'btn-sm',
        title: 'Donner une place à cette carte, à la fin des cartes rangées',
        on: { click: () => ranger(card) },
      }, 'Ranger'),

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
      retirer(card);
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

  /** Retire une carte des deux zones (elle a changé de chapitre). */
  function retirer(card) {
    const zone = isPlaced(card) ? rangees : nonRangees;
    const i = zone.indexOf(card);
    if (i >= 0) zone.splice(i, 1);
  }

  /**
   * Échange deux cartes rangées. L'écran répond tout de suite, l'écriture suit —
   * même compromis que sur les chapitres : une flèche qui attend le réseau donne
   * l'impression que rien ne s'est passé, et on la presse deux fois.
   */
  async function deplacerDansOrdre(i, delta) {
    const j = i + delta;
    [rangees[i], rangees[j]] = [rangees[j], rangees[i]];
    renumeroter();
    paint();
    await setCardsOrder(rangees.map((c) => c.id));
  }

  /** Donne une place à une carte : à la fin de la zone rangée. */
  async function ranger(card) {
    nonRangees.splice(nonRangees.indexOf(card), 1);
    rangees.push(card);
    renumeroter();
    paint();
    await setCardsOrder(rangees.map((c) => c.id));
  }

  /** Range toutes les cartes sans place, à la suite, dans l'ordre affiché. */
  async function rangerTout() {
    rangees.push(...nonRangees.splice(0));
    renumeroter();
    paint();
    await setCardsOrder(rangees.map((c) => c.id));
  }

  /**
   * Recopie en mémoire la numérotation que le store va écrire, pour que
   * `isPlaced` et l'affichage restent cohérents sans relire la base.
   */
  function renumeroter() {
    rangees.forEach((c, i) => { c.order = i; });
  }

  paint();
}
