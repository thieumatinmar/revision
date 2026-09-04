// views/editeur_theoreme.js — création et modification d'un théorème.
//
// Même parti pris que l'éditeur de carte : **la saisie à gauche, le théorème
// monté à droite**. Écrire du LaTeX à l'aveugle et découvrir la coquille plus
// tard est exactement ce que l'aperçu supprime. Sous 900 px, la bascule de
// l'en-tête montre un visage à la fois — le formulaire est masqué, jamais
// détruit, sinon une bascule perdrait les saisies en cours.
//
// Écran **distinct** de `editeur.js` plutôt que le même paramétré : la carte y
// traîne un chapitre, des images, une indication et une note en extinction, et
// un retour possible vers un test en cours. Rien de tout ça ici. La ressemblance
// entre les deux fichiers est de structure, pas de contenu.
//
// Deux points d'entrée, un seul retour :
//   #/theoreme/nouveau        création
//   #/theoreme/<id>/editer    modification

import { el, fill } from '../dom.js';
import { faceTheoreme } from '../theoreme.js';
import { getTheorem, saveTheorem, deleteTheorem, cardsCiting } from '../store.js';

/** Délai avant de recomposer l'aperçu, en ms — voir `editeur.js`. */
const DELAI_APERCU = 150;

export async function render(ctx) {
  // `ctx.mode` vient de la route (voir app.js) : il dit s'il y a un identifiant
  // à lire ou un théorème à créer. La vue n'a rien à deviner.
  const creation = ctx.mode === 'creation';

  const theorem = creation
    ? { title: '', statement: '', sketch: '' }
    : await getTheorem(ctx.params[0]);

  if (!theorem) {
    ctx.root.append(el('p', { class: 'empty' }, 'Théorème introuvable.'));
    return;
  }

  // Depuis une modification, on revient au théorème qu'on vient de corriger ;
  // depuis une création, il n'y a pas encore de détail où revenir.
  const retour = creation ? '#/bibliotheque' : `#/theoreme/${theorem.id}`;

  ctx.setTitle(creation ? 'Nouveau théorème' : 'Modifier');

  const bascule = el('button', {
    class: 'btn btn-sm bascule-apercu',
    title: 'Voir le théorème monté',
    on: { click: () => basculer(mode === 'edition' ? 'apercu' : 'edition') },
  }, 'Aperçu');

  ctx.setHeader(el('a', { class: 'btn btn-sm btn-ghost', href: retour }, '‹ Annuler'), bascule);

  // --- Champs -----------------------------------------------------------------
  // Le titre est sur une seule ligne : c'est un nom, pas un texte. Le LaTeX y est
  // accepté — « Théorème de Cauchy sur $\mathbb{C}$ » est un titre légitime.
  const titre = el('input', {
    value: theorem.title || '',
    placeholder: 'Ex. : Théorème de Dini',
  });

  const enonce = champ('Énoncé — ce que le théorème affirme, hypothèses comprises',
    theorem.statement,
    'Ex. : Soit $(f_n)$ une suite croissante de fonctions continues sur un compact $K$…');

  const esquisse = champ('Esquisse — les étapes et les leviers, pas la preuve rédigée',
    theorem.sketch,
    'Ex. : 1) poser $g_n = f - f_n$ ; 2) recouvrement ouvert ; 3) extraire un sous-recouvrement fini.');

  const erreur = el('p', { class: 'small', style: 'color:#e8695f;min-height:1.2em' });

  // --- Les deux blocs ---------------------------------------------------------
  const formulaire = el('div', { class: 'editeur-champs' },
    el('div', { class: 'champ' },
      el('label', { class: 'small muted' }, 'Titre — le nom du théorème'),
      titre,
    ),
    enonce.bloc,
    esquisse.bloc,
    erreur,
  );

  const zoneApercu = el('div', { class: 'editeur-apercu' });

  // Deux colonnes sur PC, un visage à la fois en dessous (classe `en-apercu`).
  // Une classe et non un style en ligne : un `display:none` posé pour l'écran
  // étroit survivrait au passage en grand écran.
  const grille = el('div', { class: 'editeur' }, formulaire, zoneApercu);

  const zoneSuppression = creation ? null : el('div', { style: 'margin-top:28px;text-align:center' },
    el('button', {
      class: 'btn-sm',
      style: 'color:#e8695f',
      on: { click: supprimer },
    }, 'Supprimer ce théorème'),
  );

  // La barre d'actions vit **hors** de la grille : sur écran étroit en aperçu, le
  // formulaire est masqué, et une barre posée dedans emporterait *Enregistrer*.
  ctx.root.append(
    grille,
    el('div', { class: 'actions' },
      el('button', { class: 'btn-primary', on: { click: enregistrer } }, 'Enregistrer'),
      el('a', { class: 'btn', href: retour }, 'Annuler'),
    ),
    zoneSuppression,
  );

  // --- Aperçu vivant ----------------------------------------------------------
  let minuteur = null;

  function planifierApercu() {
    clearTimeout(minuteur);
    minuteur = setTimeout(dessineApercu, DELAI_APERCU);
  }

  /** Redessine à partir des valeurs **du formulaire**, jamais de l'enregistré. */
  function dessineApercu() {
    fill(zoneApercu,
      el('p', { class: 'small muted' }, 'Aperçu — le théorème tel qu’il se lira.'),
      faceTheoreme(valeurs()),
    );
  }

  [titre, enonce.input, esquisse.input]
    .forEach((entree) => entree.addEventListener('input', planifierApercu));

  dessineApercu();

  /** Visage courant sous 900 px : 'edition' ou 'apercu'. */
  let mode = 'edition';

  function basculer(vers) {
    mode = vers;
    const enApercu = vers === 'apercu';
    grille.classList.toggle('en-apercu', enApercu);
    if (zoneSuppression) zoneSuppression.style.display = enApercu ? 'none' : '';
    bascule.textContent = enApercu ? '‹ Édition' : 'Aperçu';
    window.scrollTo(0, 0);
  }

  /** Le théorème tel que le formulaire le décrit à cet instant. */
  function valeurs() {
    return {
      ...theorem,
      title: titre.value.trim(),
      statement: enonce.input.value,
      sketch: esquisse.input.value,
    };
  }

  async function enregistrer() {
    // Le titre est obligatoire, contrairement à celui d'une carte : c'est par lui
    // qu'on retrouve un théorème dans une liste triée par titre, et sans lui la
    // bibliothèque devient un tas.
    if (!titre.value.trim() || !enonce.input.value.trim()) {
      // Le message vit dans le formulaire : l'afficher sans y revenir
      // reviendrait à ne rien afficher.
      basculer('edition');
      erreur.textContent = 'Le titre et l’énoncé sont obligatoires.';
      return;
    }
    const enregistre = await saveTheorem(valeurs());
    location.hash = `#/theoreme/${enregistre.id}`;
  }

  async function supprimer() {
    // On compte les cartes citantes **avant** de demander : supprimer retire
    // aussi leurs renvois, et l'on ne fait pas confirmer une conséquence qu'on
    // n'a pas montrée.
    const citantes = await cardsCiting(theorem.id);
    const avertissement = citantes.length > 0
      ? `

${citantes.length} carte${citantes.length > 1 ? 's le citent' : ' le cite'} :`
        + ` ${citantes.length > 1 ? 'leurs renvois seront retirés' : 'son renvoi sera retiré'}.`
      : '';
    if (!confirm(`Supprimer définitivement ce théorème ?${avertissement}`)) return;
    await deleteTheorem(theorem.id);
    location.hash = '#/bibliotheque';
  }
}

/** Un champ = libellé et zone de saisie. Rien d'autre — voir `editeur.js`. */
function champ(libelle, valeur, placeholder) {
  const input = el('textarea', { placeholder, value: valeur || '' });

  const bloc = el('div', { class: 'champ' },
    el('label', { class: 'small muted' }, libelle),
    input,
  );

  return { bloc, input };
}
