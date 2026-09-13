// raccourcis.js — les raccourcis clavier d'un écran.
//
// Deux aujourd'hui :
//   - **Ctrl+S enregistre sans quitter l'écran**. Le bouton *Enregistrer*
//     enregistre **et** part ; les deux gestes coexistent, et c'est voulu
//     (docs/decisions.md, « Enregistrer sans quitter »).
//   - **Ctrl+V colle une image**, où que soit le focus (docs/decisions.md,
//     « Coller une image dans une carte »).
//
// Frontière : ce fichier touche au clavier et au presse-papiers, rien d'autre.
// Ni store, ni DOM construit, ni vue. Il ne sait pas ce qu'il enregistre ni où
// vont les images — on lui passe l'action.

/**
 * Pose un écouteur sur `document` pour la durée de vie de l'écran `root`.
 *
 * L'écouteur vit sur `document` et non sur `root` : le geste doit marcher même
 * quand le focus a quitté le formulaire — après un clic sur l'aperçu, ou dans le
 * vide. Un écouteur posé sur `root` ne verrait alors rien remonter.
 *
 * **Nettoyage.** La coque n'offre aucun point de démontage : une vue est montée,
 * puis remplacée, sans jamais être prévenue. L'écouteur se retire donc lui-même
 * dès qu'il constate que son écran a quitté la page. Il ne peut pas le tester
 * tout de suite — au moment du montage, `root` est encore détaché, il n'est
 * attaché qu'à la toute fin du rendu (app.js) — d'où le drapeau `montre` : on
 * n'abandonne qu'un écran qui a été affiché *puis* remplacé.
 *
 * Le contrôle tourne à **chaque** événement, avant même de le regarder : les
 * écouteurs orphelins disparaissent donc au premier événement qui suit une
 * navigation, et non seulement au prochain geste qui les concerne.
 */
function ecouteEcran(root, type, gestionnaire) {
  let montre = false;

  function surEvenement(ev) {
    if (root.isConnected) {
      montre = true;
    } else if (montre) {
      document.removeEventListener(type, surEvenement);
      return;
    } else {
      return;                                   // pas encore affiché : on ignore
    }
    gestionnaire(ev);
  }

  document.addEventListener(type, surEvenement);
}

/**
 * Pose Ctrl+S (Cmd+S sur Mac) sur l'écran dont `root` est la racine.
 *
 * `preventDefault` est indispensable : sans lui, le navigateur ouvre son
 * « Enregistrer la page sous… », ce qui est exactement le contraire du but.
 *
 * @param {HTMLElement} root  la racine de l'écran (le `ctx.root` de la vue)
 * @param {() => void} action ce qu'enregistrer veut dire pour cet écran
 */
export function surEnregistrement(root, action) {
  ecouteEcran(root, 'keydown', (ev) => {
    // `ev.key` vaut 's' ou 'S' selon la majuscule, et le raccourci doit marcher
    // dans les deux cas. Alt exclu : Ctrl+Alt+S est un autre geste, pas le nôtre.
    if (ev.key.toLowerCase() !== 's' || ev.altKey) return;
    if (!ev.ctrlKey && !ev.metaKey) return;

    ev.preventDefault();
    action();
  });
}

/**
 * Capte les images collées (Ctrl+V, ou « Coller » du menu) sur l'écran `root`.
 *
 * On écoute `paste` et non `keydown` : c'est le seul événement qui donne accès
 * au contenu du presse-papiers, et il couvre aussi le collage à la souris.
 *
 * **Règle de priorité — le texte gagne dans une zone de saisie.** Copier depuis
 * Word, OneNote ou une page web met **à la fois** du texte et une image (le
 * rendu du passage) dans le presse-papiers. Si l'image gagnait, coller un
 * paragraphe dans le verso y ajouterait en plus une image fantôme. Donc :
 *   - du texte, et le focus dans un champ de saisie → on ne touche à rien, le
 *     navigateur colle le texte comme d'habitude ;
 *   - sinon, s'il y a des images → on les prend, et le navigateur ne colle rien.
 * Le cas nominal — une capture d'écran (Win+Maj+S) ne met **que** une image —
 * marche donc où que soit le focus, verso compris.
 *
 * @param {HTMLElement} root  la racine de l'écran
 * @param {(files: File[]) => void} action ce qu'on fait des images collées
 */
export function surCollageImages(root, action) {
  ecouteEcran(root, 'paste', (ev) => {
    const donnees = ev.clipboardData;
    if (!donnees) return;

    const cible = document.activeElement;
    const enSaisie = cible && (cible.tagName === 'TEXTAREA' || cible.tagName === 'INPUT');
    if (enSaisie && donnees.getData('text/plain')) return;

    const images = [...donnees.files].filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;

    ev.preventDefault();
    action(images);
  });
}
