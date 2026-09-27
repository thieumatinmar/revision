// views/entree_detail.js — une entrée de bibliothèque, en entier.
//
// Rien n'y est caché ni révélé : une entrée se consulte. Le montage lui-même
// vient de `entree.js`, partagé avec l'aperçu de l'éditeur — deux montages
// divergeraient en silence.

import { el, fill } from '../dom.js';
import { faceEntree, espece } from '../entree.js';
import { getEntry } from '../store.js';

export async function render(ctx) {
  const id = ctx.params[0];
  const entry = await getEntry(id);

  if (!entry) {
    ctx.setTitle('Entrée');
    ctx.root.append(el('p', { class: 'empty' }, 'Entrée introuvable.'));
    return;
  }

  // Le titre de l'écran dit l'espèce : c'est le repère qu'on lit sans réfléchir
  // en arrivant depuis une liste où les deux se mélangent.
  ctx.setTitle(espece(entry).nom);
  ctx.setHeader(
    el('a', { class: 'btn btn-sm btn-ghost', href: '#/bibliotheque' }, '‹ Bibliothèque'),
    el('a', { class: 'btn btn-sm', href: `#/entree/${id}/editer` }, 'Modifier'),
  );

  fill(ctx.root, faceEntree(entry));
}
