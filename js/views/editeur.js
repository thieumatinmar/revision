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
import {
  getCard, saveCard, deleteCard, listCategories, listEntries, kindOf,
  saveEntry, THEOREM, DEFINITION,
} from '../store.js';
import { ESPECES } from '../entree.js';
import { marqueDe } from '../marques.js';
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
  const [categories, entries] = await Promise.all([listCategories(), listEntries()]);

  const card = creation
    ? { categoryId: param, title: '', front: '', hint: '', back: '', note: '', images: [], entryIds: [] }
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
  const verso = champ('Verso (facultatif) — le complément, lu après', card.back,
    'Ex. : $$\\P(|X-\\E[X]|\\ge\\varepsilon)\\le \\V(X)/\\varepsilon^2$$');

  // --- Où poser une marque ----------------------------------------------------
  // La marque d'un renvoi s'écrit dans le recto ou le verso, là où l'on était en
  // train de taper. On retient donc le dernier point de saisie — champ et
  // position. Sans lui, il faudrait soit un sélecteur de position, soit taper la
  // marque à la main, c'est-à-dire les deux choses qu'on voulait éviter.
  //
  // C'est un état invisible, et c'est assumé : l'aperçu redessine en 150 ms, on
  // voit donc immédiatement où le bloc s'est posé.
  let point = null;
  [recto, verso].forEach(({ input }) => {
    const noter = () => { point = { input, at: input.selectionStart }; };
    ['focus', 'click', 'keyup'].forEach((ev) => input.addEventListener(ev, noter));
  });

  /**
   * Écrit la marque d'une entrée au dernier point de saisie.
   *
   * Faute de point connu, on écrit à la fin du verso — ou du recto si la carte
   * n'en a pas encore : mieux vaut une marque visible au mauvais endroit, qu'on
   * déplace d'un couper-coller, qu'un clic sans effet visible.
   *
   * La marque occupe **sa propre ligne**. C'est un bloc, pas un mot dans une
   * phrase : posée au milieu d'un `$$…$$`, elle couperait la formule en deux
   * moitiés que KaTeX signalerait toutes les deux en erreur.
   */
  function insereMarque(entry) {
    const cible = point || (verso.input.value.trim()
      ? { input: verso.input, at: verso.input.value.length }
      : { input: recto.input, at: recto.input.value.length });

    const zone = cible.input;
    const at = Math.min(cible.at, zone.value.length);
    const avant = zone.value.slice(0, at);
    const apres = zone.value.slice(at);

    // On complète les sauts de ligne manquants, sans en empiler quand ils sont
    // déjà là : insérer deux fois de suite ne doit pas creuser un trou.
    const tete = !avant || avant.endsWith('\n\n') ? '' : avant.endsWith('\n') ? '\n' : '\n\n';
    const queue = !apres || apres.startsWith('\n\n') ? '' : apres.startsWith('\n') ? '\n' : '\n\n';
    const texte = tete + marqueDe(entry) + queue;

    zone.value = avant + texte + apres;
    const fin = avant.length + texte.length;
    zone.setSelectionRange(fin, fin);
    point = { input: zone, at: fin };
    zone.focus();
    planifierApercu();
  }

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
    Array.isArray(card.entryIds) ? [...card.entryIds] : [],
    entries,
    { auChangement: () => planifierApercu(), insere: insereMarque },
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
  fill(ctx.root,
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
      faceCarte(valeurs(), { hint: true, back: true, entries }),
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
      entryIds: renvois.valeur(),
    };
  }

  async function enregistrer() {
    // Seul le recto est exigé. Une carte sans verso est une forme légitime — une
    // note qui se suffit — autant qu'une question dont la réponse s'écrira plus
    // tard : l'app ne tranche pas entre les deux et ne marque ni l'une ni
    // l'autre (docs/decisions.md, « Ce qui nomme est obligatoire… »).
    if (!recto.input.value.trim()) {
      // Le message vit dans le formulaire : l'afficher sans revenir dessus
      // reviendrait à ne rien afficher du tout.
      basculer('edition');
      erreur.textContent = 'Le recto est obligatoire.';
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
 * Les renvois vers la bibliothèque : chercher une entrée, la créer au besoin,
 * l'attacher, la placer, la retirer.
 *
 * Une **recherche** et non un menu déroulant : la bibliothèque est faite pour
 * grossir, et un `<select>` de cent cinquante entrées est inutilisable sur le
 * téléphone — c'est-à-dire là où l'on révise. Le filtre est celui de la
 * bibliothèque (`recherche.js`), déjà écrit : mêmes règles, aucune surprise.
 *
 * On y **crée** désormais une entrée, ce que ce champ refusait — mais au titre
 * seul, et sans quitter l'écran : le nom se capture au moment où il passe, le
 * corps s'écrit quand on repasse dessus (docs/decisions.md, « Créer une entrée
 * depuis la carte »). L'espèce est demandée à ce moment-là, parce qu'elle est la
 * seule chose qu'un titre ne dit pas.
 *
 * Chaque entrée proposée porte sa **pastille** d'espèce : citer la définition
 * d'un objet ou le théorème qui le concerne n'est pas le même geste, et les deux
 * portent souvent des titres voisins.
 *
 * `entries` est la bibliothèque chargée par la vue, **mutée** ici à la
 * création : c'est le même tableau que celui passé à l'aperçu, donc le renvoi
 * s'y résout aussitôt, sans relire Firestore. `ids` est la liste possédée par la
 * carte, modifiée en place — c'est elle que `valeur()` rend.
 */
function champRenvois(ids, entries, { auChangement = () => {}, insere = () => {} } = {}) {
  const attaches = el('div', { class: 'renvois-boutons', style: 'margin-bottom:8px' });
  const resultats = el('div', { class: 'renvois-resultats' });
  const etat = el('p', { class: 'small muted', style: 'min-height:1.2em;margin:6px 0 0' });

  const search = el('input', {
    type: 'search',
    placeholder: 'Chercher une entrée à citer, ou en créer une…',
    on: { input: () => dessineResultats() },
  });

  const bloc = el('div', { class: 'champ' },
    el('label', { class: 'small muted' },
      'Renvois — les entrées citées, en bas de la carte ou là où tu les places'),
    attaches,
    search,
    resultats,
    etat,
  );

  /** Les entrées attachées, dans l'ordre où on les a posées. */
  function dessineAttaches() {
    // Un identifiant inconnu est ignoré plutôt qu'affiché : il ne survivrait pas
    // à l'enregistrement de toute façon, `valeur()` ne rendant que le résolu.
    const resolus = ids.map((id) => entries.find((e) => e.id === id)).filter(Boolean);

    fill(attaches, resolus.length === 0
      ? el('span', { class: 'small muted' }, 'Aucun renvoi.')
      : resolus.map((e) => el('span', { class: 'renvoi-pastille' },
          el('span', { class: 'pastille-espece' }, ESPECES[kindOf(e)].pastille),
          el('span', {}, e.title || 'Sans titre'),
          // Poser la marque est un **second** geste, délibéré : attacher sans
          // placer reste le cas courant, et le renvoi va alors en bas de carte.
          el('button', {
            class: 'btn-sm',
            title: 'Poser ici la marque de ce renvoi',
            on: { click: () => insere(e) },
          }, '↓ ici'),
          el('button', {
            class: 'btn-sm',
            title: 'Retirer ce renvoi',
            on: { click: () => { ids.splice(ids.indexOf(e.id), 1); redessine(); } },
          }, '✕'),
        )));
  }

  /**
   * Les candidats : au plus six, et jamais ceux déjà attachés — les reproposer
   * inviterait à un doublon que rien n'empêcherait ensuite.
   *
   * Les deux boutons de création suivent **toujours**, même quand la recherche
   * trouve : « Baire » peut exister comme théorème alors qu'on veut citer la
   * définition. C'est le cas normal, pas un rattrapage d'échec.
   */
  function dessineResultats() {
    const q = search.value.trim();
    if (!q) return fill(resultats);

    const trouves = filtre(entries, q).filter((e) => !ids.includes(e.id)).slice(0, 6);

    fill(resultats,
      trouves.length === 0
        ? el('p', { class: 'small muted' }, 'Aucune entrée ne correspond.')
        : trouves.map((e) => el('button', {
            class: 'btn-sm resultat-renvoi',
            on: { click: () => {
              ids.push(e.id);
              search.value = '';
              redessine();
            } },
          },
            el('span', { class: 'pastille-espece' }, ESPECES[kindOf(e)].pastille),
            e.title || 'Sans titre')),
      el('div', { class: 'creation-renvoi' },
        el('span', { class: 'small muted' }, `Créer « ${q} » :`),
        boutonCreer(THEOREM, q),
        boutonCreer(DEFINITION, q),
      ),
    );
  }

  function boutonCreer(kind, titre) {
    return el('button', {
      class: 'btn-sm',
      on: { click: (ev) => cree(kind, titre, ev.currentTarget) },
    }, `+ ${ESPECES[kind].nom}`);
  }

  /**
   * Crée l'entrée, l'attache, et rend la main.
   *
   * Titre seul : ni énoncé ni appui. C'est un enregistrement complet malgré
   * tout — l'entrée existe en bibliothèque dès ce clic, indépendamment du sort
   * de la carte en cours d'écriture. Annuler la carte ne la retire donc pas, et
   * c'est voulu : deux enregistrements imbriqués, dont l'un annulerait l'autre,
   * serait bien plus surprenant.
   */
  async function cree(kind, titre, bouton) {
    bouton.disabled = true;
    etat.style.color = '';
    etat.textContent = 'Création…';
    try {
      const entree = await saveEntry({ kind, title: titre, statement: '', support: '' });
      // `entries` est le tableau de la vue : le pousser ici suffit à ce que
      // l'aperçu résolve aussitôt le renvoi, sans relire la bibliothèque.
      entries.push(entree);
      ids.push(entree.id);
      search.value = '';
      etat.textContent = `${ESPECES[kind].nom} « ${titre} » créée — son corps reste à écrire.`;
      redessine();
    } catch (err) {
      bouton.disabled = false;
      etat.style.color = '#e8695f';
      etat.textContent = 'Création impossible : ' + err.message;
    }
  }

  function redessine() {
    dessineAttaches();
    dessineResultats();
    auChangement();
  }

  dessineAttaches();

  return { bloc, valeur: () => ids.filter((id) => entries.some((e) => e.id === id)) };
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
