// views/bibliotheque.js — le rayon : chercher, filtrer, parcourir, ouvrir.
//
// **Un seul rayon**, les deux espèces mélangées et triées par titre. Chercher
// « Baire » doit ramener le théorème *et* la définition d'espace de Baire côte
// à côte ; deux sections obligeraient à parcourir deux fois pour une seule
// question. Le filtre par espèce est là pour le geste inverse — « je relis mes
// définitions d'algèbre » — et il est explicite, donc sans surprise.
//
// Ni chapitre ni ordre à la main : c'est la recherche qui sert de rangement
// (docs/decisions.md, « La bibliothèque de théorèmes »).
//
// La recherche et le filtre agissent sans repasser par le routeur — ils doivent
// répondre à chaque frappe, et rien n'a changé en base entre deux caractères
// tapés. Le filtre textuel lui-même vit dans `recherche.js` : une vue orchestre,
// elle ne calcule pas.

import { el, fill } from '../dom.js';
import { render as renderMath, excerpt, stripMath } from '../mathtext.js';
import { listEntries, kindOf, THEOREM, DEFINITION } from '../store.js';
import { ESPECES, SEGMENTS } from '../entree.js';
import { filtre } from '../recherche.js';

export async function render(ctx) {
  const entries = await listEntries();

  ctx.setTitle('Bibliothèque');
  ctx.setHeader(
    el('a', { class: 'btn btn-sm btn-ghost', href: '#/' }, '‹'),
    [
      el('a', {
        class: 'btn btn-sm btn-primary',
        href: `#/entree/nouveau/${SEGMENTS[THEOREM]}`,
        title: 'Nouveau théorème',
      }, '+ Th.'),
      el('a', {
        class: 'btn btn-sm btn-primary',
        href: `#/entree/nouveau/${SEGMENTS[DEFINITION]}`,
        title: 'Nouvelle définition',
        style: 'margin-left:6px',
      }, '+ Déf.'),
    ],
  );

  let query = '';
  /** Espèce affichée seule, ou `null` pour les deux. */
  let seulement = null;

  const search = el('input', {
    type: 'search',
    placeholder: 'Chercher un titre, un mot de l’énoncé, un outil de la preuve…',
    on: { input: (e) => { query = e.target.value; paint(); } },
  });

  const filtres = el('div', { class: 'filtres' });
  const list = el('div');

  // `fill` et non `ctx.root.append` : le `append` natif transforme un enfant
  // `false` en un nœud de texte « false ». Sur une bibliothèque vide, les deux
  // conditions ci-dessous écrivaient littéralement « falsefalse » à l'écran.
  fill(ctx.root, entries.length > 0 && filtres, entries.length > 0 && search, list);

  /**
   * Les boutons d'espèce, avec leur compte.
   *
   * Le compte est celui de la **bibliothèque entière**, pas du résultat de
   * recherche : c'est un repère stable (« j'ai 12 définitions »), alors qu'un
   * compte qui bouge à chaque frappe se lit comme un résultat et sème le doute.
   */
  function dessineFiltres() {
    const compte = (kind) => entries.filter((e) => kindOf(e) === kind).length;

    const bouton = (kind, libelle) => el('button', {
      class: `btn btn-sm${seulement === kind ? ' btn-primary' : ''}`,
      on: { click: () => { seulement = kind; paint(); } },
    }, libelle);

    fill(filtres,
      bouton(null, `Tout ${entries.length}`),
      bouton(THEOREM, `${ESPECES[THEOREM].pastille} ${compte(THEOREM)}`),
      bouton(DEFINITION, `${ESPECES[DEFINITION].pastille} ${compte(DEFINITION)}`),
    );
  }

  function paint() {
    dessineFiltres();

    // L'espèce d'abord, le texte ensuite : `filtre` est pur et ne connaît pas
    // les espèces — c'est la vue qui compose les deux, comme elle compose
    // toujours ce que les modules purs lui rendent.
    const retenues = seulement ? entries.filter((e) => kindOf(e) === seulement) : entries;
    const vus = filtre(retenues, query);

    if (vus.length === 0) {
      fill(list, el('p', { class: 'empty' }, messageVide(),
        el('br'),
        entries.length === 0 && el('a', {
          class: 'btn btn-primary',
          href: `#/entree/nouveau/${SEGMENTS[THEOREM]}`,
          style: 'margin-top:16px',
        }, 'Ajouter la première'),
      ));
      return;
    }

    fill(list,
      el('p', { class: 'small muted' }, `${vus.length} entrée${vus.length > 1 ? 's' : ''}`
        + (query ? ` trouvée${vus.length > 1 ? 's' : ''}` : '')),
      el('ul', { class: 'list' }, vus.map(ligne)),
    );
  }

  /** Dire *pourquoi* la liste est vide : sans ça, on cherche la panne. */
  function messageVide() {
    if (entries.length === 0) return 'La bibliothèque est vide.';
    if (query) return 'Aucune entrée ne correspond.';
    return `Aucune ${ESPECES[seulement].nom.toLowerCase()} pour l’instant.`;
  }

  /**
   * Une ligne : la pastille d'espèce, le titre, et le début du corps en gris.
   *
   * Le corps n'y est **pas composé** — une formule rendue déforme la hauteur des
   * lignes, et une liste qui ondule ne se balaye plus. On montre donc la source
   * dépouillée de ses `$`, tronquée : de quoi reconnaître, pas de quoi lire.
   * Pour lire, on ouvre.
   *
   * La pastille est en gris et de largeur fixe : elle doit se voir sans attirer
   * l'œil avant le titre, et ne pas décaler les titres les uns par rapport aux
   * autres.
   */
  function ligne(entry) {
    const mots = ESPECES[kindOf(entry)];
    return el('li', {},
      el('a', {
        class: 'grow',
        href: `#/entree/${entry.id}`,
        style: 'text-decoration:none;color:inherit',
      },
        el('div', { class: 'row' },
          el('span', { class: 'pastille-espece' }, mots.pastille),
          renderMath(el('div', { class: 'name' }), excerpt(entry.title || entry.statement)),
        ),
        el('div', { class: 'small muted' }, excerpt(stripMath(entry.statement), 70)),
      ),
    );
  }

  paint();
}
