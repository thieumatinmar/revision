// views/theoreme_detail.js — un théorème, en entier.
//
// Rien n'y est caché ni révélé : c'est ce qui sépare la bibliothèque du test.
// Le montage lui-même vient de `theoreme.js`, partagé avec l'aperçu de
// l'éditeur — deux montages divergeraient en silence.

import { el } from '../dom.js';
import { faceTheoreme } from '../theoreme.js';
import { getTheorem } from '../store.js';

export async function render(ctx) {
  const id = ctx.params[0];
  const theorem = await getTheorem(id);

  if (!theorem) {
    ctx.setTitle('Théorème');
    ctx.root.append(el('p', { class: 'empty' }, 'Théorème introuvable.'));
    return;
  }

  ctx.setTitle('Théorème');
  ctx.setHeader(
    el('a', { class: 'btn btn-sm btn-ghost', href: '#/bibliotheque' }, '‹ Bibliothèque'),
    el('a', { class: 'btn btn-sm', href: `#/theoreme/${id}/editer` }, 'Modifier'),
  );

  ctx.root.append(faceTheoreme(theorem));
}
