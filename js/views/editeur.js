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
//
// En modification, ‹ et › (ou Alt+↑ / Alt+↓) passent à la **voisine** — la
// carte d'avant ou d'après dans sa catégorie — en enregistrant d'abord ce qui a
// été modifié (docs/decisions.md, « Passer d'une carte à sa voisine »).
//
// Échap ramène à la liste, selon la même règle : ce qui a été modifié est
// enregistré d'abord. Seul *Annuler* jette (docs/decisions.md, « Quitter
// l'éditeur sans perdre la saisie »).
//
// ⧉ duplique la carte et ouvre la copie, toujours après avoir enregistré ce qui
// a été modifié (docs/decisions.md, « Dupliquer une carte »).

import { el, fill } from '../dom.js';
import { faceCarte } from '../carte.js';
import { excerpt, stripMath } from '../mathtext.js';
import {
  getCard, saveCard, duplicateCard, deleteCard, listChapters, flattenChapters, listCards,
} from '../store.js';
import { surEnregistrement, surCollageImages, surNavigation, surSortie } from '../raccourcis.js';
import { depuisFichier, poidsTotal, formatePoids, BUDGET } from '../images.js';

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
  // Les catégories dans l'ordre de l'arbre : chaque chapitre suivi de ses
  // sous-chapitres, pour que le sélecteur se lise comme l'accueil.
  const arbre = await listChapters();
  const categories = flattenChapters(arbre);

  const card = creation
    ? { categoryId: param, title: '', front: '', hint: '', back: '', note: '', images: [] }
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

  // Les voisines : la catégorie de la carte, dans l'ordre de l'écran *Cartes*
  // (rangées, puis non rangées — c'est l'ordre que rend `listCards`). Lue ici,
  // une fois, puis figée : si l'on change le chapitre de la carte avant de
  // passer, on continue la liste qu'on relisait, pas celle où la carte arrive.
  // Pas de voisines en création — la carte neuve n'est pas dans la liste.
  const liste = creation ? [] : await listCards(card.categoryId);
  const rang = liste.findIndex((c) => c.id === card.id);
  const precedente = rang > 0 ? liste[rang - 1] : null;
  const suivante = rang >= 0 && rang < liste.length - 1 ? liste[rang + 1] : null;

  // La position dit où l'on en est du parcours, et qu'on approche de la fin.
  // « Modifier » ne reste que pour une carte absente de sa propre liste — qui ne
  // devrait pas exister, mais un titre faux serait pire qu'un titre vague.
  ctx.setTitle(creation ? 'Nouvelle carte'
    : rang >= 0 ? `Carte ${rang + 1} / ${liste.length}` : 'Modifier');

  // La bascule ne sert que sous 900 px : au-delà, les deux colonnes sont là et
  // le bouton ne veut plus rien dire — le CSS le masque.
  const bascule = el('button', {
    class: 'btn btn-sm bascule-apercu',
    title: 'Voir la carte montée',
    on: { click: () => basculer(mode === 'edition' ? 'apercu' : 'edition') },
  }, 'Aperçu');

  // Copier le lien : la syntaxe prête à coller dans une autre carte
  // (docs/decisions.md, « Liens d'une carte à une autre »). Sans id, il n'y a
  // rien à désigner : le bouton attend le premier enregistrement.
  const copier = el('button', {
    class: 'btn btn-sm',
    title: 'Copier un lien vers cette carte, à coller dans une autre',
    on: { click: () => copierLien() },
  }, '🔗 Lien');

  // Dupliquer : même signe que sur la ligne de la liste, puisque c'est le même
  // geste. Même attente que le lien — on ne copie pas une carte qui n'existe pas.
  const dupliquerBouton = el('button', {
    class: 'btn btn-sm',
    title: 'Dupliquer cette carte et ouvrir la copie',
    on: { click: () => dupliquer() },
  }, '⧉');

  ctx.setHeader(retourHaut,
    el('span', { class: 'entete-actions' }, dupliquerBouton, copier, bascule));

  // --- Champs -----------------------------------------------------------------
  // Une seule liste : le chapitre reste choisissable, ses sous-chapitres sont
  // indentés sous lui. L'indentation passe par le texte de l'option — le CSS sur
  // `<option>` est ignoré par la plupart des navigateurs mobiles. Même libellé
  // que le sélecteur « ⇄ » de views/cartes.js : à changer ensemble.
  const categorie = el('select', {},
    categories.map((c) => el('option', { value: c.id, selected: c.id === card.categoryId },
      (c.depth === 1 ? '   └ ' : '') + c.name)),
  );

  const titre = champTitre(card.title);

  const recto = champ('Recto — ce qui est demandé', card.front,
    'Ex. : Inégalité de Bienaymé–Tchebychev : énoncé et hypothèses ?');
  const verso = champ('Verso (facultatif) — le complément, lu après', card.back,
    'Ex. : $$\\P(|X-\\E[X]|\\ge\\varepsilon)\\le \\V(X)/\\varepsilon^2$$');

  // --- Le point de saisie ----------------------------------------------------
  // On retient le dernier point de saisie — champ et position — dans le recto
  // ou le verso. Il dit où l'on écrit, donc quel bloc de la carte montée doit
  // être sous les yeux dans l'aperçu. D'où `input` dans la liste — taper
  // déplace le curseur autant que le déplacer.
  let point = null;
  [recto, verso].forEach(({ input }) => {
    const noter = () => { point = { input, at: input.selectionStart }; suit(); };
    ['focus', 'click', 'keyup', 'input'].forEach((ev) => input.addEventListener(ev, noter));
  });

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

  // --- Les deux blocs ---------------------------------------------------------
  const formulaire = el('div', { class: 'editeur-champs' },
    el('label', { class: 'small muted' }, 'Chapitre'),
    categorie,
    titre.bloc,
    recto.bloc,
    indication && indication.bloc,
    verso.bloc,
    images.bloc,
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

  /** 🔗 et ⧉ désignent la carte en base : sans `id`, ils attendent. */
  function visibiliteLien() {
    copier.style.display = card.id ? '' : 'none';
    dupliquerBouton.style.display = card.id ? '' : 'none';
  }

  /**
   * Met `[libellé](#/carte/ID)` dans le presse-papiers. Le libellé est le titre
   * saisi, à défaut le début du recto **sans ses `$`** — une formule coupée au
   * milieu ne se rendrait pas. Les crochets en sont retirés : ils fermeraient le
   * libellé avant l'heure, et le lien ne serait plus reconnu.
   */
  async function copierLien() {
    const brut = titre.input.value.trim() || excerpt(stripMath(recto.input.value), 60);
    const libelle = brut.replace(/[[\]]/g, '').trim() || 'cette carte';
    const lien = `[${libelle}](#/carte/${card.id})`;
    try {
      await navigator.clipboard.writeText(lien);
      temoin.style.color = '';
      temoin.textContent = 'Lien copié : ' + lien;
    } catch (err) {
      // Presse-papiers refusé (contexte non sécurisé, permission) : on montre le
      // lien pour qu'il reste copiable à la main.
      temoin.style.color = '#e8695f';
      temoin.textContent = 'Copie impossible — à copier à la main : ' + lien;
    }
  }

  // Le témoin de l'enregistrement sans quitter. Il vit hors de la barre — dont le
  // CSS étire chaque enfant à parts égales — et hors du formulaire, masqué en
  // aperçu sur écran étroit. Sans lui, Ctrl+S serait un geste sans réponse.
  const temoin = el('p', { class: 'temoin small muted' });

  // La barre d'actions vit **hors** de la grille : sur écran étroit en aperçu, le
  // formulaire est masqué, et une barre posée dedans emporterait *Enregistrer*
  // avec lui — or le geste réel finit là : je tape, je vérifie, j'enregistre.
  //
  // ‹ et › y sont à côté d'*Enregistrer* parce que le geste est le même —
  // enregistrer, puis partir. Au bout de la liste, le bouton est grisé et non
  // retiré : la barre garde sa forme d'une carte à l'autre, et le pouce ne
  // tombe pas sur autre chose.
  const boutonVoisine = (voisine, signe, libelle) => el('button', {
    class: 'nav-voisine',
    title: voisine ? libelle : 'Pas d’autre carte dans cette catégorie',
    disabled: !voisine,
    on: { click: () => passer(voisine) },
  }, signe);

  fill(ctx.root,
    grille,
    el('div', { class: 'actions' },
      el('button', { class: 'btn-primary', on: { click: () => enregistrer() } }, 'Enregistrer'),
      retourBas,
      !creation && boutonVoisine(precedente, '‹', 'Carte précédente — Alt+↑'),
      !creation && boutonVoisine(suivante, '›', 'Carte suivante — Alt+↓'),
    ),
    temoin,
    zoneSuppression,
  );

  // Ctrl+S enregistre et **reste**. Le bouton, lui, enregistre et part : les deux
  // gestes ne sont pas le même, et le raccourci sert précisément à ne pas devoir
  // choisir entre « je sécurise ce que j'ai tapé » et « j'ai fini ».
  surEnregistrement(ctx.root, () => enregistrer({ rester: true }));

  if (!creation) {
    surNavigation(ctx.root, {
      precedente: () => passer(precedente),
      suivante: () => passer(suivante),
    });
  }

  // Échap ramène à la liste, création comprise. Il enregistre d'abord, comme ‹
  // et › — jamais il ne jette comme *Annuler* : une touche frappée par réflexe
  // ne doit pas pouvoir effacer dix minutes de saisie.
  surSortie(ctx.root, () => sortir());

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
      faceCarte(valeurs(), { hint: true, back: true }),
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
   *   - sur un bouton ou un lien — ils gardent leur rôle ;
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
  visibiliteLien();

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
    };
  }

  /**
   * La carte du formulaire, sous une forme comparable. Deux signatures égales,
   * c'est rien à enregistrer. On compare des `valeurs()` à des `valeurs()` — et
   * non à la carte lue en base — pour que les normalisations (titre rogné,
   * encart éteint écrit vide) soient les mêmes des deux côtés.
   */
  const signature = () => JSON.stringify(valeurs());

  /** Ce qui est en base, vu par le formulaire : au montage, puis à chaque écriture. */
  let enBase = signature();

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
   * @returns {Promise<boolean>} vrai si la carte est en base — c'est ce que
   *   `passer` attend avant de quitter l'écran.
   */
  async function enregistrer({ rester = false } = {}) {
    if (enCours) return false;

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
      return false;
    }

    enCours = true;
    erreur.textContent = '';
    temoin.style.color = '';
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
      enBase = signature();

      if (!rester) {
        location.hash = retour;
        return true;
      }

      // L'adresse cessait de dire la vérité : elle annonçait une création alors
      // que la carte existe. `replaceState` la corrige **sans** déclencher
      // `hashchange`, donc sans relancer le rendu et sans perdre la saisie en
      // cours — un rechargement retrouve désormais ce qui est en base.
      if (location.hash !== `#/carte/${card.id}`) {
        history.replaceState(null, '', `#/carte/${card.id}`);
      }
      visibiliteSuppression();
      visibiliteLien();
      temoin.textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-FR');
      return true;
    } catch (err) {
      basculer('edition');
      erreur.textContent = 'Enregistrement impossible : ' + err.message;
      temoin.textContent = '';
      return false;
    } finally {
      enCours = false;
    }
  }

  /**
   * La règle commune aux sorties qui ne jettent rien (‹, ›, Échap, ⧉) : ce qui a
   * été modifié est enregistré d'abord. Rien de modifié, rien d'écrit — un
   * parcours en simple lecture ne touche pas la base.
   *
   * @returns {Promise<boolean>} vrai si l'on peut partir. Faux si l'écriture a
   *   échoué (recto vide, réseau) : on reste, `enregistrer` a déjà dit pourquoi.
   */
  async function aJour() {
    if (signature() === enBase) return true;
    return enregistrer({ rester: true });
  }

  /**
   * Passe à une voisine, après `aJour` — le geste réel est « je relis, je
   * corrige, je passe », et une confirmation à chaque carte corrigée casserait
   * ce rythme.
   *
   * `location.replace` et non `location.hash = …` : le passage **remplace**
   * l'entrée d'historique. Le retour du navigateur ramène donc à la liste, comme
   * *Annuler*, au lieu de remonter une à une les vingt cartes parcourues.
   */
  async function passer(voisine) {
    if (!voisine || enCours) return;
    if (!(await aJour())) return;
    location.replace(`#/carte/${voisine.id}`);
  }

  /**
   * Revient à la liste du chapitre (Échap), après `aJour`. C'est *Enregistrer*
   * sans l'écriture inutile, pas *Annuler*.
   *
   * `retour` est lu **après** l'écriture : elle a pu changer le chapitre de la
   * carte, et c'est dans le nouveau qu'on veut la retrouver. `location.hash`,
   * comme les deux boutons du bas qui mènent au même endroit.
   */
  async function sortir() {
    if (enCours) return;
    if (!(await aJour())) return;
    location.hash = retour;
  }

  /**
   * Duplique la carte, puis ouvre la copie. La place et la marque du titre sont
   * décidées par le store (`duplicateCard`), comme depuis la liste.
   *
   * `aJour` d'abord : `duplicateCard` relit l'original **en base**, et sans cela
   * la copie porterait l'ancienne version pendant que l'écran montre la
   * nouvelle. Si l'écriture échoue, pas de copie.
   *
   * `enCours` couvre aussi la copie : un Alt+↓ pendant l'écriture partirait vers
   * la voisine, puis la copie arrivée ramènerait ailleurs.
   *
   * `location.replace`, comme pour les voisines : le retour du navigateur ramène
   * à la liste. L'original reste à portée de ‹ — la copie est rangée juste après
   * lui.
   */
  async function dupliquer() {
    if (!card.id || enCours) return;
    dupliquerBouton.disabled = true;
    if (!(await aJour())) {
      dupliquerBouton.disabled = false;
      return;
    }

    enCours = true;
    temoin.style.color = '';
    temoin.textContent = 'Duplication…';
    try {
      const copie = await duplicateCard(card.id);
      location.replace(`#/carte/${copie.id}`);
    } catch (err) {
      temoin.style.color = '#e8695f';
      temoin.textContent = 'Duplication impossible : ' + err.message;
      dupliquerBouton.disabled = false;
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
