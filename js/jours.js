// jours.js — les jours de l'interro, sous forme de clé `AAAA-MM-JJ`.
//
// **Pur** : ni DOM, ni réseau, ni stockage. Il ne sait pas ce qu'est une
// interro ; il sait seulement nommer un jour, passer au voisin et l'écrire en
// français.
//
// Pourquoi une clé texte plutôt qu'un objet `Date` : c'est l'identifiant du
// document Firestore (`users/{uid}/daily/2026-10-16`). La tâche du PC l'écrit,
// l'app le relit — les deux doivent tomber sur la même chaîne. Et l'ordre
// alphabétique de ces clés est l'ordre chronologique : `'2026-10-15' <
// '2026-10-16'` compare deux jours sans rien convertir.

const CLE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Deux chiffres, zéro devant : 7 → '07'. */
const deux = (n) => String(n).padStart(2, '0');

/**
 * La clé du jour donné, en **heure locale**.
 *
 * Surtout pas `date.toISOString().slice(0, 10)` : c'est la date UTC, donc la
 * veille entre minuit et 2 h à Paris l'été. La tâche du PC raisonne en jours de
 * Paris ; l'app doit faire pareil, sinon l'interro de 0 h 30 serait celle d'hier.
 */
export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;
}

/** La chaîne est-elle une clé de jour qui existe au calendrier ? */
export function isDayKey(s) {
  const m = CLE.exec(String(s ?? ''));
  if (!m) return false;
  const [, a, mo, j] = m.map(Number);
  const d = new Date(a, mo - 1, j);
  // `new Date(2026, 1, 31)` ne proteste pas, il glisse au 3 mars : on vérifie
  // que rien n'a glissé.
  return d.getFullYear() === a && d.getMonth() === mo - 1 && d.getDate() === j;
}

/** Le jour situé `n` jours après `key` (avant si `n` est négatif). */
export function shiftDay(key, n) {
  const [a, mo, j] = key.split('-').map(Number);
  // Le constructeur absorbe les débordements (32 octobre → 1er novembre), et
  // compte en jours civils : un changement d'heure ne décale rien.
  return dayKey(new Date(a, mo - 1, j + n));
}

/** « vendredi 16 octobre » : le jour tel qu'on le dit. */
export function formatDay(key) {
  const [a, mo, j] = key.split('-').map(Number);
  return new Date(a, mo - 1, j).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}
