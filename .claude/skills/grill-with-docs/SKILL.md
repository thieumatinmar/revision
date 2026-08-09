---
name: grill-with-docs
description: Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions.
---

<what-to-do>

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing.

If a question can be answered by exploring the codebase, explore the codebase instead.

</what-to-do>

<supporting-info>

## Domain awareness

During codebase exploration, also look for existing documentation:

### File structure

This project keeps two documentation axes, both at the repo root:

```
/
├── CONTEXT.md          ← glossaire pur (langage du domaine)
├── docs/
│   └── decisions.md    ← journal des décisions d'architecture (fichier UNIQUE)
└── ...
```

- `CONTEXT.md` — glossaire du domaine, zéro implémentation. Format : [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).
- `docs/decisions.md` — **toutes** les décisions structurantes, dans un seul
  fichier (pas un fichier par décision, pas de `docs/adr/`). Voir le seuil et le
  format plus bas.

Create files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up — capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Tracer les décisions dans `docs/decisions.md`

Quand un choix structurant se cristallise pendant le grilling, ajoute une entrée
dans `docs/decisions.md` (**fichier unique** — jamais un `docs/adr/NNNN.md`).

Seuil : n'écris une entrée que pour un choix qu'on pourrait *regretter ou
re-questionner* plus tard. Typiquement quand au moins l'un de ces points tient :

1. **Dur à inverser** — changer d'avis coûte cher plus tard.
2. **Surprenant sans contexte** — un futur lecteur se demandera « pourquoi comme ça ? ».
3. **Vrai arbitrage** — il y avait de vraies alternatives, on en a choisi une.

Si rien de tout ça ne tient, n'écris pas d'entrée — c'est un micro-choix.

Format d'une entrée : `## Titre` + **Choix** / **Alternative écartée** / **Raison**.

- **Raison** : toujours présente (le *pourquoi* que le code ne dit pas).
- **Alternative écartée** : seulement si le rejet est non-évident ; sinon saute
  la ligne (pas d'homme de paille).
- **Longueur libre** : deux lignes ou un pavé selon l'arbitrage.

</supporting-info>
