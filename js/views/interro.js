// views/interro.js — l'interro du jour : cinq questions, la réponse cachée
// jusqu'à ce qu'on la demande.
//
// L'interro est **générée** ailleurs, par la tâche planifiée du PC
// (`tools/interro.py`) : cet écran ne fait que la lire. La seule chose qu'il
// écrit, ce sont les **marques** des questions — et pas dans l'interro, à côté.
// Voir docs/decisions.md, « Interro du jour » et « Marquer une question de
// l'interro ».
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
import { getDaily, getMarks, setMark, clearMark } from '../store.js';
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
  // Les marques se lisent par identifiant de question, donc après l'interro.
  // Une question sans `id` ne peut pas être marquée : elle n'en demande pas.
  const ids = questions.map((q) => q.id).filter(Boolean);
  const marques = ids.length ? await getMarks(ids) : {};

  fill(ctx.root,
    navigation(ctx, day, today),
    questions.length === 0
      ? el('p', { class: 'empty' }, day === today
        ? 'Pas d’interro aujourd’hui : la réserve est vide. '
          + 'Elle se remplit quand le PC est ouvert.'
        : 'Pas d’interro ce jour-là.')
      : el('ol', { class: 'interro' }, questions.map((q, i) => question(q, i, marques[q.id], day))),
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
 * Ce que « Copier » met dans le presse-papiers : le thème, l'énoncé et la
 * réponse en **source brute** (texte + LaTeX `$…$`), pas le rendu.
 *
 * Pourquoi la source : c'est elle qui se colle sans perte, dans Claude (qui lit
 * le LaTeX) comme dans l'éditeur de carte (qui le rend). Le texte rendu par
 * KaTeX, lui, aplatit fractions et indices en une suite de caractères illisible.
 */
function texteACopier(q) {
  return [
    q.theme && `Thème : ${q.theme}`,
    `Énoncé :\n${q.question || ''}`,
    `Réponse :\n${q.answer || ''}`,
  ].filter(Boolean).join('\n\n');
}

/**
 * Les trois marques, dans l'ordre des boutons. `mark` est ce qui est rangé
 * (store.js), `label` ce qu'on lit. Pas de « à faire » : c'est l'absence de
 * marque, pas un bouton.
 */
const MARQUES = [
  { mark: 'done', label: 'Faite' },
  { mark: 'review', label: 'À revoir' },
  { mark: 'later', label: 'Plus tard' },
];

/**
 * Les boutons de marque d'une question : une marque allumée au plus, un tap
 * sur l'allumée l'éteint.
 *
 * L'écran change **avant** l'écriture, sans l'attendre : avec le cache
 * persistant, la promesse de `setDoc` ne se résout qu'à l'accusé du serveur —
 * hors ligne, pas avant le retour du réseau. L'attendre ferait croire que le
 * tap n'a rien fait. Seul un vrai refus (règles, quota) ramène l'écran à la
 * dernière marque que le serveur a acceptée.
 */
function marquage(q, initiale, day) {
  let actuelle = initiale || null;
  // Ce que le serveur a accepté en dernier : c'est là qu'on revient sur un refus,
  // et non à la marque d'avant le tap, qui a pu être refusée elle aussi.
  let enregistree = actuelle;

  const boutons = MARQUES.map(({ mark, label }) => el('button', {
    class: 'btn btn-sm',
    on: { click: () => basculer(mark) },
  }, label));

  // `aria-pressed` dit l'état au lecteur d'écran, et c'est aussi lui que le
  // CSS allume : un seul endroit porte l'état affiché.
  const afficher = () => boutons.forEach((b, k) =>
    b.setAttribute('aria-pressed', String(MARQUES[k].mark === actuelle)));

  function basculer(mark) {
    actuelle = actuelle === mark ? null : mark;
    const voulue = actuelle;
    afficher();
    // Firestore applique les écritures d'un même client dans l'ordre : les
    // réponses arrivent donc dans l'ordre des taps.
    (voulue ? setMark(q.id, voulue, day) : clearMark(q.id)).then(
      () => { enregistree = voulue; },
      (err) => {
        console.error(err);
        // Retapé depuis : c'est l'écriture suivante qui fait foi, et qui dira
        // elle-même si elle échoue.
        if (actuelle !== voulue) return;
        actuelle = enregistree;
        afficher();
        alert('Marque non enregistrée : ' + err.message);
      });
  }

  afficher();
  return el('div', { class: 'row marques', role: 'group', 'aria-label': 'Marque' }, boutons);
}

/**
 * Une question : son numéro et son thème, l'énoncé, puis la réponse derrière
 * un bouton, un bouton pour copier le tout, et tout en bas les marques.
 *
 * La réponse est montée d'emblée et seulement **cachée** (`hidden`) : la
 * révéler ne relit rien et ne recompose pas le LaTeX. Le bouton bascule — on
 * peut la recacher pour se reposer la question.
 *
 * « Copier » emporte la réponse même cachée : copier n'affiche rien, l'écran
 * ne la dévoile pas pour autant.
 *
 * Les marques sont **sous** la réponse, et visibles qu'elle soit cachée ou
 * non : on marque après avoir comparé — une démonstration fait un écran, des
 * boutons au-dessus obligeraient à remonter —, mais « plus tard » se décide
 * souvent sans la lire.
 */
function question(q, i, marque, day) {
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

  // `navigator.clipboard` n'existe qu'en contexte sûr (https, localhost) — c'est
  // le cas en ligne comme en local. Ailleurs, l'appel lève : on le dit.
  const copier = el('button', {
    class: 'btn btn-sm btn-ghost',
    on: { click: async () => {
      try {
        await navigator.clipboard.writeText(texteACopier(q));
        copier.textContent = 'Copié ✓';
        setTimeout(() => { copier.textContent = 'Copier'; }, 2000);
      } catch (err) {
        console.error(err);
        alert('Copie impossible : ' + err.message);
      }
    } },
  }, 'Copier');

  return el('li', { class: 'card-face' },
    el('div', { class: 'face-label' }, q.theme ? `${i + 1} · ${q.theme}` : `${i + 1}`),
    renderMath(el('div'), q.question || ''),
    el('div', { class: 'row actions-question' }, bouton, copier),
    reponse,
    q.id && marquage(q, marque, day),
  );
}
