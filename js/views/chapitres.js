// views/chapitres.js — gérer les catégories : renommer, réordonner, créer,
// supprimer, sur les deux niveaux (chapitres et sous-chapitres).
//
// **Seul écran où la structure change** (docs/decisions.md, « Sous-chapitres ») :
// l'écran d'un chapitre sert à lire et répartir des cartes, celui-ci à modifier
// le rangement. Un même geste à deux endroits finirait par n'exister que d'un côté.
//
// Les sous-chapitres s'affichent indentés sous leur chapitre, avec les mêmes
// gestes. Les flèches n'échangent qu'**entre frères** : un chapitre avec un
// chapitre, un sous-chapitre avec un sous-chapitre du même chapitre. Le niveau
// d'une catégorie est figé à la création — aucun geste ne le change.
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
  deleteCategory, setCategoriesOrder,
} from '../store.js';

export async function render(ctx) {
  ctx.setTitle('Chapitres');
  // La version s'affiche dans l'en-tête, pas en pied de page : avec douze
  // chapitres, un pied de page est hors écran, et « je ne vois pas la version »
  // redevient impossible à distinguer de « la version n'y est pas ».
  ctx.setHeader(
    el('a', { class: 'btn btn-sm btn-ghost', href: '#/' }, '‹ Retour'),
    el('span', { class: 'small muted', title: 'Version du code exécutée' }, 'v' + VERSION),
  );

  // L'arbre : chaque chapitre porte `children`, ses sous-chapitres ordonnés.
  const [chapitres, compte] = await Promise.all([listChapters(), countByCategory()]);
  const compteDe = (id) => compte.get(id) || { total: 0, unplaced: 0 };

  // Message attaché à une catégorie : { id, texte, type } ou null.
  let annonce = null;
  // Chapitre dont le champ « nouveau sous-chapitre » est ouvert (un seul à la fois).
  let creationSous = null;

  const dire = (id, texte, type) => { annonce = { id, texte, type }; dessiner(); };
  const taire = () => { if (annonce) { annonce = null; dessiner(); } };

  const liste = el('ul', { class: 'list' });
  fill(ctx.root,
    el('p', { class: 'muted small' },
      'Renomme, réordonne, ajoute. « + » découpe un chapitre en sous-chapitres. '
      + 'Une catégorie ne peut être supprimée que si elle est vide.'),
    liste,
  );

  function dessiner() {
    fill(liste, chapitres.flatMap((chap, i) => [
      ...ligne(chap, chapitres, i),
      ...chap.children.flatMap((sous, j) => ligne(sous, chap.children, j, chap)),
      ...(creationSous === chap.id ? [champSousChapitre(chap)] : []),
    ]));
  }

  /**
   * Une catégorie, suivie de son éventuel message.
   *
   * @param cat     la catégorie
   * @param freres  la liste où elle se trouve — celle que les flèches réordonnent
   * @param i       sa place dans `freres`
   * @param parent  le chapitre, quand `cat` est un sous-chapitre
   */
  function ligne(cat, freres, i, parent = null) {
    const { total: n, unplaced } = compteDe(cat.id);
    const nbSous = parent ? 0 : cat.children.length;

    const nom = el('input', {
      value: cat.name,
      on: {
        focus: taire,
        change: async (e) => {
          const v = e.target.value.trim();
          if (!v) { e.target.value = cat.name; return; }   // un titre vide n'a pas de sens
          if (v === cat.name) return;
          await renameCategory(cat.id, v);
          cat.name = v;
          dire(cat.id, 'Renommé.', 'info');
        },
      },
    });

    const li = el('li', { class: parent ? 'sous-chapitre' : null },
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
      // « + » n'existe que sur un chapitre : un sous-chapitre ne se découpe pas.
      !parent && el('button', {
        class: 'btn-sm',
        title: 'Ajouter un sous-chapitre',
        on: { click: () => ouvrirCreation(cat) },
      }, '+'),
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
      ? el('li', { class: 'annonce ' + annonce.type + (parent ? ' sous-chapitre' : '') }, annonce.texte)
      : null;

    return msg ? [li, msg] : [li];
  }

  /**
   * Le champ de création d'un sous-chapitre, sous le dernier sous-chapitre du
   * chapitre — là où le nouveau va apparaître.
   *
   * Ouvert à la demande, et un seul à la fois : douze champs permanents
   * doubleraient la hauteur de l'écran pour un geste rare.
   */
  function champSousChapitre(chap) {
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

    return el('li', { class: 'sous-chapitre' },
      el('div', { class: 'row grow' },
        saisie,
        el('button', { class: 'btn-primary', on: { click: () => ajouterSous(chap, saisie) } }, 'Ajouter'),
        el('button', { class: 'btn-sm', on: { click: () => { creationSous = null; dessiner(); } } }, 'Annuler'),
      ),
    );
  }

  function ouvrirCreation(chap) {
    annonce = null;
    creationSous = creationSous === chap.id ? null : chap.id;
    dessiner();
  }

  async function ajouterSous(chap, saisie) {
    const v = saisie.value.trim();
    if (!v) return;
    saisie.disabled = true;
    try {
      const sous = await createCategory(v, chap.id);
      chap.children.push(sous);
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
    const nbSous = parent ? 0 : cat.children.length;

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
