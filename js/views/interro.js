// views/interro.js — l'interro du jour : cinq questions, la réponse cachée
// jusqu'à ce qu'on la demande.
//
// L'interro est **générée** ailleurs, par la tâche planifiée du PC
// (`tools/interro.py`) : cet écran ne fait que la lire. Rien n'y est noté, rien
// n'y est écrit. Voir docs/decisions.md, « Interro du jour ».
//
// Deux routes, une vue :
//
//   #/interro              → aujourd'hui (c'est là que mène la notification)
//   #/interro/AAAA-MM-JJ   → un jour passé, pour revenir sur une question
//
// Un jour **futur** ne s'affiche jamais : la réserve en contient déjà sept, et
// les lire d'avance gâcherait l'interro. Une adresse future retombe sur
// aujourd'hui, et la flèche « suivant » s'arrête là.

import { el, fill } from '../dom.js';
import { render as renderMath } from '../mathtext.js';
import { getDaily } from '../store.js';
import { dayKey, isDayKey, shiftDay, formatDay } from '../jours.js';
import { pushState, subscribe } from '../push.js';

export async function render(ctx) {
  const today = dayKey();
  const demande = ctx.params[0];
  // Les clés se comparent comme des chaînes : l'ordre alphabétique de
  // `AAAA-MM-JJ` est l'ordre des jours (voir jours.js).
  const day = demande && isDayKey(demande) && demande <= today ? demande : today;

  const [daily, etatPush] = await Promise.all([getDaily(day), pushState()]);

  ctx.setTitle(day === today ? 'Interro du jour' : 'Interro');
  ctx.setHeader(el('a', { class: 'btn btn-sm btn-ghost', href: '#/' }, '‹ Accueil'), null);

  const questions = daily && Array.isArray(daily.questions) ? daily.questions : [];

  fill(ctx.root,
    navigation(ctx, day, today),
    questions.length === 0
      ? el('p', { class: 'empty' }, day === today
        ? 'Pas d’interro aujourd’hui : la réserve est vide. '
          + 'Elle se remplit quand le PC est ouvert.'
        : 'Pas d’interro ce jour-là.')
      : el('ol', { class: 'interro' }, questions.map(question)),
    notification(ctx, etatPush),
  );
}

/**
 * En bas de l'écran : où va la notification du matin, et le bouton pour la
 * recevoir ici. C'est l'endroit où l'on arrive par la notification — donc
 * celui où l'on pense à la régler.
 */
function notification(ctx, etat) {
  if (etat === 'indisponible') return null;
  if (etat === 'active') {
    return el('p', { class: 'small muted note-push' }, 'Notification chaque matin sur cet appareil.');
  }
  if (etat === 'bloquee') {
    return el('p', { class: 'small muted note-push' },
      'Notifications bloquées pour ce site : à réautoriser dans les réglages du navigateur.');
  }
  const bouton = el('button', {
    class: 'btn btn-sm',
    on: { click: async () => {
      bouton.disabled = true;
      try {
        await subscribe();
      } catch (err) {
        console.error(err);
        alert('Abonnement impossible : ' + err.message);
      }
      ctx.refresh();
    } },
  }, etat === 'ailleurs' ? 'Recevoir ici à la place' : 'Recevoir la notification chaque matin');
  return el('div', { class: 'note-push' },
    etat === 'ailleurs' && el('p', { class: 'small muted' }, 'La notification du matin va sur un autre appareil.'),
    bouton,
  );
}

/**
 * ‹ jour › : passer d'un jour à l'autre.
 *
 * Aujourd'hui garde l'adresse courte `#/interro` — c'est celle de la
 * notification, et l'historique du navigateur n'a pas à en connaître deux.
 * Le bouton « suivant » est grisé sur aujourd'hui plutôt que retiré : la barre
 * garde sa forme d'un jour à l'autre.
 */
function navigation(ctx, day, today) {
  const vers = (d) => ctx.go(d === today ? '/interro' : `/interro/${d}`);
  const suivant = shiftDay(day, 1);
  return el('div', { class: 'row nav-jours' },
    el('button', {
      class: 'btn btn-sm', 'aria-label': 'Jour précédent',
      on: { click: () => vers(shiftDay(day, -1)) },
    }, '‹'),
    el('div', { class: 'jour' }, day === today ? `Aujourd’hui, ${formatDay(day)}` : formatDay(day)),
    el('button', {
      class: 'btn btn-sm', 'aria-label': 'Jour suivant',
      disabled: suivant > today,
      on: { click: () => vers(suivant) },
    }, '›'),
  );
}

/**
 * Une question : son numéro et son thème, l'énoncé, puis la réponse derrière
 * un bouton.
 *
 * La réponse est montée d'emblée et seulement **cachée** (`hidden`) : la
 * révéler ne relit rien et ne recompose pas le LaTeX. Le bouton bascule — on
 * peut la recacher pour se reposer la question.
 */
function question(q, i) {
  const reponse = el('div', { class: 'reponse', hidden: true },
    el('hr'),
    el('div', { class: 'face-label' }, 'Réponse'),
    renderMath(el('div'), q.answer || ''),
  );
  const bouton = el('button', {
    class: 'btn btn-sm',
    on: { click: () => {
      reponse.hidden = !reponse.hidden;
      bouton.textContent = reponse.hidden ? 'Voir la réponse' : 'Cacher la réponse';
    } },
  }, 'Voir la réponse');

  return el('li', { class: 'card-face' },
    el('div', { class: 'face-label' }, q.theme ? `${i + 1} · ${q.theme}` : `${i + 1}`),
    renderMath(el('div'), q.question || ''),
    el('div', { class: 'actions-question' }, bouton),
    reponse,
  );
}
