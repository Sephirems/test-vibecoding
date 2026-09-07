# Contexte technique du repo

Extension Chrome MV3 qui résume la page courante avec Claude (Anthropic) ou
Gemini (Google), au choix de l'utilisateur. Usage personnel, clés API de
l'utilisateur, **aucun backend**.

## Commandes

- `npm run build` — bundle vers `extension/dist/` (obligatoire après toute
  modification de `extension/src/`)
- `npm run watch` — build en continu
- `npm test` — `node --test`, logique pure uniquement
- `npm run icons` — régénère les PNG

## Contraintes à ne pas casser

- **`extension/src/extract.js` doit rester autonome.** Chrome sérialise cette
  fonction en texte source pour l'injecter : aucun import, aucune fermeture,
  aucune référence hors de son propre corps. Vérifier après build avec
  `grep -A 20 "function extractArticleFromPage" extension/dist/background.js`.
- **Les clés API ne sortent jamais de `chrome.storage.local`.** Aucune valeur
  en dur, aucun log de clé, aucun fichier de config commité.
- **`lib/providers/catalog.js` ne doit importer aucun SDK.** C'est ce qui garde
  le bundle de la page d'options à 5 Ko au lieu de 513. L'UI importe
  `catalog.js`, le service worker seul importe `providers/index.js`.
- **Clé Google en en-tête `x-goog-api-key`**, jamais en paramètre `?key=` : un
  secret dans une URL fuite dans les logs et l'historique.
- **Rendu du résumé en `textContent` uniquement.** Le texte vient d'une page
  web arbitraire ; `innerHTML` ouvrirait une injection.
- **Le service worker MV3 meurt après ~30 s d'inactivité.** Aucun état en
  mémoire entre deux messages ; tout passe par `chrome.storage`.
- **`dangerouslyAllowBrowser: true` est indispensable** dans `background.js` :
  c'est ce qui déclenche l'en-tête `anthropic-dangerous-direct-browser-access`,
  requis pour un appel émis depuis une extension.
- **Ne pas minifier** dans `build.mjs` : la fonction injectée est sérialisée en
  source.

## Conventions

- JavaScript ESM + JSDoc, pas de TypeScript.
- Le service worker orchestre, le panneau n'affiche. Le panneau ne connaît ni
  l'API ni la clé — il envoie un message et rend la réponse.
- Toute erreur affichable passe par `lib/errors.js` et porte un `code` ; les
  messages sont en français et disent quoi faire.
- Une seule dépendance runtime (`@mozilla/readability`) et le SDK Anthropic.
  Ne pas en ajouter sans accord explicite — Gemini est appelé en `fetch` brut
  pour cette raison.
- Ajouter un fournisseur = une entrée dans `catalog.js` + un module à côté de
  `anthropic.js`, exposant `summarize({ apiKey, system, userContent,
  maxOutputTokens })` et renvoyant du texte brut. Rien d'autre ne bouge.

## Évolution prévue

Passer à un backend (quotas, freemium) ne doit toucher que les modules de
`lib/providers/` : remplacer l'appel direct par un `fetch` vers le serveur.
Le reste du code ignore d'où vient le résumé.
