// version.js — le numéro de version affiché dans l'app.
//
// Il existe pour une raison précise : GitHub Pages sert avec `max-age=600`, donc
// un navigateur peut afficher une version vieille de dix minutes. Sans repère
// visible, impossible de distinguer « la fonctionnalité est cassée » de « je
// regarde du vieux code » — on a perdu du temps là-dessus, deux fois.
//
// C'est aussi ce fichier que `app.js` relit sur le réseau pour détecter qu'il
// exécute du code périmé et proposer un rechargement. D'où l'unicité : deux
// fichiers de version finiraient par diverger, et le détecteur mentirait.
//
// **À incrémenter à chaque déploiement.** C'est le seul endroit à toucher.

export const VERSION = '2026-09-04.1';
