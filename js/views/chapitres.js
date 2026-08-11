// views/chapitres.js — gérer les chapitres : renommer, réordonner, créer, supprimer.
//
// Le renommage se valide à la perte de focus plutôt qu'avec un bouton
// « Enregistrer » : corriger une coquille dans un titre ne mérite pas deux clics.
//
// La suppression d'un chapitre non vide est refusée par `store.js` — la vue ne
// fait que présenter le refus proprement. Elle ne réimplémente pas la règle : la
// dupliquer ici, c'est prendre le risque que les deux divergent.
//
// Les messages s'affichent **sous la ligne concernée**, pas en pied d'écran :
// avec douze chapitres, un message en bas de page tombe hors de l'écran au
// moment du clic — l'utilisateur voit alors « rien ne se passe ».

import { el, fill } from '../dom.js';
import { VERSION } from '../version.js';
import {
  listCategories, countByCategory, createCategory, renameCategory,
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

  const [categories, compte] = await Promise.all([listCategories(), countByCategory()]);

  // Message attaché à un chapitre : { id, texte, type } ou null.
  let annonce = null;
  const dire = (id, texte, type) => { annonce = { id, texte, type }; dessiner(); };
  const taire = () => { if (annonce) { annonce = null; dessiner(); } };

  const liste = el('ul', { class: 'list' });
  ctx.root.append(
    el('p', { class: 'muted small' },
      'Renomme, réordonne, ajoute. Un chapitre ne peut être supprimé que s’il est vide.'),
    liste,
  );

  function dessiner() {
    fill(liste, categories.flatMap((cat, i) => {
      const n = compte.get(cat.id) || 0;

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

      const ligne = el('li', {},
        el('div', { class: 'grow' },
          nom,
          el('div', { class: 'small muted', style: 'margin-top:4px' },
            n === 0 ? 'vide' : `${n} carte${n > 1 ? 's' : ''}`),
        ),
        el('button', {
          class: 'btn-sm', title: 'Monter', disabled: i === 0,
          on: { click: () => deplacer(i, -1) },
        }, '↑'),
        el('button', {
          class: 'btn-sm', title: 'Descendre', disabled: i === categories.length - 1,
          on: { click: () => deplacer(i, +1) },
        }, '↓'),
        el('button', {
          class: 'btn-sm',
          style: 'color:#e8695f',
          title: n > 0 ? `Contient ${n} carte(s) — suppression impossible` : 'Supprimer',
          on: { click: () => supprimer(cat) },
        }, '×'),
      );

      // Le message prend la place d'une ligne de liste, juste sous la sienne.
      const msg = annonce && annonce.id === cat.id
        ? el('li', { class: 'annonce ' + annonce.type }, annonce.texte)
        : null;

      return msg ? [ligne, msg] : [ligne];
    }));
  }

  async function deplacer(i, delta) {
    taire();
    const j = i + delta;
    [categories[i], categories[j]] = [categories[j], categories[i]];
    dessiner();                                             // l'écran répond tout de suite…
    await setCategoriesOrder(categories.map((c) => c.id));   // …et on écrit ensuite
  }

  async function supprimer(cat) {
    const n = compte.get(cat.id) || 0;
    if (n > 0) {
      dire(cat.id,
        `Impossible : « ${cat.name} » contient ${n} carte${n > 1 ? 's' : ''}. `
        + 'Supprime-les ou déplace-les dans un autre chapitre d’abord.',
        'erreur');
      return;
    }
    if (!confirm(`Supprimer le chapitre « ${cat.name} » ?`)) return;
    try {
      await deleteCategory(cat.id);
    } catch (err) {
      // Le refus fait autorité côté store : si le compteur affiché était
      // périmé (carte ajoutée depuis un autre appareil), c'est ici qu'on
      // l'apprend, et c'est cette réponse-là qui prime.
      dire(cat.id, err.message, 'erreur');
      return;
    }
    categories.splice(categories.indexOf(cat), 1);
    annonce = null;
    dessiner();
  }

  // --- Ajout ------------------------------------------------------------------
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
    categories.push(cat);
    saisie.value = '';
    dire(cat.id, 'Chapitre ajouté.', 'info');
  }

  ctx.root.append(el('div', { class: 'row', style: 'margin-top:20px' },
    saisie,
    el('button', { class: 'btn-primary', on: { click: ajouter } }, 'Ajouter'),
  ));

  dessiner();
}
