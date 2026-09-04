// views/editeur.js — création et modification d'une carte.
//
// L'écran est **la saisie à gauche, la carte montée à droite** : on tape, on
// voit. Écrire du LaTeX à l'aveugle et découvrir la coquille plus tard est
// exactement ce qu'on cherche à éviter (docs/decisions.md, « L'éditeur en deux
// colonnes »).
//
// L'aperçu est le composant `faceCarte()`, toutes faces révélées. Il n'a pas sa
// propre copie du montage : une copie divergerait en silence, et un aperçu qui
// ment ne sert à rien.
//
// Sous 900 px il n'y a pas la place pour deux colonnes : la bascule de l'en-tête
// montre alors un visage à la fois. Le formulaire est seulement masqué, jamais
// détruit — sinon une bascule perdrait les saisies non enregistrées. La saisie
// se faisant sur PC, ce chemin étroit est un filet, pas le cas nominal.
//
// Deux points d'entrée, d'où deux retours possibles :
//   #/carte/nouvelle/<categoryId>   création  → retour à la liste du chapitre
//   #/carte/<cardId>                          → retour à la liste du chapitre

import { el, fill } from '../dom.js';
import { faceCarte } from '../carte.js';
import { getCard, saveCard, deleteCard, listCategories, listTheorems } from '../store.js';
import { depuisFichier, poidsTotal, formatePoids, BUDGET } from '../images.js';
import { filtre } from '../recherche.js';

/**
 * Délai avant de recomposer l'aperçu, en ms. Recomposer tout le KaTeX à chaque
 * touche saccade la frappe ; à 150 ms l'attente ne se voit pas.
 */
const DELAI_APERCU = 150;

export async function render(ctx) {
  // `ctx.mode` vient de la route (voir app.js) : il dit si le premier paramètre
  // désigne un chapitre (création) ou une carte (modification). Sans lui, il
  // faudrait deviner à partir de la forme de l'identifiant — fragile.
  const creation = ctx.mode === 'creation';
  const [param] = ctx.params;
  const [categories, theorems] = await Promise.all([listCategories(), listTheorems()]);

  const card = creation
    ? { categoryId: param, title: '', front: '', hint: '', back: '', note: '', images: [], theoremIds: [] }
    : await getCard(param);

  if (!card) {
    ctx.root.append(el('p', { class: 'empty' }, 'Carte introuvable.'));
    return;
  }

  const retour = `#/cartes/${card.categoryId}`;

  ctx.setTitle(creation ? 'Nouvelle carte' : 'Modifier');

  // La bascule ne sert que sous 900 px : au-delà, les deux colonnes sont là et
  // le bouton ne veut plus rien dire — le CSS le masque.
  const bascule = el('button', {
    class: 'btn btn-sm bascule-apercu',
    title: 'Voir la carte montée',
    on: { click: () => basculer(mode === 'edition' ? 'apercu' : 'edition') },
  }, 'Aperçu');

  ctx.setHeader(el('a', { class: 'btn btn-sm btn-ghost', href: retour }, '‹ Annuler'), bascule);

  // --- Champs -----------------------------------------------------------------
  const categorie = el('select', {},
    categories.map((c) => el('option', { value: c.id, selected: c.id === card.categoryId }, c.name)),
  );

  const titre = champTitre(card.title);

  const recto = champ('Recto — ce qui est demandé', card.front,
    'Ex. : Inégalité de Bienaymé–Tchebychev : énoncé et hypothèses ?');
  const verso = champ('Verso — la réponse', card.back,
    'Ex. : $$\\P(|X-\\E[X]|\\ge\\varepsilon)\\le \\V(X)/\\varepsilon^2$$');

  // Indication et note sont **en extinction** : on n'en écrit plus de nouvelles.
  // Le champ n'apparaît donc que si la carte en porte déjà une — et le vider
  // l'éteint pour de bon, sans porte de sortie. C'est l'effet voulu : les
  // encarts s'éteignent au fil des cartes qu'on repasse.
  const indication = card.hint
    ? champ('Indication (en extinction) — vider ce champ le fait disparaître', card.hint, '')
    : null;
  const note = card.note
    ? champ('Note (en extinction) — vider ce champ le fait disparaître', card.note, '')
    : null;

  const erreur = el('p', { class: 'small', style: 'color:#e8695f;min-height:1.2em' });

  const images = champImages(
    Array.isArray(card.images) ? [...card.images] : [],
    () => planifierApercu(),
  );

  const renvois = champRenvois(
    Array.isArray(card.theoremIds) ? [...card.theoremIds] : [],
    theorems,
    () => planifierApercu(),
  );

  // --- Les deux blocs ---------------------------------------------------------
  const formulaire = el('div', { class: 'editeur-champs' },
    el('label', { class: 'small muted' }, 'Chapitre'),
    categorie,
    titre.bloc,
    recto.bloc,
    indication && indication.bloc,
    verso.bloc,
    images.bloc,
    renvois.bloc,
    note && note.bloc,
    erreur,
  );

  const zoneApercu = el('div', { class: 'editeur-apercu' });

  // La grille : deux colonnes côte à côte sur PC, un visage à la fois en dessous
  // (classe `en-apercu`). Le choix passe par une classe et non par un style en
  // ligne, sinon un `display:none` posé pour l'écran étroit survivrait au
  // passage en grand écran — un style en ligne bat toujours la feuille.
  const grille = el('div', { class: 'editeur' }, formulaire, zoneApercu);

  // Supprimer ne concerne que l'édition : en aperçu, on regarde une carte, on ne
  // la détruit pas.
  const zoneSuppression = creation ? null : el('div', { style: 'margin-top:28px;text-align:center' },
    el('button', {
      class: 'btn-sm',
      style: 'color:#e8695f',
      on: { click: supprimer },
    }, 'Supprimer cette carte'),
  );

  // La barre d'actions vit **hors** de la grille : sur écran étroit en aperçu, le
  // formulaire est masqué, et une barre posée dedans emporterait *Enregistrer*
  // avec lui — or le geste réel finit là : je tape, je vérifie, j'enregistre.
  ctx.root.append(
    grille,
    el('div', { class: 'actions' },
      el('button', { class: 'btn-primary', on: { click: enregistrer } }, 'Enregistrer'),
      el('a', { class: 'btn', href: retour }, 'Annuler'),
    ),
    zoneSuppression,
  );

  // --- Aperçu vivant ----------------------------------------------------------
  // Toute frappe redessine la carte, après une courte pause. Le chapitre n'y
  // change rien : il range la carte, il ne s'affiche pas dessus.
  let minuteur = null;

  function planifierApercu() {
    clearTimeout(minuteur);
    minuteur = setTimeout(dessineApercu, DELAI_APERCU);
  }

  /**
   * Redessine l'aperçu à partir des valeurs **du formulaire** — jamais de la
   * carte enregistrée, qui ignore ce qu'on vient de corriger.
   */
  function dessineApercu() {
    fill(zoneApercu,
      el('p', { class: 'small muted' },
        'Aperçu — la carte telle qu’elle se lira, toutes faces révélées.'),
      faceCarte(valeurs(), { hint: true, back: true, theorems }),
    );
  }

  [titre.input, recto.input, verso.input, indication && indication.input, note && note.input]
    .filter(Boolean)
    .forEach((entree) => entree.addEventListener('input', planifierApercu));

  dessineApercu();

  /** Visage courant sous 900 px : 'edition' ou 'apercu'. */
  let mode = 'edition';

  /**
   * Passe d'un visage à l'autre, sur écran étroit uniquement. Le formulaire
   * n'est que masqué : ses valeurs restent lisibles par `valeurs()` et
   * `enregistrer()`, et une bascule ne perd donc jamais une saisie.
   */
  function basculer(vers) {
    mode = vers;
    const enApercu = vers === 'apercu';
    grille.classList.toggle('en-apercu', enApercu);
    if (zoneSuppression) zoneSuppression.style.display = enApercu ? 'none' : '';
    bascule.textContent = enApercu ? '‹ Édition' : 'Aperçu';
    window.scrollTo(0, 0);
  }

  /** La carte telle que le formulaire la décrit à cet instant. */
  function valeurs() {
    return {
      ...card,
      categoryId: categorie.value,
      title: titre.input.value.trim(),
      front: recto.input.value,
      // Champ absent = encart déjà éteint : on écrit le vide, pas l'ancienne
      // valeur — sinon un contenu invisible se réenregistrerait indéfiniment.
      hint: indication ? indication.input.value : '',
      back: verso.input.value,
      note: note ? note.input.value : '',
      images: images.valeur(),
      theoremIds: renvois.valeur(),
    };
  }

  async function enregistrer() {
    if (!recto.input.value.trim() || !verso.input.value.trim()) {
      // Le message vit dans le formulaire : l'afficher sans revenir dessus
      // reviendrait à ne rien afficher du tout.
      basculer('edition');
      erreur.textContent = 'Le recto et le verso sont obligatoires.';
      return;
    }
    await saveCard(valeurs());
    // La catégorie a pu changer : on repart de celle qui vient d'être choisie.
    location.hash = `#/cartes/${categorie.value}`;
  }

  async function supprimer() {
    if (!confirm('Supprimer définitivement cette carte ?')) return;
    await deleteCard(card.id);
    location.hash = `#/cartes/${card.categoryId}`;
  }
}

/**
 * Le titre : une seule ligne.
 *
 * Facultatif. Il sert à retrouver la carte dans la liste et la recherche, et il
 * est affiché au-dessus du recto, comme intitulé de ce dont on parle.
 *
 * Le LaTeX y est accepté : « Fonction génératrice $G_X$ » est un titre légitime.
 * Son rendu se lit dans l'aperçu, en tête de carte — pas sous le champ.
 */
function champTitre(valeur) {
  const input = el('input', { value: valeur || '', placeholder: 'Ex. : Inégalité de Bienaymé–Tchebychev' });

  const bloc = el('div', { class: 'champ' },
    el('label', { class: 'small muted' }, 'Titre (facultatif) — de quoi parle la carte'),
    input,
  );

  return { bloc, input };
}

/**
 * Les images de la réponse : import, vignettes, suppression, jauge de budget.
 *
 * La jauge n'est pas décorative. Les images vivent **dans** le document
 * Firestore, plafonné à 1 Mo : sans repère visible, on découvrirait la limite au
 * moment d'enregistrer, c'est-à-dire au pire moment. Ici, on la voit venir.
 *
 * `auChangement` prévient l'appelant qu'il faut redessiner l'aperçu : les images
 * n'arrivent pas par une frappe, aucun événement `input` ne les annonce.
 */
function champImages(images, auChangement = () => {}) {
  const galerie = el('div', { class: 'galerie' });
  const jauge = el('div', { class: 'small muted' });
  const etat = el('p', { class: 'small', style: 'min-height:1.2em;margin:6px 0 0' });

  const fichier = el('input', {
    type: 'file',
    accept: 'image/*',
    multiple: true,
    style: 'display:none',
  });

  const bouton = el('button', { type: 'button', class: 'btn-sm', on: { click: () => fichier.click() } },
    'Ajouter une image');

  fichier.addEventListener('change', async () => {
    const choisis = [...fichier.files];
    fichier.value = '';                      // pour pouvoir reprendre le même fichier
    if (choisis.length === 0) return;

    bouton.disabled = true;
    etat.style.color = 'var(--fg-dim)';
    etat.textContent = 'Traitement…';
    const refus = [];

    for (const f of choisis) {
      try {
        const url = await depuisFichier(f);
        // On vérifie le budget **après** réduction : refuser sur la taille du
        // fichier d'origine rejetterait des photos de 4 Mo qui tiennent en 150 Ko.
        if (poidsTotal(images) + url.length > BUDGET) {
          refus.push(f.name);
          continue;
        }
        images.push(url);
      } catch (err) {
        refus.push(f.name + ' (' + err.message + ')');
      }
    }

    bouton.disabled = false;
    if (refus.length) {
      etat.style.color = '#e8695f';
      etat.textContent = 'Non ajouté, budget dépassé : ' + refus.join(', ')
        + '. Supprime une image existante pour faire de la place.';
    } else {
      etat.textContent = '';
    }
    dessiner();
    auChangement();
  });

  function dessiner() {
    fill(galerie, images.map((url, i) => el('div', { class: 'vignette' },
      el('img', { src: url, alt: `Image ${i + 1} de la réponse` }),
      el('button', {
        type: 'button',
        class: 'btn-sm',
        title: 'Retirer cette image',
        on: { click: () => { images.splice(i, 1); etat.textContent = ''; dessiner(); auChangement(); } },
      }, '×'),
    )));

    const total = poidsTotal(images);
    jauge.textContent = images.length === 0
      ? 'Aucune image.'
      : `${images.length} image${images.length > 1 ? 's' : ''} — `
        + `${formatePoids(total)} sur ${formatePoids(BUDGET)} utilisés.`;
  }

  const bloc = el('div', { class: 'champ' },
    el('label', { class: 'small muted' },
      'Images de la réponse (facultatif) — schéma, figure, démonstration écrite'),
    galerie,
    el('div', { class: 'row', style: 'margin-top:8px' }, bouton, fichier, jauge),
    etat,
  );

  dessiner();
  return { bloc, valeur: () => [...images] };
}

/**
 * Les renvois vers la bibliothèque : chercher un théorème, l'attacher, le retirer.
 *
 * Une **recherche** et non un menu déroulant : la bibliothèque est faite pour
 * grossir, et un `<select>` de cent cinquante entrées est inutilisable sur le
 * téléphone — c'est-à-dire là où l'on révise. Le filtre est celui de la
 * bibliothèque (`recherche.js`), déjà écrit : mêmes règles, aucune surprise.
 *
 * On n'y **crée pas** de théorème. Attacher, c'est pointer vers ce qui existe ;
 * ouvrir un formulaire de création ici ferait deux enregistrements imbriqués
 * dans un écran qui en a déjà un.
 *
 * `theorems` est la bibliothèque chargée par la vue ; `ids` la liste possédée par
 * la carte, modifiée en place — c'est elle que `valeur()` rend.
 */
function champRenvois(ids, theorems, auChangement = () => {}) {
  const attaches = el('div', { class: 'renvois-boutons', style: 'margin-bottom:8px' });
  const resultats = el('div', { class: 'renvois-resultats' });

  const search = el('input', {
    type: 'search',
    placeholder: 'Chercher un théorème à citer…',
    on: { input: () => dessineResultats() },
  });

  const bloc = el('div', { class: 'champ' },
    el('label', { class: 'small muted' },
      'Renvois — les théorèmes cités, montrés avec le verso'),
    attaches,
    theorems.length > 0
      ? search
      : el('p', { class: 'small muted' },
          'La bibliothèque est vide : il n’y a encore rien à citer.'),
    resultats,
  );

  /** Les théorèmes attachés, dans l'ordre où on les a posés. */
  function dessineAttaches() {
    // Un identifiant inconnu est ignoré plutôt qu'affiché : il ne survivrait pas
    // à l'enregistrement de toute façon, `valeur()` ne rendant que le résolu.
    const resolus = ids.map((id) => theorems.find((t) => t.id === id)).filter(Boolean);

    fill(attaches, resolus.length === 0
      ? el('span', { class: 'small muted' }, 'Aucun renvoi.')
      : resolus.map((t) => el('span', { class: 'renvoi-pastille' },
          el('span', {}, t.title || 'Sans titre'),
          el('button', {
            class: 'btn-sm',
            title: 'Retirer ce renvoi',
            on: { click: () => { ids.splice(ids.indexOf(t.id), 1); redessine(); } },
          }, '✕'),
        )));
  }

  /**
   * Les candidats : au plus six, et jamais ceux déjà attachés — les reproposer
   * inviterait à un doublon que rien n'empêcherait ensuite.
   */
  function dessineResultats() {
    const q = search.value.trim();
    if (!q) return fill(resultats);

    const trouves = filtre(theorems, q).filter((t) => !ids.includes(t.id)).slice(0, 6);
    fill(resultats, trouves.length === 0
      ? el('p', { class: 'small muted' }, 'Aucun théorème ne correspond.')
      : trouves.map((t) => el('button', {
          class: 'btn-sm resultat-renvoi',
          on: { click: () => {
            ids.push(t.id);
            search.value = '';
            redessine();
          } },
        }, t.title || 'Sans titre')));
  }

  function redessine() {
    dessineAttaches();
    dessineResultats();
    auChangement();
  }

  dessineAttaches();

  return { bloc, valeur: () => ids.filter((id) => theorems.some((t) => t.id === id)) };
}

/**
 * Un champ = libellé et zone de saisie. Rien d'autre.
 *
 * Ni boîte de rendu sous le champ (l'aperçu de droite compose déjà le LaTeX à la
 * frappe, et une coquille s'y signale **en place** — `.math-error`, cf.
 * `mathtext.js`), ni barre d'insertion : elle visait le tap sur téléphone, où
 * l'on ne saisit pas, et au clavier on tape plus vite que l'on ne vise un
 * bouton. Ce qu'elle prenait en hauteur, la zone de saisie le récupère.
 */
function champ(libelle, valeur, placeholder) {
  const input = el('textarea', { placeholder, value: valeur || '' });

  const bloc = el('div', { class: 'champ' },
    el('label', { class: 'small muted' }, libelle),
    input,
  );

  return { bloc, input };
}
