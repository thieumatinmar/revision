// store.js — seule porte d'entrée vers les données.
//
// Aucune vue ne lit ni n'écrit les données autrement qu'à travers ce fichier :
// c'est ce qui permettra de remplacer l'implémentation par Firestore sans
// toucher un seul écran.
//
// ⚠ ÉTAPE 1 — IMPLÉMENTATION TEMPORAIRE, EN MÉMOIRE.
// Rien n'est persisté : tout disparaît au rechargement de la page. Le but est
// de vérifier le tirage et le rendu LaTeX avant d'avoir un projet Firebase.
// Ce qui restera quand Firestore arrivera : la signature des fonctions.
//
// D'où le choix de rendre **toutes** les fonctions asynchrones dès maintenant,
// alors qu'un tableau en mémoire répondrait instantanément. Firestore, lui,
// répondra par des promesses ; si les vues étaient écrites en synchrone
// aujourd'hui, il faudrait toutes les réécrire demain.

/** Les 12 titres du programme officiel 2027 (../ressources/programme_officiel_2027.md). */
const TITRES = [
  'Algèbre linéaire',
  'Groupes',
  'Anneaux, corps et polynômes',
  'Formes bilinéaires et quadratiques',
  'Géométries affine et euclidienne',
  'Analyse à une variable réelle',
  'Analyse à une variable complexe',
  'Topologie',
  'Calcul différentiel',
  'Calcul intégral',
  'Probabilités et statistiques',
  'Méthodes numériques',
];

/**
 * Jeu d'essai — ÉTAPE 1 UNIQUEMENT.
 * Sert à vérifier le rendu LaTeX (macros, formule centrée, erreur de syntaxe)
 * et le tirage. Disparaîtra avec le store en mémoire : la décision actée est
 * qu'aucune carte d'exemple ne soit créée au premier lancement.
 */
const CARTES_ESSAI = [
  {
    front: 'Inégalité de Bienaymé–Tchebychev : énoncé et hypothèses ?',
    hint: 'Partir de l’inégalité de Markov, appliquée à une variable bien choisie.',
    back: 'Si $X$ admet une variance finie, alors pour tout $\\varepsilon>0$ :\n$$\\P(|X-\\E[X]|\\ge\\varepsilon)\\le\\frac{\\V(X)}{\\varepsilon^2}$$',
    note: 'Hypothèse qui mord : variance finie, donc $X\\in L^2$. Appliquer Markov à $(X-\\E X)^2$.',
  },
  {
    front: 'Formule de König–Huygens',
    hint: '',
    back: '$$\\V(X)=\\E[X^2]-\\E[X]^2$$',
    note: 'Se lit comme Pythagore : la variance est la norme du résidu après projection sur les constantes.',
  },
  {
    front: 'Fonction génératrice $G_X$ : définition, et les trois valeurs en $1$ ?',
    hint: 'C’est une espérance. Laquelle, et de quelle fonction de $X$ ?',
    back: '$$G_X(s)=\\E[s^X]=\\sum_{k\\ge 0}\\P(X=k)\\,s^k$$\n$G_X(1)=1$, $G_X\'(1)=\\E[X]$, $G_X\'\'(1)=\\E[X(X-1)]$.',
    note: 'Conclure « donc $X+Y$ suit telle loi » exige le théorème d’unicité : la génératrice caractérise la loi.',
  },
  {
    front: 'Théorème des accroissements finis : hypothèses exactes ?',
    hint: 'Deux hypothèses, sur deux intervalles différents — c’est là que se joue le point.',
    back: '$f$ continue sur $[a,b]$, dérivable sur $]a,b[$. Alors il existe $c\\in\\,]a,b[$ tel que\n$$f(b)-f(a)=f\'(c)\\,(b-a)$$',
    note: 'Preuve : Rolle appliqué à $g(x)=f(x)-f(a)-\\frac{f(b)-f(a)}{b-a}(x-a)$. Faux à valeurs vectorielles.',
  },
];

// ---------------------------------------------------------------- État en mémoire

let nextId = 1;
const uid = () => String(nextId++);

const categories = TITRES.map((name, i) => ({ id: uid(), name, order: i }));

const cards = CARTES_ESSAI.map((c) => ({
  id: uid(),
  // Le jeu d'essai est rangé dans « Probabilités » sauf le dernier (analyse réelle).
  categoryId: c.front.startsWith('Théorème des accroissements')
    ? categories[5].id
    : categories[10].id,
  ...c,
}));

// ---------------------------------------------------------------- Catégories

/** Toutes les catégories, dans l'ordre du programme. */
export async function listCategories() {
  return [...categories].sort((a, b) => a.order - b.order);
}

export async function getCategory(id) {
  return categories.find((c) => c.id === id) || null;
}

/** Nombre de cartes rangées dans une catégorie. */
export async function countCards(categoryId) {
  return cards.filter((c) => c.categoryId === categoryId).length;
}

export async function createCategory(name) {
  const cat = { id: uid(), name, order: categories.length };
  categories.push(cat);
  return cat;
}

export async function renameCategory(id, name) {
  const cat = categories.find((c) => c.id === id);
  if (cat) cat.name = name;
  return cat;
}

/**
 * Supprime une catégorie — refuse si elle contient des cartes.
 * Décision actée : aucune donnée ne disparaît par effet de bord, et il n'existe
 * pas de zone « sans catégorie » où les reléguer.
 */
export async function deleteCategory(id) {
  const n = await countCards(id);
  if (n > 0) throw new Error(`Cette catégorie contient ${n} carte(s). Vide-la ou déplace-les d'abord.`);
  const i = categories.findIndex((c) => c.id === id);
  if (i !== -1) categories.splice(i, 1);
}

// ---------------------------------------------------------------- Cartes

export async function listCards(categoryId) {
  return cards.filter((c) => c.categoryId === categoryId);
}

export async function getCard(id) {
  return cards.find((c) => c.id === id) || null;
}

/** Crée ou met à jour une carte, selon qu'elle porte déjà un identifiant. */
export async function saveCard(card) {
  if (card.id) {
    const i = cards.findIndex((c) => c.id === card.id);
    if (i !== -1) { cards[i] = { ...cards[i], ...card }; return cards[i]; }
  }
  const created = { hint: '', note: '', ...card, id: uid() };
  cards.push(created);
  return created;
}

export async function deleteCard(id) {
  const i = cards.findIndex((c) => c.id === id);
  if (i !== -1) cards.splice(i, 1);
}
