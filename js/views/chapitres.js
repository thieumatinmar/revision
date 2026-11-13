// views/chapitres.js — gérer les catégories : renommer, réordonner, créer,
// supprimer, sur les trois niveaux (docs/decisions.md, « Trois niveaux de
// catégories »).
//
// **Seul écran où l'arbre entier se voit et se modifie** (docs/decisions.md,
// « Sous-chapitres ») : chapitres de premier niveau et rattachement ne vivent
// qu'ici. Deux gestes existent aussi dans l'écran de la catégorie, en doublon
// assumé :
//   - le **renommage** (« Renommer depuis l'écran de la catégorie ») — un nom
//     n'est pas du rangement ;
//   - **créer, ordonner, supprimer les sous-chapitres** d'un chapitre (« Gérer
//     les sous-chapitres depuis l'écran du chapitre ») — on découpe un chapitre
//     en le travaillant.
// La crainte d'un geste qui finirait par n'exister que d'un côté est tenue en
// mettant les règles dans le store (`renameCategory`, `createCategory`,
// `deleteCategory`, `setCategoriesOrder`) : les deux écrans ne font que
// présenter leurs refus.
//
// Les sous-chapitres s'affichent indentés sous leur parent, un cran par niveau,
// avec les mêmes gestes ; « + » n'existe que là où l'on peut encore découper.
// Les flèches n'échangent qu'**entre frères** : un chapitre avec un chapitre,
// un sous-chapitre avec un sous-chapitre du même parent. Changer de niveau ou
// de parent, c'est **rattacher** (⤴) : un sélecteur sous la ligne, qui couvre
// promotion, rétrogradation et changement de parent (docs/decisions.md,
// « Rattacher une catégorie ») — le sous-arbre suit.
//
// Le renommage se valide à la perte de focus plutôt qu'avec un bouton
// « Enregistrer » : corriger une coquille dans un titre ne mérite pas deux clics.
//
// Les suppressions refusées le sont par `store.js` — la vue ne fait que
// présenter le refus proprement, et l'annoncer tôt quand ses compteurs le
// permettent. Elle ne réimplémente pas la règle : c'est la réponse du store qui
// fait autorité.
//
// Les messages s'affichent **sous la ligne concernée**, pas en pied d'écran :
// avec douze chapitres, un message en bas de page tombe hors de l'écran au
// moment du clic — l'utilisateur voit alors « rien ne se passe ».

import { el, fill } from '../dom.js';
import { VERSION } from '../version.js';
import {
  listChapters, countByCategory, createCategory, renameCategory,
  deleteCategory, setCategoriesOrder, attachCategory,
} from '../store.js';
import {
  flattenTree, findNode, heightOf, canHaveChildren, attachRefusal, indentedLabel, MAX_DEPTH,
} from '../arbre.js';

export async function render(ctx) {
  ctx.setTitle('Chapitres');
  // La version s'affiche dans l'en-tête, pas en pied de page : avec douze
  // chapitres, un pied de page est hors écran, et « je ne vois pas la version »
  // redevient impossible à distinguer de « la version n'y est pas ».
  ctx.setHeader(
    el('a', { class: 'btn btn-sm btn-ghost', href: '#/' }, '‹ Retour'),
    el('span', { class: 'small muted', title: 'Version du code exécutée' }, 'v' + VERSION),
  );

  // L'arbre : chaque catégorie porte `children`, ses sous-chapitres ordonnés.
  // `let` : un rattachement réorganise l'arbre, qu'on relit alors en entier.
  let [chapitres, compte] = await Promise.all([listChapters(), countByCategory()]);
  const compteDe = (id) => compte.get(id) || { total: 0, unplaced: 0 };

  // Message attaché à une catégorie : { id, texte, type } ou null.
  let annonce = null;
  // Catégorie dont le champ « nouveau sous-chapitre » est ouvert (un seul à la fois).
  let creationSous = null;
  // Catégorie dont le sélecteur « Rattacher à… » est ouvert (un seul à la fois,
  // et jamais en même temps qu'un champ de création).
  let rattachementDe = null;

  const dire = (id, texte, type) => { annonce = { id, texte, type }; dessiner(); };
  const taire = () => { if (annonce) { annonce = null; dessiner(); } };

  const liste = el('ul', { class: 'list' });
  fill(ctx.root,
    el('p', { class: 'muted small' },
      'Renomme, réordonne, ajoute. « + » découpe une catégorie en sous-chapitres, '
      + `sur ${MAX_DEPTH} niveaux au plus. `
      + 'Une catégorie ne peut être supprimée que si elle est vide.'),
    liste,
  );

  function dessiner() {
    fill(liste, rendre(chapitres, null, 0));
  }

  /**
   * Des frères et, sous chacun, ses descendants — récursivement, dans l'ordre
   * de lecture. Le champ de création d'une catégorie vient **après tout son
   * sous-arbre** : là où son nouveau sous-chapitre va apparaître.
   */
  function rendre(freres, parent, depth) {
    return freres.flatMap((cat, i) => [
      ...ligne(cat, freres, i, parent, depth),
      ...rendre(cat.children || [], cat, depth + 1),
      ...(creationSous === cat.id ? [champSousChapitre(cat, depth + 1)] : []),
    ]);
  }

  /** La classe d'indentation d'une ligne de niveau `depth` (0 pour un chapitre). */
  const indentation = (depth) => (depth === 0 ? '' : ` sous-chapitre niveau-${depth + 1}`);

  /**
   * Une catégorie, suivie de son éventuel message.
   *
   * @param cat     la catégorie (nœud de l'arbre, avec `children`)
   * @param freres  la liste où elle se trouve — celle que les flèches réordonnent
   * @param i       sa place dans `freres`
   * @param parent  son parent direct, nul pour un chapitre
   * @param depth   son niveau, 0 pour un chapitre
   */
  function ligne(cat, freres, i, parent, depth) {
    const { total: n, unplaced } = compteDe(cat.id);
    const nbSous = (cat.children || []).length;

    const nom = el('input', {
      value: cat.name,
      on: {
        focus: taire,
        change: async (e) => {
          if (e.target.value.trim() === cat.name) return;
          // Le refus d'un titre vide est celui du store : la vue remet l'ancien
          // nom et dit pourquoi.
          try {
            cat.name = await renameCategory(cat.id, e.target.value);
            dire(cat.id, 'Renommé.', 'info');
          } catch (err) {
            e.target.value = cat.name;
            dire(cat.id, err.message, 'erreur');
          }
        },
      },
    });

    const li = el('li', { class: indentation(depth).trim() || null },
      el('div', { class: 'grow' },
        nom,
        // Les compteurs sont ceux des cartes **directement** rangées ici : c'est
        // ce qui bloque une suppression. Le total cumulé appartient à l'accueil.
        // Le compte des non rangées est ici, et pas seulement dans la
        // catégorie : c'est le seul endroit d'où l'on voit d'un coup d'œil où il
        // reste de l'ordre à mettre.
        el('div', { class: 'small muted', style: 'margin-top:4px' },
          n === 0 ? 'aucune carte' : `${n} carte${n > 1 ? 's' : ''}`,
          nbSous > 0 && ` · ${nbSous} sous-chapitre${nbSous > 1 ? 's' : ''}`,
          unplaced > 0 && el('span', { style: 'color:var(--accent)' },
            ` · ${unplaced} non rangée${unplaced > 1 ? 's' : ''}`)),
      ),
      // « + » n'existe que là où l'on peut encore découper : pas au dernier niveau.
      canHaveChildren({ depth }) && el('button', {
        class: 'btn-sm',
        title: 'Ajouter un sous-chapitre',
        on: { click: () => ouvrirCreation(cat) },
      }, '+'),
      el('button', {
        class: 'btn-sm',
        title: 'Rattacher à… (changer de niveau ou de parent)',
        on: { click: () => ouvrirRattachement(cat) },
      }, '⤴'),
      el('button', {
        class: 'btn-sm', title: 'Monter', disabled: i === 0,
        on: { click: () => deplacer(freres, i, -1) },
      }, '↑'),
      el('button', {
        class: 'btn-sm', title: 'Descendre', disabled: i === freres.length - 1,
        on: { click: () => deplacer(freres, i, +1) },
      }, '↓'),
      el('button', {
        class: 'btn-sm',
        style: 'color:#e8695f',
        title: nbSous > 0 ? `A ${nbSous} sous-chapitre(s) — suppression impossible`
          : n > 0 ? `Contient ${n} carte(s) — suppression impossible` : 'Supprimer',
        on: { click: () => supprimer(cat, freres, parent) },
      }, '×'),
    );

    // Le message prend la place d'une ligne de liste, juste sous la sienne.
    const msg = annonce && annonce.id === cat.id
      ? el('li', { class: 'annonce ' + annonce.type + indentation(depth) }, annonce.texte)
      : null;

    return [li, msg, rattachementDe === cat.id && champRattachement(cat, parent, depth)].filter(Boolean);
  }

  /**
   * Le champ de création d'un sous-chapitre, sous le dernier descendant de la
   * catégorie — là où le nouveau va apparaître.
   *
   * Ouvert à la demande, et un seul à la fois : douze champs permanents
   * doubleraient la hauteur de l'écran pour un geste rare.
   *
   * @param depth  le niveau du sous-chapitre à créer
   */
  function champSousChapitre(chap, depth) {
    const saisie = el('input', {
      placeholder: `Nouveau sous-chapitre de « ${chap.name} »…`,
      on: {
        keydown: (e) => {
          if (e.key === 'Enter') ajouterSous(chap, saisie);
          if (e.key === 'Escape') { creationSous = null; dessiner(); }
        },
      },
    });
    // Le focus après montage : `dessiner` vient de remplacer le DOM, et un champ
    // qu'on vient d'ouvrir sans pouvoir y taper serait un clic de trop.
    queueMicrotask(() => saisie.focus());

    return el('li', { class: indentation(depth).trim() },
      el('div', { class: 'row grow' },
        saisie,
        el('button', { class: 'btn-primary', on: { click: () => ajouterSous(chap, saisie) } }, 'Ajouter'),
        el('button', { class: 'btn-sm', on: { click: () => { creationSous = null; dessiner(); } } }, 'Annuler'),
      ),
    );
  }

  /**
   * Le sélecteur « Rattacher à… », sous la ligne de la catégorie — même motif
   * que le ⇄ d'une carte.
   *
   * « — Chapitre » ramène au premier niveau ; une catégorie place dessous,
   * indentée comme dans l'arbre. Le rattachement actuel est présélectionné.
   *
   * **Seules les cibles valides** sont proposées : c'est `attachRefusal`
   * (arbre.js) qui en décide, la règle même que le store appliquera — la
   * catégorie et ce qui est dessous (cycle), et les places où ses
   * sous-chapitres passeraient sous le dernier niveau. Ce qu'on retire est
   * toujours un sous-arbre entier ou des niveaux du bas : ce qui reste se lit
   * encore comme un arbre, sans enfant qui aurait l'air d'appartenir au voisin.
   *
   * Quand la catégorie emmène des sous-chapitres, une ligne dit pourquoi la
   * liste est courte — une liste réduite sans raison ferait croire à un bug.
   */
  function champRattachement(cat, parent, depth) {
    const actuel = parent ? parent.id : '';
    const plat = flattenTree(chapitres);
    const hauteur = heightOf(plat, cat.id);
    const cibles = plat.filter((c) => c.id === actuel || !attachRefusal(plat, cat.id, c.id));

    const choix = el('select', {},
      el('option', { value: '', selected: !parent }, '— Chapitre (aucun parent)'),
      cibles.map((c) => el('option', {
        value: c.id, selected: c.id === actuel,
      }, indentedLabel({ ...c, name: `Sous « ${c.name} »` }))),
    );

    choix.addEventListener('change', async () => {
      const cible = choix.value || null;
      if ((cible || '') === actuel) return;
      choix.disabled = true;
      try {
        await attachCategory(cat.id, cible);
        // L'arbre entier change de forme (deux listes renumérotées) : on le
        // relit plutôt que de rejouer la renumérotation en mémoire. Les
        // compteurs, eux, ne bougent pas — aucune carte n'a changé de catégorie.
        chapitres = await listChapters();
        rattachementDe = null;
        const nom = cible ? findNode(chapitres, cible).name : null;
        dire(cat.id, nom ? `Rattaché à « ${nom} ».` : 'Devenu chapitre.', 'info');
      } catch (err) {
        rattachementDe = null;
        dire(cat.id, err.message, 'erreur');
      }
    });

    // Seul « — Chapitre » reste quand aucune catégorie n'est une cible valide.
    const seulChapitre = cibles.length === 0;
    return el('li', { class: 'annonce info' + indentation(depth) },
      el('div', { class: 'row' },
        choix,
        el('button', { class: 'btn-sm', on: { click: () => { rattachementDe = null; dessiner(); } } }, 'Annuler'),
      ),
      hauteur > 0 && el('div', { class: 'small muted', style: 'margin-top:6px' },
        seulChapitre
          ? `« ${cat.name} » emmène ${hauteur} niveaux de sous-chapitres : il ne peut que rester chapitre.`
          : `« ${cat.name} » emmène ses sous-chapitres : seules les places où ils tiennent dans les `
            + `${MAX_DEPTH} niveaux sont proposées.`),
    );
  }

  function ouvrirRattachement(cat) {
    annonce = null;
    creationSous = null;
    rattachementDe = rattachementDe === cat.id ? null : cat.id;
    dessiner();
  }

  function ouvrirCreation(chap) {
    annonce = null;
    rattachementDe = null;
    creationSous = creationSous === chap.id ? null : chap.id;
    dessiner();
  }

  async function ajouterSous(chap, saisie) {
    const v = saisie.value.trim();
    if (!v) return;
    saisie.disabled = true;
    try {
      const sous = await createCategory(v, chap.id);
      chap.children.push({ ...sous, children: [] });
      creationSous = null;
      dire(sous.id, 'Sous-chapitre ajouté.', 'info');
    } catch (err) {
      creationSous = null;
      dire(chap.id, err.message, 'erreur');
    }
  }

  /**
   * Échange deux frères. L'écran répond tout de suite, l'écriture suit.
   * `setCategoriesOrder` renumérote de 0 les seuls identifiants qu'on lui passe :
   * les frères, donc — jamais l'autre niveau.
   */
  async function deplacer(freres, i, delta) {
    taire();
    const j = i + delta;
    [freres[i], freres[j]] = [freres[j], freres[i]];
    dessiner();
    await setCategoriesOrder(freres.map((c) => c.id));
  }

  async function supprimer(cat, freres, parent) {
    const { total: n } = compteDe(cat.id);
    const nbSous = (cat.children || []).length;

    // Refus annoncés tôt, d'après les compteurs affichés. Le store refera le
    // contrôle : c'est lui qui a le dernier mot.
    if (nbSous > 0) {
      dire(cat.id,
        `Impossible : « ${cat.name} » a ${nbSous} sous-chapitre${nbSous > 1 ? 's' : ''}. `
        + 'Supprime-les d’abord.',
        'erreur');
      return;
    }
    if (n > 0) {
      dire(cat.id,
        `Impossible : « ${cat.name} » contient ${n} carte${n > 1 ? 's' : ''}. `
        + 'Supprime-les ou déplace-les dans une autre catégorie d’abord.',
        'erreur');
      return;
    }

    const mot = parent ? 'le sous-chapitre' : 'le chapitre';
    if (!confirm(`Supprimer ${mot} « ${cat.name} » ?`)) return;
    try {
      await deleteCategory(cat.id);
    } catch (err) {
      // Si le compteur affiché était périmé (carte ou sous-chapitre ajouté
      // depuis un autre appareil), c'est ici qu'on l'apprend.
      dire(cat.id, err.message, 'erreur');
      return;
    }
    freres.splice(freres.indexOf(cat), 1);
    annonce = null;
    dessiner();
  }

  // --- Ajout d'un chapitre ----------------------------------------------------
  const saisie = el('input', {
    placeholder: 'Nouveau chapitre…',
    on: {
      focus: taire,
      keydown: (e) => { if (e.key === 'Enter') ajouter(); },
    },
  });

  async function ajouter() {
    const v = saisie.value.trim();
    if (!v) return;
    const cat = await createCategory(v);
    chapitres.push({ ...cat, children: [] });
    saisie.value = '';
    dire(cat.id, 'Chapitre ajouté.', 'info');
  }

  ctx.root.append(el('div', { class: 'row', style: 'margin-top:20px' },
    saisie,
    el('button', { class: 'btn-primary', on: { click: ajouter } }, 'Ajouter'),
  ));

  dessiner();
}
