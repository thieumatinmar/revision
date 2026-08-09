// views/chapitres.js — gérer les chapitres : renommer, réordonner, créer, supprimer.
//
// Le renommage se valide à la perte de focus plutôt qu'avec un bouton
// « Enregistrer » : corriger une coquille dans un titre ne mérite pas deux clics.
//
// La suppression d'un chapitre non vide est refusée par `store.js` — la vue ne
// fait que présenter le refus proprement. Elle ne réimplémente pas la règle : la
// dupliquer ici, c'est prendre le risque que les deux divergent.

import { el, fill } from '../dom.js';
import {
  listCategories, countByCategory, createCategory, renameCategory,
  deleteCategory, setCategoriesOrder,
} from '../store.js';

export async function render(ctx) {
  ctx.setTitle('Chapitres');
  ctx.setHeader(el('a', { class: 'btn btn-sm btn-ghost', href: '#/' }, '‹ Retour'), null);

  const [categories, compte] = await Promise.all([listCategories(), countByCategory()]);

  const message = el('p', { class: 'small', style: 'min-height:1.3em' });
  const liste = el('ul', { class: 'list' });
  ctx.root.append(
    el('p', { class: 'muted small' },
      'Renomme, réordonne, ajoute. Un chapitre ne peut être supprimé que s’il est vide.'),
    liste,
    message,
  );

  function erreur(texte) {
    message.style.color = '#e8695f';
    message.textContent = texte;
  }
  function info(texte) {
    message.style.color = 'var(--fg-dim)';
    message.textContent = texte;
  }

  function dessiner() {
    fill(liste, categories.map((cat, i) => {
      const n = compte.get(cat.id) || 0;

      const nom = el('input', {
        value: cat.name,
        on: {
          change: async (e) => {
            const v = e.target.value.trim();
            if (!v) { e.target.value = cat.name; return; }   // un titre vide n'a pas de sens
            if (v === cat.name) return;
            await renameCategory(cat.id, v);
            cat.name = v;
            info('Renommé.');
          },
        },
      });

      return el('li', {},
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
          title: 'Supprimer',
          on: { click: () => supprimer(cat) },
        }, '×'),
      );
    }));
  }

  async function deplacer(i, delta) {
    const j = i + delta;
    [categories[i], categories[j]] = [categories[j], categories[i]];
    dessiner();                                    // l'écran répond tout de suite…
    await setCategoriesOrder(categories.map((c) => c.id));   // …et on écrit ensuite
    info('Ordre enregistré.');
  }

  async function supprimer(cat) {
    const n = compte.get(cat.id) || 0;
    if (n > 0) {
      erreur(`« ${cat.name} » contient ${n} carte${n > 1 ? 's' : ''}. Vide-le ou déplace-les d’abord.`);
      return;
    }
    if (!confirm(`Supprimer le chapitre « ${cat.name} » ?`)) return;
    try {
      await deleteCategory(cat.id);
    } catch (err) {
      erreur(err.message);      // le refus fait autorité côté store, pas ici
      return;
    }
    categories.splice(categories.indexOf(cat), 1);
    dessiner();
    info('Chapitre supprimé.');
  }

  // --- Ajout ------------------------------------------------------------------
  const saisie = el('input', {
    placeholder: 'Nouveau chapitre…',
    on: { keydown: (e) => { if (e.key === 'Enter') ajouter(); } },
  });

  async function ajouter() {
    const v = saisie.value.trim();
    if (!v) return;
    const cat = await createCategory(v);
    categories.push(cat);
    saisie.value = '';
    dessiner();
    info(`« ${cat.name} » ajouté.`);
  }

  ctx.root.append(el('div', { class: 'row', style: 'margin-top:20px' },
    saisie,
    el('button', { class: 'btn-primary', on: { click: ajouter } }, 'Ajouter'),
  ));

  dessiner();
}
