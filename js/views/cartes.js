// views/cartes.js — les cartes d'une catégorie (chapitre ou sous-chapitre) :
// relire, chercher, ouvrir, créer, dupliquer, ordonner, déplacer.
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
//
// **Sur un chapitre découpé** (docs/decisions.md, « Sous-chapitres ») :
//
//   - sans recherche, ses sous-chapitres s'affichent en tête, comme des liens,
//     puis ses cartes propres ;
//   - en recherche, les cartes des sous-chapitres qui correspondent s'ajoutent
//     aux siennes, chacune avec le nom de son sous-chapitre. Sans ça, découper un
//     chapitre ferait mentir « Aucune carte ne correspond ».
//
// Une carte venue d'un sous-chapitre s'ouvre, se duplique et se déplace, mais ne
// s'ordonne pas d'ici : sa place se compte dans son sous-chapitre, pas dans cette
// liste.

import { el, fill } from '../dom.js';
import { render as renderMath, excerpt, stripMath } from '../mathtext.js';
import {
  listChapters, flattenChapters, listCards, listCardsUnder, moveCard, setCardsOrder,
  isPlaced, duplicateCard,
} from '../store.js';

/** Libellé d'une destination dans un `<select>` : les sous-chapitres indentés. */
const libelle = (cat) => (cat.depth === 1 ? '   └ ' : '') + cat.name;

export async function render(ctx) {
  const categoryId = ctx.params[0];

  const arbre = await listChapters();
  const categories = flattenChapters(arbre);
  const category = categories.find((c) => c.id === categoryId) || null;
  // Le nœud de l'arbre, s'il s'agit d'un chapitre : c'est lui qui porte ses
  // sous-chapitres. Sur un sous-chapitre, `chapitre` est null.
  const chapitre = arbre.find((c) => c.id === categoryId) || null;
  const sousChapitres = chapitre ? chapitre.children : [];
  const parent = category && category.depth === 1
    ? arbre.find((c) => c.id === category.parentId) : null;

  // Une seule lecture de cartes : sur un chapitre, lui et ses sous-chapitres
  // (la recherche en a besoin, et les compteurs des sous-chapitres en sortent) ;
  // sur un sous-chapitre, ses seules cartes.
  const toutes = sousChapitres.length > 0 ? await listCardsUnder(categoryId) : await listCards(categoryId);
  const cards = toutes.filter((c) => c.categoryId === categoryId);
  // Les cartes des sous-chapitres, dans l'ordre des sous-chapitres.
  const autres = toutes.filter((c) => c.categoryId !== categoryId);
  const nomSous = new Map(sousChapitres.map((s) => [s.id, s.name]));

  ctx.setTitle(category ? category.name : 'Cartes');
  ctx.setHeader(
    // Depuis un sous-chapitre, on remonte à son chapitre, pas à l'accueil :
    // c'est de là qu'on vient, et c'est là qu'on choisit le sous-chapitre voisin.
    parent
      ? el('a', { class: 'btn btn-sm btn-ghost', href: `#/cartes/${parent.id}` }, `‹ ${parent.name}`)
      : el('a', { class: 'btn btn-sm btn-ghost', href: '#/' }, '‹ Chapitres'),
    el('a', { class: 'btn btn-sm btn-primary', href: `#/carte/nouvelle/${categoryId}` }, '+ Carte'),
  );

  // Les catégories où l'on peut ranger une carte : toutes sauf la sienne.
  const destinationsDe = (card) => categories.filter((c) => c.id !== card.categoryId);

  // Les deux zones. `listCards` livre déjà les rangées en tête, dans l'ordre.
  const rangees = cards.filter(isPlaced);
  const nonRangees = cards.filter((c) => !isPlaced(c));

  let query = '';
  // Carte dont le sélecteur de déplacement est ouvert (une seule à la fois).
  let deplacementDe = null;
  let annonce = null;

  const search = el('input', {
    type: 'search',
    placeholder: sousChapitres.length > 0 ? 'Chercher, sous-chapitres compris…' : 'Chercher…',
    on: { input: (e) => { query = e.target.value.trim().toLowerCase(); paint(); } },
  });

  const list = el('div');
  // `fill` et non `append` : le `append` natif écrirait « false » à l'écran
  // quand le chapitre est vide (voir dom.js).
  fill(ctx.root, toutes.length > 0 && search, list);

  // On cherche dans les cinq champs : une carte se retrouve aussi bien par sa
  // réponse ou par un mot de la note que par son recto.
  const correspond = (c) => !query
    || [c.title, c.front, c.hint, c.back, c.note].join(' ').toLowerCase().includes(query);

  function paint() {
    const rangeesVues = rangees.filter(correspond);
    const nonRangeesVues = nonRangees.filter(correspond);
    // Les cartes des sous-chapitres ne s'affichent qu'en recherche : sans elle,
    // on y accède par leur sous-chapitre.
    const autresVues = query ? autres.filter(correspond) : [];
    const total = rangeesVues.length + nonRangeesVues.length + autresVues.length;

    fill(list,
      !query && blocSousChapitres(),
      annonce && el('p', { class: 'small', style: 'color:var(--fg-dim)' }, annonce),
      total === 0 ? vide() : [
        el('p', { class: 'small muted' },
          `${total} carte${total > 1 ? 's' : ''}`
          + (query ? ` trouvée${total > 1 ? 's' : ''}` : '')),
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

          autresVues.length > 0 && el('li', { class: 'separateur' },
            el('span', { class: 'grow small muted' },
              `Dans les sous-chapitres — ${autresVues.length}`)),

          autresVues.flatMap((c) => ligne(c, null)),
        ),
      ],
    );
  }

  /**
   * Les sous-chapitres, en tête de l'écran d'un chapitre. Compteur de chacun :
   * ses cartes, lues dans la même requête que celles du chapitre.
   */
  function blocSousChapitres() {
    if (sousChapitres.length === 0) return null;
    return el('ul', { class: 'list', style: 'margin-bottom:18px' },
      sousChapitres.map((s) => {
        const n = autres.filter((c) => c.categoryId === s.id).length;
        return el('li', {},
          el('a', { class: 'grow', href: `#/cartes/${s.id}`, style: 'text-decoration:none;color:inherit' },
            el('div', { class: 'name' }, s.name),
            el('div', { class: 'small muted' }, n === 0 ? 'aucune carte' : `${n} carte${n > 1 ? 's' : ''}`),
          ),
          el('a', { class: 'btn btn-sm', href: `#/carte/nouvelle/${s.id}`, title: 'Nouvelle carte dans ce sous-chapitre' }, '+'),
        );
      }),
    );
  }

  /** Ce qu'on affiche quand aucune carte n'est visible. */
  function vide() {
    if (query) return el('p', { class: 'empty' }, 'Aucune carte ne correspond.');
    // Un chapitre découpé dont toutes les cartes sont dans ses sous-chapitres
    // n'est pas « vide » : on ne lui propose pas de créer « la première ».
    if (sousChapitres.length > 0) {
      return el('p', { class: 'small muted' }, 'Aucune carte directement dans ce chapitre.');
    }
    return el('p', { class: 'empty' },
      'Aucune carte dans ce chapitre.',
      el('br'),
      el('a', {
        class: 'btn btn-primary', href: `#/carte/nouvelle/${categoryId}`, style: 'margin-top:16px',
      }, 'Créer la première'),
    );
  }

  /**
   * Une ligne. `position` est le rang dans la zone rangée, ou `null` quand la
   * carte n'a pas encore de place — ou quand elle vient d'un sous-chapitre, où
   * sa place ne se compte pas dans cette liste.
   */
  function ligne(card, position) {
    const placee = position !== null;
    const sous = nomSous.get(card.categoryId) || null;

    const item = el('li', { class: placee || sous ? null : 'non-rangee' },
      // Le titre, quand il existe, tient la ligne principale et le recto passe
      // en dessous. Sans titre, le recto reprend cette place : une liste où
      // certaines lignes seraient vides serait illisible.
      el('a', { class: 'grow', href: `#/carte/${card.id}`, style: 'text-decoration:none;color:inherit' },
        renderMath(el('div', { class: 'name' }), excerpt(card.title || card.front)),
        el('div', { class: 'small muted' },
          card.title ? excerpt(stripMath(card.front), 70) : excerpt(stripMath(card.back), 70)),
        sous && el('div', { class: 'small', style: 'color:var(--accent)' }, `↳ ${sous}`),
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
      // ne dépend pas des voisins affichés. Pas sur une carte de sous-chapitre :
      // la ranger ici la placerait dans une liste qui n'est pas la sienne.
      !placee && !sous && el('button', {
        class: 'btn-sm',
        title: 'Donner une place à cette carte, à la fin des cartes rangées',
        on: { click: () => ranger(card) },
      }, 'Ranger'),

      el('button', {
        class: 'btn-sm',
        title: 'Dupliquer cette carte',
        on: { click: (ev) => dupliquer(card, ev.currentTarget) },
      }, '⧉'),

      el('button', {
        class: 'btn-sm',
        title: 'Déplacer vers une autre catégorie',
        disabled: destinationsDe(card).length === 0,
        on: { click: () => { deplacementDe = deplacementDe === card.id ? null : card.id; annonce = null; paint(); } },
      }, '⇄'),
    );

    if (deplacementDe !== card.id) return [item];

    // Le sélecteur prend la place d'une ligne de liste, sous la carte concernée :
    // le regard est déjà là, et rien ne se déplace hors de l'écran.
    const destinations = destinationsDe(card);
    const choix = el('select', {},
      el('option', { value: '' }, 'Déplacer vers…'),
      destinations.map((c) => el('option', { value: c.id }, libelle(c))),
    );
    choix.addEventListener('change', async () => {
      if (!choix.value) return;
      const cible = destinations.find((c) => c.id === choix.value);
      choix.disabled = true;
      await moveCard(card.id, cible.id);
      replacer(card, cible.id);
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

  /**
   * Duplique une carte. La place et la marque du titre sont décidées par le
   * store (`duplicateCard`) ; ici, on ne fait que recopier en mémoire ce qu'il
   * vient d'écrire, pour ne pas relire tout le chapitre.
   *
   * Le bouton est désactivé pendant l'écriture : un double clic ferait deux
   * copies. Il n'est pas réactivé au succès — `paint()` redessine la ligne.
   *
   * Pas de réponse optimiste, contrairement aux flèches : l'identifiant de la
   * copie ne se connaît qu'après l'appel, et une ligne sans identifiant
   * n'ouvrirait rien.
   */
  async function dupliquer(card, bouton) {
    bouton.disabled = true;
    try {
      const copie = await duplicateCard(card.id);
      if (copie.categoryId !== categoryId) {
        // Copie d'une carte de sous-chapitre : elle reste dans ce sous-chapitre,
        // on la glisse juste après l'original dans la liste des résultats.
        autres.splice(autres.indexOf(card) + 1, 0, copie);
      } else if (isPlaced(copie)) {
        rangees.splice(rangees.indexOf(card) + 1, 0, copie);
        renumeroter();
      } else {
        // Même tri que `listCards` pour les non rangées : par identifiant.
        nonRangees.push(copie);
        nonRangees.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      }
      annonce = 'Carte dupliquée.';
    } catch (err) {
      annonce = 'Duplication impossible : ' + err.message;
    }
    deplacementDe = null;
    paint();
  }

  /**
   * Recopie en mémoire un déplacement que le store vient d'écrire : la carte
   * quitte sa liste, perd sa place, et reparaît là où elle reste visible depuis
   * cet écran — non rangée si elle arrive dans cette catégorie, parmi les
   * cartes des sous-chapitres si elle arrive dans l'un d'eux. Ailleurs, elle
   * disparaît simplement de l'écran, qui ne montre que ce chapitre-ci.
   */
  function replacer(card, cibleId) {
    for (const zone of [rangees, nonRangees, autres]) {
      const i = zone.indexOf(card);
      if (i >= 0) zone.splice(i, 1);
    }
    if (rangees.length > 0) renumeroter();
    card.categoryId = cibleId;
    delete card.order;
    if (cibleId === categoryId) nonRangees.push(card);
    else if (nomSous.has(cibleId)) autres.push(card);
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
