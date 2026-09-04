// views/editeur_entree.js — création et modification d'une entrée de
// bibliothèque : théorème ou définition.
//
// Même parti pris que l'éditeur de carte : **la saisie à gauche, l'entrée
// montée à droite**. Écrire du LaTeX à l'aveugle et découvrir la coquille plus
// tard est exactement ce que l'aperçu supprime. Sous 900 px, la bascule de
// l'en-tête montre un visage à la fois — le formulaire est masqué, jamais
// détruit, sinon une bascule perdrait les saisies en cours.
//
// **Un seul éditeur pour les deux espèces.** Elles ont les mêmes champs aux
// mêmes places ; seuls les libellés changent, et ils viennent tous de
// `ESPECES` dans `entree.js`. Deux fichiers, ou un `switch` par champ, feraient
// payer en code une différence qui n'est que de vocabulaire.
//
// Écran **distinct** de `editeur.js` en revanche : la carte y traîne un
// chapitre, des images, des renvois, une indication et une note en extinction.
// Rien de tout ça ici. La ressemblance entre les deux fichiers est de
// structure, pas de contenu.
//
// Trois points d'entrée, un seul retour :
//   #/entree/nouveau/theoreme     création d'un théorème
//   #/entree/nouveau/definition   création d'une définition
//   #/entree/<id>/editer          modification

import { el, fill } from '../dom.js';
import { faceEntree, espece, kindDuSegment } from '../entree.js';
import { getEntry, saveEntry, deleteEntry, kindOf } from '../store.js';

/** Délai avant de recomposer l'aperçu, en ms — voir `editeur.js`. */
const DELAI_APERCU = 150;

/**
 * Les exemples de saisie, par espèce.
 *
 * Ils vivent ici et non dans `ESPECES` : un placeholder appartient à l'écran de
 * saisie, pas au vocabulaire du domaine. `entree.js` sert aussi au détail et au
 * dépliage d'un renvoi, qui n'ont rien à faire d'un exemple de frappe.
 */
const EXEMPLES = {
  theorem: {
    title: 'Ex. : Théorème de Dini',
    statement: 'Ex. : Soit $(f_n)$ une suite croissante de fonctions continues sur un compact $K$…',
    support: 'Ex. : 1) poser $g_n = f - f_n$ ; 2) recouvrement ouvert ; 3) extraire un sous-recouvrement fini.',
  },
  definition: {
    title: 'Ex. : Idéal d’un anneau',
    statement: 'Ex. : Soit $A$ un anneau commutatif. Une partie $I \\subset A$ est un idéal si…',
    support: 'Ex. : $2\\mathbb{Z}$ est un idéal de $\\mathbb{Z}$ ; $\\mathbb{Z}$ n’est pas un idéal de $\\mathbb{Q}$ — piège : un idéal n’est pas un sous-anneau.',
  },
};

/** Ce qu'on écrit sous chaque libellé, pour dire à quoi le champ sert. */
const AIDES = {
  theorem: {
    statement: 'ce que le théorème affirme, hypothèses comprises',
    support: 'les étapes et les leviers, pas la preuve rédigée',
  },
  definition: {
    statement: 'ce que la notion est, exactement',
    support: 'exemples, contre-exemples, pièges',
  },
};

export async function render(ctx) {
  // `ctx.mode` vient de la route (voir app.js) : il dit s'il y a un identifiant
  // à lire ou une entrée à créer. La vue n'a rien à deviner.
  const creation = ctx.mode === 'creation';

  // En création, le premier paramètre porte l'espèce ; en modification, il porte
  // l'identifiant et l'espèce se lit dans le document.
  const entry = creation
    ? { kind: kindDuSegment(ctx.params[0]), title: '', statement: '', support: '' }
    : await getEntry(ctx.params[0]);

  if (!entry) {
    ctx.root.append(el('p', { class: 'empty' }, 'Entrée introuvable.'));
    return;
  }

  // L'espèce, lue une fois : elle décide des libellés, des exemples et des
  // messages. `kindOf` la normalise — jamais `entry.kind` en direct, qui peut
  // être absent sur une entrée écrite avant les définitions.
  const kind = kindOf(entry);
  const mots = espece(entry);

  // Depuis une modification, on revient à l'entrée qu'on vient de corriger ;
  // depuis une création, il n'y a pas encore de détail où revenir.
  const retour = creation ? '#/bibliotheque' : `#/entree/${entry.id}`;

  ctx.setTitle(creation ? `Nouveau — ${mots.nom.toLowerCase()}` : `Modifier — ${mots.nom.toLowerCase()}`);

  const bascule = el('button', {
    class: 'btn btn-sm bascule-apercu',
    title: 'Voir l’entrée montée',
    on: { click: () => basculer(mode === 'edition' ? 'apercu' : 'edition') },
  }, 'Aperçu');

  ctx.setHeader(el('a', { class: 'btn btn-sm btn-ghost', href: retour }, '‹ Annuler'), bascule);

  // --- Champs -----------------------------------------------------------------
  // Le titre est sur une seule ligne : c'est un nom, pas un texte. Le LaTeX y est
  // accepté — « Théorème de Cauchy sur $\mathbb{C}$ » est un titre légitime.
  const titre = el('input', {
    value: entry.title || '',
    placeholder: EXEMPLES[kind].title,
  });

  const enonce = champ(
    `${mots.labels.statement} (facultatif) — ${AIDES[kind].statement}`,
    entry.statement,
    EXEMPLES[kind].statement,
  );

  const support = champ(
    `${mots.labels.support} — ${AIDES[kind].support}`,
    entry.support,
    EXEMPLES[kind].support,
  );

  const erreur = el('p', { class: 'small', style: 'color:#e8695f;min-height:1.2em' });

  // --- Les deux blocs ---------------------------------------------------------
  const formulaire = el('div', { class: 'editeur-champs' },
    el('div', { class: 'champ' },
      el('label', { class: 'small muted' }, `${mots.labels.title} — comment on la retrouvera`),
      titre,
    ),
    enonce.bloc,
    support.bloc,
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
    }, `Supprimer cette ${mots.nom.toLowerCase()}`),
  );

  // La barre d'actions vit **hors** de la grille : sur écran étroit en aperçu, le
  // formulaire est masqué, et une barre posée dedans emporterait *Enregistrer*.
  fill(ctx.root,
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
      el('p', { class: 'small muted' }, 'Aperçu — l’entrée telle qu’elle se lira.'),
      faceEntree(valeurs()),
    );
  }

  [titre, enonce.input, support.input]
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

  /** L'entrée telle que le formulaire la décrit à cet instant. */
  function valeurs() {
    return {
      ...entry,
      title: titre.value.trim(),
      statement: enonce.input.value,
      support: support.input.value,
    };
  }

  async function enregistrer() {
    // Le titre est obligatoire, contrairement à celui d'une carte : c'est par lui
    // qu'on retrouve une entrée dans une liste triée par titre, et sans lui la
    // bibliothèque devient un tas.
    //
    // Le corps, lui, ne l'est plus : une entrée peut naître d'un renvoi posé
    // depuis une carte, titre seul, et se remplir quand on repasse dessus. Le
    // refuser ici ferait de cet écran le seul à rejeter ce que l'autre chemin
    // fabrique — même règle des deux côtés, ou l'incohérence se paie.
    if (!titre.value.trim()) {
      // Le message vit dans le formulaire : l'afficher sans y revenir
      // reviendrait à ne rien afficher.
      basculer('edition');
      erreur.textContent = `${mots.labels.title} est obligatoire.`;
      return;
    }
    const enregistree = await saveEntry(valeurs());
    location.hash = `#/entree/${enregistree.id}`;
  }

  async function supprimer() {
    if (!confirm(`Supprimer définitivement cette ${mots.nom.toLowerCase()} ?`)) return;
    // `deleteEntry` retire aussi les renvois qui pointaient dessus, et dit
    // combien : la carte concernée n'affichera plus un bouton qui n'ouvre rien.
    const citantes = await deleteEntry(entry.id);
    if (citantes > 0) {
      alert(`Supprimée. ${citantes} renvoi(s) de carte ont été retirés.`);
    }
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
