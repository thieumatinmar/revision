// version.js — le numéro de version affiché dans l'app.
//
// Il existe pour une raison précise : GitHub Pages sert avec `max-age=600`, donc
// un navigateur peut afficher une version vieille de dix minutes. Sans repère
// visible, impossible de distinguer « la fonctionnalité est cassée » de « je
// regarde du vieux code » — on a perdu du temps là-dessus.
//
// **À incrémenter à chaque déploiement.** C'est le seul endroit à toucher.

export const VERSION = '2026-08-09.1';
