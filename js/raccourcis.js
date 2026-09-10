// raccourcis.js — les raccourcis clavier d'un écran.
//
// Un seul aujourd'hui : **Ctrl+S enregistre sans quitter l'écran**. Le bouton
// *Enregistrer* enregistre **et** part ; les deux gestes coexistent, et c'est
// voulu (docs/decisions.md, « Enregistrer sans quitter »).
//
// Frontière : ce fichier touche au clavier et rien d'autre. Ni store, ni DOM
// construit, ni vue. Il ne sait pas ce qu'il enregistre — on lui passe l'action.

/**
 * Pose Ctrl+S (Cmd+S sur Mac) sur l'écran dont `root` est la racine.
 *
 * L'écouteur vit sur `document` et non sur `root` : le geste doit marcher même
 * quand le focus a quitté le formulaire — après un clic sur l'aperçu, ou dans le
 * vide. Un écouteur posé sur `root` ne verrait alors rien remonter.
 *
 * `preventDefault` est indispensable : sans lui, le navigateur ouvre son
 * « Enregistrer la page sous… », ce qui est exactement le contraire du but.
 *
 * **Nettoyage.** La coque n'offre aucun point de démontage : une vue est montée,
 * puis remplacée, sans jamais être prévenue. L'écouteur se retire donc lui-même
 * dès qu'il constate que son écran a quitté la page. Il ne peut pas le tester
 * tout de suite — au moment du montage, `root` est encore détaché, il n'est
 * attaché qu'à la toute fin du rendu (app.js) — d'où le drapeau `montre` : on
 * n'abandonne qu'un écran qui a été affiché *puis* remplacé.
 *
 * Le contrôle tourne à **chaque** frappe, avant même de regarder la touche : les
 * écouteurs orphelins disparaissent donc à la première touche pressée après une
 * navigation, et non seulement au prochain Ctrl+S.
 *
 * @param {HTMLElement} root  la racine de l'écran (le `ctx.root` de la vue)
 * @param {() => void} action ce qu'enregistrer veut dire pour cet écran
 */
export function surEnregistrement(root, action) {
  let montre = false;

  function auClavier(ev) {
    if (root.isConnected) {
      montre = true;
    } else if (montre) {
      document.removeEventListener('keydown', auClavier);
      return;
    } else {
      return;                                   // pas encore affiché : on ignore
    }

    // `ev.key` vaut 's' ou 'S' selon la majuscule, et le raccourci doit marcher
    // dans les deux cas. Alt exclu : Ctrl+Alt+S est un autre geste, pas le nôtre.
    if (ev.key.toLowerCase() !== 's' || ev.altKey) return;
    if (!ev.ctrlKey && !ev.metaKey) return;

    ev.preventDefault();
    action();
  }

  document.addEventListener('keydown', auClavier);
}
