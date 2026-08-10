// images.js — préparer une image pour qu'elle tienne dans une carte.
//
// Les images sont stockées **dans le document Firestore**, encodées en texte
// (data URL), et non dans Firebase Storage. Conséquences, dans les deux sens :
//
//   + rien à activer, aucune règle de plus, aucun compte de facturation ;
//   + l'image se synchronise et se met en cache avec sa carte, donc elle est
//     visible hors ligne sans une ligne de code supplémentaire ;
//   − un document Firestore est plafonné à **1 Mo**. D'où tout ce fichier :
//     sans redimensionnement, une seule photo de téléphone dépasse la limite et
//     l'enregistrement échoue.
//
// Module PUR côté logique : il ne connaît ni le DOM de l'app, ni le store.

/** Côté le plus long, en pixels, après réduction. Au-delà, on ne gagne rien à
 *  l'écran d'un téléphone et on paye en octets. */
const COTE_MAX = 1400;

/** Budget total des images d'une carte, en octets de texte encodé.
 *  Laisse largement la place au reste du document sous la limite de 1 Mo. */
export const BUDGET = 700 * 1024;

/** Poids réel d'une data URL, en octets (c'est du texte : 1 caractère = 1 octet). */
export const poids = (dataUrl) => (dataUrl ? dataUrl.length : 0);

/** Poids total d'une liste d'images. */
export const poidsTotal = (images) => (images || []).reduce((s, i) => s + poids(i), 0);

/** Formate un nombre d'octets pour l'affichage. */
export function formatePoids(octets) {
  if (octets < 1024) return octets + ' o';
  if (octets < 1024 * 1024) return Math.round(octets / 1024) + ' Ko';
  return (octets / (1024 * 1024)).toFixed(1) + ' Mo';
}

/**
 * Le meilleur format que sait produire ce navigateur.
 *
 * WebP d'abord : à qualité égale il pèse nettement moins que JPEG, et il gère
 * les aplats d'un schéma sans les baver comme le fait JPEG sur les traits fins —
 * ce qui compte quand on photographie une figure ou une démonstration écrite.
 */
function meilleurFormat() {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  return c.toDataURL('image/webp').startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg';
}

/** Charge un fichier en objet Image, pour pouvoir le dessiner sur un canevas. */
function chargeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Fichier image illisible.')); };
    img.src = url;
  });
}

/**
 * Réduit une image et la renvoie en data URL.
 *
 * On baisse la qualité par paliers tant que le résultat dépasse `cible`. Réduire
 * la qualité coûte moins cher, visuellement, que réduire encore les dimensions :
 * sur un schéma, perdre des pixels rend le texte illisible, alors qu'un peu de
 * compression reste lisible.
 */
export async function depuisFichier(file, cible = 250 * 1024) {
  if (!file.type.startsWith('image/')) throw new Error("Ce fichier n'est pas une image.");

  const img = await chargeImage(file);
  const facteur = Math.min(1, COTE_MAX / Math.max(img.width, img.height));
  const largeur = Math.round(img.width * facteur);
  const hauteur = Math.round(img.height * facteur);

  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // Fond blanc : une image transparente virerait au noir en JPEG, et un schéma
  // scanné avec fond transparent deviendrait illisible en thème sombre.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, largeur, hauteur);
  ctx.drawImage(img, 0, 0, largeur, hauteur);

  const format = meilleurFormat();
  let resultat = canvas.toDataURL(format, 0.85);
  for (const q of [0.75, 0.65, 0.55, 0.45]) {
    if (poids(resultat) <= cible) break;
    resultat = canvas.toDataURL(format, q);
  }
  return resultat;
}
