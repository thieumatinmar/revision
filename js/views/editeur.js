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
import { surEnregistrement, surCollageImages } from '../raccourcis.js';
import { depuisFichier, poidsTotal, formatePoids, BUDGET } from '../images.js';
import { filtre } from '../recherche.js';

/**
 * Délai avant de recomposer l'aperçu, en ms. Recomposer tout le KaTeX à chaque
 * touche saccade la frappe ; à 150 ms l'attente ne se voit pas.
 */
const DELAI_APERCU = 150;

/** Air laissé au-dessus du bloc quand l'aperçu vient chercher le curseur, en px. */
const MARGE_SUIVI = 24;

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

  // Où l'on revient. Ce n'est pas figé : le chapitre est un champ du formulaire,
  // et un enregistrement sans quitter peut le changer sous nos pieds. Les deux
  // liens de sortie sont donc gardés sous la main et recalculés (`majRetour`) —
  // sinon *Annuler* renverrait vers le chapitre d'où la carte vient de partir.
  let retour = `#/cartes/${card.categoryId}`;
  const retourHaut = el('a', { class: 'btn btn-sm btn-ghost', href: retour }, '‹ Annuler');
  const retourBas = el('a', { class: 'btn', href: retour }, 'Annuler');

  function majRetour() {
    retour = `#/cartes/${categorie.value}`;
    retourHaut.href = retour;
    retourBas.href = retour;
  }

  ctx.setTitle(creation ? 'Nouvelle carte' : 'Modifier');

  // La bascule ne sert que sous 900 px : au-delà, les deux colonnes sont là et
  // le bouton ne veut plus rien dire — le CSS le masque.
  const bascule = el('button', {
    class: 'btn btn-sm bascule-apercu',
    title: 'Voir la carte montée',
    on: { click: () => basculer(mode === 'edition' ? 'apercu' : 'edition') },
  }, 'Aperçu');

  ctx.setHeader(retourHaut, bascule);

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
  //
  // Ce même point sert à l'aperçu : il dit où l'on écrit, donc quel bloc de la
  // carte montée doit être sous les yeux. D'où `input` dans la liste — taper
  // déplace le curseur autant que le déplacer.
  let point = null;
  [recto, verso].forEach(({ input }) => {
    const noter = () => { point = { input, at: input.selectionStart }; suit(); };
    ['focus', 'click', 'keyup', 'input'].forEach((ev) => input.addEventListener(ev, noter));
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
    // La marque a rallongé le texte sans qu'aucune frappe ne l'annonce : la
    // hauteur de la zone ne se rattraperait qu'au caractère suivant.
    ajuste(zone);
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

  // Supprimer ne concerne pas l'aperçu — on y regarde une carte, on ne la
  // détruit pas — ni une carte qui n'existe pas encore. La zone est pourtant
  // construite dans les deux cas : depuis qu'un Ctrl+S peut créer la carte sans
  // quitter l'écran, « pas encore enregistrée » est un état qui se termine, et
  // `visibiliteSuppression()` la dévoile à ce moment-là.
  const zoneSuppression = el('div', { style: 'margin-top:28px;text-align:center' },
    el('button', {
      class: 'btn-sm',
      style: 'color:#e8695f',
      on: { click: supprimer },
    }, 'Supprimer cette carte'),
  );

  function visibiliteSuppression() {
    zoneSuppression.style.display = (mode === 'apercu' || !card.id) ? 'none' : '';
  }

  // Le témoin de l'enregistrement sans quitter. Il vit hors de la barre — dont le
  // CSS étire chaque enfant à parts égales — et hors du formulaire, masqué en
  // aperçu sur écran étroit. Sans lui, Ctrl+S serait un geste sans réponse.
  const temoin = el('p', { class: 'temoin small muted' });

  // La barre d'actions vit **hors** de la grille : sur écran étroit en aperçu, le
  // formulaire est masqué, et une barre posée dedans emporterait *Enregistrer*
  // avec lui — or le geste réel finit là : je tape, je vérifie, j'enregistre.
  fill(ctx.root,
    grille,
    el('div', { class: 'actions' },
      el('button', { class: 'btn-primary', on: { click: () => enregistrer() } }, 'Enregistrer'),
      retourBas,
    ),
    temoin,
    zoneSuppression,
  );

  // Ctrl+S enregistre et **reste**. Le bouton, lui, enregistre et part : les deux
  // gestes ne sont pas le même, et le raccourci sert précisément à ne pas devoir
  // choisir entre « je sécurise ce que j'ai tapé » et « j'ai fini ».
  surEnregistrement(ctx.root, () => enregistrer({ rester: true }));

  // Ctrl+V d'une image (capture d'écran…) l'ajoute aux images, où que soit le
  // focus. La réponse passe par le **témoin** et non par le seul champ Images :
  // celui-ci est souvent hors champ quand on colle depuis le verso, et un geste
  // sans réponse visible ferait coller deux fois.
  surCollageImages(ctx.root, async (files) => {
    temoin.style.color = '';
    temoin.textContent = 'Image en cours de traitement…';
    const refus = await images.ajouter(files);
    if (refus.length) {
      temoin.style.color = '#e8695f';
      temoin.textContent = 'Image non ajoutée : ' + refus.join(', ');
    } else {
      temoin.textContent = `Image ajoutée — ${images.resume()}`;
    }
  });

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
    // La carte vient d'être remontée : les blocs d'avant n'existent plus, et
    // l'aperçu est revenu en haut. On le ramène là où l'on écrit.
    suit();
  }

  /**
   * Amène sous les yeux le bloc de la carte où se trouve le curseur, et le
   * souligne.
   *
   * Le lien est l'**offset** : `carte.js` étiquette chaque paragraphe composé de
   * la face dont il vient et de sa position dans la source (`data-champ`,
   * `data-at`). Le bloc courant est donc le dernier de cette face dont la
   * position ne dépasse pas le curseur.
   *
   * On ne fait défiler **que si le bloc est hors champ**. Réaligner à chaque
   * frappe ferait sauter l'aperçu sous les yeux à chaque retour à la ligne — pire
   * que de scroller soi-même. Le liseré, lui, suit toujours : sans repère, on ne
   * saurait pas si l'aperçu a suivi ou s'il regarde ailleurs.
   *
   * Sous 900 px la colonne n'a pas de défilement propre (voir la feuille de
   * style) : `scrollTop` n'y fait rien, et c'est très bien — on n'a alors qu'un
   * visage à la fois de toute façon.
   */
  function suit() {
    const blocs = [...zoneApercu.querySelectorAll('.bloc')];
    blocs.forEach((b) => b.classList.remove('bloc-actif'));
    if (!point) return;

    const champ = point.input === recto.input ? 'front' : 'back';
    const at = Math.min(point.at, point.input.value.length);
    const cible = blocs
      .filter((b) => b.dataset.champ === champ && Number(b.dataset.at) <= at)
      .pop();
    if (!cible) return;

    cible.classList.add('bloc-actif');

    const vue = zoneApercu.getBoundingClientRect();
    const bloc = cible.getBoundingClientRect();
    if (bloc.top >= vue.top && bloc.bottom <= vue.bottom) return;
    zoneApercu.scrollTop += bloc.top - vue.top - MARGE_SUIVI;
  }

  /**
   * Le chemin inverse de `suit()` : un clic dans l'aperçu ramène le curseur dans
   * le formulaire, au début du paragraphe cliqué. On lit, on voit la coquille,
   * on clique dessus — sans avoir à la rechercher dans la source.
   *
   * Début du paragraphe et non caractère exact : une fois le LaTeX composé par
   * KaTeX, plus rien ne relie un pixel de l'aperçu à une position dans la source.
   * `data-at`, lui, est exact.
   *
   * Ne réagit **pas** :
   *   - sur un bouton ou un lien — le dépliage d'un renvoi et « Ouvrir la fiche »
   *     gardent leur rôle ;
   *   - quand du texte vient d'être sélectionné — on voulait copier, pas écrire ;
   *   - sous 900 px — un seul visage à la fois, on y lit : toucher la carte ferait
   *     sortir le clavier. Le seuil est celui de la feuille de style.
   */
  zoneApercu.addEventListener('click', (ev) => {
    if (!matchMedia('(min-width: 900px)').matches) return;
    if (ev.target.closest('button, a')) return;
    if (!getSelection().isCollapsed) return;

    if (ev.target.closest('.titre-carte')) {
      titre.input.focus();
      return;
    }

    const bloc = ev.target.closest('.bloc');
    if (!bloc) return;
    const zone = bloc.dataset.champ === 'front' ? recto.input : verso.input;
    const at = Math.min(Number(bloc.dataset.at), zone.value.length);

    // Le curseur d'abord, le focus ensuite : `focus` déclenche `noter`, qui lit
    // `selectionStart`. Et le point est posé à la main, parce que si la zone a
    // déjà le focus, `focus()` ne déclenche rien.
    zone.setSelectionRange(at, at);
    zone.focus({ preventScroll: true });
    point = { input: zone, at };
    suit();
    montreCurseur(zone, at);
  });

  [titre.input, recto.input, verso.input, indication && indication.input, note && note.input]
    .filter(Boolean)
    .forEach((entree) => entree.addEventListener('input', planifierApercu));

  dessineApercu();

  // La vue est encore détachée du document à cet instant (voir app.js), et
  // `scrollHeight` y vaut 0 : ajuster la hauteur des zones de saisie maintenant
  // les écraserait toutes à zéro. On attend donc le montage.
  requestAnimationFrame(() => {
    [recto, verso, indication, note].filter(Boolean).forEach((c) => c.ajuste());
    suit();
  });

  /** Visage courant sous 900 px : 'edition' ou 'apercu'. */
  let mode = 'edition';

  visibiliteSuppression();

  /**
   * Passe d'un visage à l'autre, sur écran étroit uniquement. Le formulaire
   * n'est que masqué : ses valeurs restent lisibles par `valeurs()` et
   * `enregistrer()`, et une bascule ne perd donc jamais une saisie.
   */
  function basculer(vers) {
    mode = vers;
    const enApercu = vers === 'apercu';
    grille.classList.toggle('en-apercu', enApercu);
    visibiliteSuppression();
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

  /**
   * Vrai pendant une écriture. Un Ctrl+S maintenu, ou un clic pendant que la
   * précédente écriture court, lancerait deux créations concurrentes — c'est-à-
   * dire deux cartes, aucune des deux ne portant l'identifiant que l'autre vient
   * d'adopter.
   */
  let enCours = false;

  /**
   * @param {{ rester?: boolean }} options `rester` vient du raccourci : on
   *   enregistre et l'écran ne bouge pas. Le bouton, lui, part vers la liste.
   */
  async function enregistrer({ rester = false } = {}) {
    if (enCours) return;

    // Seul le recto est exigé. Une carte sans verso est une forme légitime — une
    // note qui se suffit — autant qu'une question dont la réponse s'écrira plus
    // tard : l'app ne tranche pas entre les deux et ne marque ni l'une ni
    // l'autre (docs/decisions.md, « Ce qui nomme est obligatoire… »).
    if (!recto.input.value.trim()) {
      // Le message vit dans le formulaire : l'afficher sans revenir dessus
      // reviendrait à ne rien afficher du tout.
      basculer('edition');
      erreur.textContent = 'Le recto est obligatoire.';
      temoin.textContent = '';
      return;
    }

    enCours = true;
    erreur.textContent = '';
    temoin.textContent = 'Enregistrement…';
    try {
      const enregistree = await saveCard(valeurs());

      // **Adoption de l'identifiant.** Sans elle, un second Ctrl+S sur une carte
      // qui vient de naître en créerait une deuxième : `saveCard` crée quand on
      // ne lui donne pas d'`id`. `card` est l'objet que `valeurs()` étale, donc
      // l'écrire ici suffit à ce que tout l'écran devienne une modification.
      card.id = enregistree.id;
      card.categoryId = enregistree.categoryId;
      majRetour();

      if (!rester) {
        location.hash = retour;
        return;
      }

      // L'adresse cessait de dire la vérité : elle annonçait une création alors
      // que la carte existe. `replaceState` la corrige **sans** déclencher
      // `hashchange`, donc sans relancer le rendu et sans perdre la saisie en
      // cours — un rechargement retrouve désormais ce qui est en base.
      if (location.hash !== `#/carte/${card.id}`) {
        history.replaceState(null, '', `#/carte/${card.id}`);
      }
      visibiliteSuppression();
      temoin.textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-FR');
    } catch (err) {
      basculer('edition');
      erreur.textContent = 'Enregistrement impossible : ' + err.message;
      temoin.textContent = '';
    } finally {
      enCours = false;
    }
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

  fichier.addEventListener('change', () => {
    const choisis = [...fichier.files];
    fichier.value = '';                      // pour pouvoir reprendre le même fichier
    ajouter(choisis);
  });

  /**
   * Ajoute des fichiers image : réduction, contrôle du budget, redessin.
   *
   * Deux appelants : le bouton (sélecteur de fichier) et le collage, qui arrive
   * de la vue. Un seul tuyau pour les deux, sinon le budget et la réduction
   * finiraient par diverger d'un chemin à l'autre.
   *
   * @param {File[]} files
   * @returns {Promise<string[]>} les refus, lisibles — vide si tout est passé
   */
  async function ajouter(files) {
    if (files.length === 0) return [];

    bouton.disabled = true;
    etat.style.color = 'var(--fg-dim)';
    etat.textContent = 'Traitement…';
    const refus = [];

    for (const f of files) {
      // Une capture collée n'a pas toujours de nom : on dit alors ce qu'elle est.
      const nom = f.name || 'image collée';
      try {
        const url = await depuisFichier(f);
        // On vérifie le budget **après** réduction : refuser sur la taille du
        // fichier d'origine rejetterait des photos de 4 Mo qui tiennent en 150 Ko.
        if (poidsTotal(images) + url.length > BUDGET) {
          refus.push(nom + ' (budget dépassé)');
          continue;
        }
        images.push(url);
      } catch (err) {
        refus.push(nom + ' (' + err.message + ')');
      }
    }

    bouton.disabled = false;
    if (refus.length) {
      etat.style.color = '#e8695f';
      etat.textContent = 'Non ajouté : ' + refus.join(', ')
        + '. Supprime une image existante pour faire de la place.';
    } else {
      etat.textContent = '';
    }
    dessiner();
    auChangement();
    return refus;
  }

  /** « 3 images — 240 Ko sur 700 Ko utilisés. » — lu par la jauge et le témoin. */
  function resume() {
    return images.length === 0
      ? 'Aucune image.'
      : `${images.length} image${images.length > 1 ? 's' : ''} — `
        + `${formatePoids(poidsTotal(images))} sur ${formatePoids(BUDGET)} utilisés.`;
  }

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

    jauge.textContent = resume();
  }

  const bloc = el('div', { class: 'champ' },
    el('label', { class: 'small muted' },
      'Images de la réponse (facultatif) — schéma, figure, démonstration écrite'),
    galerie,
    el('div', { class: 'row', style: 'margin-top:8px' }, bouton, fichier, jauge),
    etat,
  );

  dessiner();
  return { bloc, valeur: () => [...images], ajouter, resume };
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
  input.addEventListener('input', () => ajuste(input));

  const bloc = el('div', { class: 'champ' },
    el('label', { class: 'small muted' }, libelle),
    input,
  );

  return { bloc, input, ajuste: () => ajuste(input) };
}

/**
 * La zone de saisie épouse son contenu.
 *
 * Une hauteur fixe impose un défilement **dans** le champ, imbriqué dans celui
 * de la colonne : sur un verso long, on passe son temps à faire glisser la
 * mauvaise des deux barres, et on perd de vue le reste du formulaire. En
 * laissant la zone grandir, il ne reste qu'une seule surface qui défile — la
 * colonne — et l'aperçu, qui a désormais la sienne, ne bouge plus avec.
 *
 * `height: auto` d'abord : sans cette remise à zéro, `scrollHeight` ne
 * redescend jamais et la zone ne peut que grandir, même après un effacement.
 *
 * `+ 2` : `scrollHeight` compte le remplissage mais pas les bordures, et il
 * manquerait deux pixels — assez pour qu'une barre de défilement apparaisse.
 */
function ajuste(input) {
  input.style.height = 'auto';
  input.style.height = `${input.scrollHeight + 2}px`;
}

/**
 * Fait défiler la colonne du formulaire jusqu'à la ligne `at` d'une zone.
 *
 * `focus()` ne suffit pas : la zone épouse son contenu (`ajuste`), elle n'a donc
 * pas de défilement propre, et le navigateur se contente de montrer son **haut**
 * — sur un verso long, le curseur reste hors champ.
 *
 * La ligne est estimée en comptant les retours à la ligne avant `at`. Les lignes
 * repliées par la largeur ne sont pas comptées : l'estimation tombe un peu haut
 * sur un long paragraphe, jamais en dessous. On vise le tiers haut de la
 * colonne, ce qui absorbe l'écart.
 */
function montreCurseur(zone, at) {
  const colonne = zone.closest('.editeur-champs');
  if (!colonne) return;
  const style = getComputedStyle(zone);
  const ligne = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
  const rang = zone.value.slice(0, at).split('\n').length - 1;
  const y = zone.getBoundingClientRect().top + parseFloat(style.paddingTop) + rang * ligne;
  const vue = colonne.getBoundingClientRect();
  colonne.scrollTop += y - vue.top - vue.height / 3;
}
