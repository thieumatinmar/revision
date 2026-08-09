// views/connexion.js — le mur d'entrée.
//
// Ce n'est pas une vue du routeur : `app.js` l'affiche à la place de tout le
// reste tant que personne n'est connecté. Il n'y a donc pas de route `#/connexion`
// à laquelle on pourrait arriver par erreur.

import { el } from '../dom.js';
import { signIn } from '../auth.js';

export function ecranConnexion() {
  const erreur = el('p', { class: 'small', style: 'color:#e8695f;min-height:1.2em' });

  const bouton = el('button', {
    class: 'btn-primary',
    on: { click: async () => {
      bouton.disabled = true;
      erreur.textContent = '';
      try {
        await signIn();
      } catch (err) {
        console.error(err);
        erreur.textContent = 'Connexion impossible : ' + (err.code || err.message);
      } finally {
        bouton.disabled = false;
      }
    } },
  }, 'Se connecter avec Google');

  return el('div', { class: 'empty', style: 'padding-top:80px' },
    el('p', { style: 'font-size:1.2rem;font-weight:600;color:var(--fg)' }, 'Agrég — Révision'),
    el('p', { class: 'small', style: 'max-width:32ch;margin:8px auto 24px' },
      'Tes cartes sont rangées sous ton compte Google : c’est ce qui les fait suivre du PC au téléphone.'),
    bouton,
    erreur,
  );
}
