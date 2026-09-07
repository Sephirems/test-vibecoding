# Résumé d'article — extension Chrome

Extension Chrome (Manifest V3) qui résume l'article de la page courante dans un
panneau latéral, avec **Claude (Anthropic) ou Gemini (Google)** au choix.
**Usage personnel** : les clés API sont celles de l'utilisateur, saisies dans les
options, et il n'y a aucun serveur.

## Installation

```bash
npm install
npm run build
```

Puis dans Chrome :

1. `chrome://extensions` → activer **Mode développeur** (en haut à droite).
2. **Charger l'extension non empaquetée** → sélectionner le dossier `extension/`.
3. Clic droit sur l'icône de l'extension → **Options** → choisir le fournisseur,
   coller sa clé (`sk-ant-…` pour Anthropic, `AQ.…` pour Google) →
   **Enregistrer**. Les deux clés peuvent être enregistrées en même temps ; le
   bouton radio décide laquelle sert.
4. Ouvrir un article, cliquer sur l'icône de l'extension : le panneau latéral
   s'ouvre. Cliquer sur **Résumer cette page**.

> Avant le premier résumé, configure un **plafond de dépense** chez le
> fournisseur choisi (Anthropic : console → Billing → Limits ; Google : quotas du
> projet Cloud). C'est le seul garde-fou qui tient même si le code a un bug.

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run build` | Bundle les sources dans `extension/dist/` |
| `npm run watch` | Idem, en surveillance continue |
| `npm test` | Tests unitaires (logique pure, sans navigateur) |
| `npm run icons` | Régénère les icônes PNG |

`extension/dist/` est généré et ignoré par Git : après un clone, `npm install`
puis `npm run build` sont obligatoires avant de charger l'extension. (Sous
Windows PowerShell, lance-les comme deux commandes séparées : `&&` n'y est pas
un opérateur valide.)

## Architecture

```
extension/
  manifest.json          MV3 : side panel, scripting, storage
  sidepanel.html/.css    UI du panneau
  options.html           choix du fournisseur + saisie des clés API
  src/
    background.js        service worker : orchestre tout, seul à voir les clés
    extract.js           fonction injectée dans la page (doit rester autonome)
    readability-inject.js  charge Readability dans la page
    lib/
      pages.js           pages autorisées, normalisation d'URL
      prompt.js          prompt système, contenu utilisateur, parsing
      cache.js           cache des résumés par URL normalisée
      storage.js         fournisseur actif + clés API
      errors.js          exceptions → messages affichables
      text.js            troncature
      providers/
        catalog.js       métadonnées seules (importé par l'UI, sans SDK)
        index.js         registre + implémentations (service worker seul)
        anthropic.js     appel via le SDK officiel
        gemini.js        appel REST direct
  dist/                  bundles esbuild (générés)
```

Flux d'un résumé : panneau → service worker → injection de Readability puis de
la fonction d'extraction → vérification du cache → appel du fournisseur actif →
réponse rendue dans le panneau. Le panneau ne connaît ni les clés ni les API :
il reçoit un résumé déjà découpé.

## Choix techniques

- **Side panel plutôt que popup** : un popup se ferme dès qu'on clique sur la
  page, ce qui annule la requête en cours. Un résumé prend 5 à 15 s.
- **Injection à la demande** : aucun `content_script` déclaré, rien ne tourne
  sur les pages tant qu'on ne clique pas.
- **`dangerouslyAllowBrowser: true`** : dans un service worker il n'y a pas de
  `window`, donc le garde-fou du SDK ne se déclenche pas — mais c'est cette
  option qui déclenche l'envoi de l'en-tête
  `anthropic-dangerous-direct-browser-access`, requis pour un appel venant d'une
  extension.
- **`thinking: { type: 'disabled' }`** (Anthropic) : résumer ne tire aucun
  bénéfice des tokens de réflexion ; les désactiver réduit latence et coût.
  Retirer cette ligne dans `providers/anthropic.js` pour échanger du budget
  contre de la qualité.
- **Gemini appelé en REST brut**, sans SDK : la requête est un seul POST, et
  `@google/genai` ajouterait une deuxième grosse dépendance à un service worker
  qui embarque déjà le SDK Anthropic.
- **Clé Google en en-tête `x-goog-api-key`**, pas en paramètre `?key=` : un
  secret dans une URL fuite dans les logs, l'historique et les référents.
- **`catalog.js` séparé de `index.js`** : la page d'options n'a besoin que des
  métadonnées. Sans cette séparation elle embarquait le SDK Anthropic et son
  bundle passait de 5 Ko à 513 Ko.
- **Plafond de 15 000 caractères** en entrée : borne le coût d'un résumé à
  environ 1 centime.
- **Le modèle ne renvoie jamais d'URL.** Les liens sont extraits du DOM par
  `extract.js` ; le modèle reçoit une liste numérotée (libellé + domaine, sans
  adresse) et répond `LIENS: 1, 3`. `lib/links.js` retraduit les numéros. Une
  URL inventée par le modèle ou soufflée par une page hostile ne peut donc pas
  devenir un lien cliquable.

## Sécurité

- Les clés ne sont **jamais** dans le code : elles vivent dans
  `chrome.storage.local`, saisies via la page d'options. Ne les commite sous
  aucun prétexte.
- `chrome.storage.local` **n'est pas chiffré** : lisible par qui a accès au
  profil Chrome. Acceptable en local, inacceptable pour une extension publiée.
- Le contenu de la page est traité comme une **donnée hostile** : délimité dans
  le prompt et explicitement désigné comme non-instruction, puis affiché avec
  `textContent` uniquement (jamais `innerHTML`).
- `host_permissions: ["<all_urls>"]` est un choix d'usage personnel : il évite
  la contrainte de `activeTab`, qui n'accorde l'accès qu'après un clic sur
  l'icône de la barre d'outils (un bouton dans le panneau ne suffit pas). Pour
  une extension publiée, il faudrait revenir à `activeTab`.

## Protocole de test manuel

Les tests automatiques ne couvrent que la logique pure. Le reste demande un
vrai navigateur — à vérifier à la main :

| # | Cas | Attendu |
| --- | --- | --- |
| 1 | Article de presse classique | Résumé en français, 4-7 puces |
| 2 | Article en anglais | Résumé **en français** |
| 3 | Page Wikipédia longue | Mention « article tronqué » |
| 4 | Doc technique (MDN…) | Résumé pertinent |
| 5 | Article payant tronqué | Erreur « pas assez de texte » |
| 6 | `chrome://extensions` | Erreur « pages internes » |
| 7 | Sans clé API enregistrée | Écran « Saisir ma clé API » |
| 8 | Clé volontairement fausse | « Clé API refusée » (message propre au fournisseur) |
| 9 | Mode avion | « Impossible de joindre l'API » + Réessayer |
| 10 | Rouvrir le panneau sur un article déjà résumé | Résumé instantané, « aucun appel facturé » |
| 11 | Bouton **Regénérer** | Nouvel appel, nouveau résumé |
| 12 | Changer d'onglet pendant l'affichage | Le panneau suit l'onglet actif |
| 13 | Basculer Anthropic → Google sur le même article | Nouveau résumé, badge mis à jour en pied de panneau |
| 14 | Sélectionner un fournisseur sans clé | Écran « Aucune clé … enregistrée » |
| 15 | Comparatif produit (test, guide d'achat) | Section « Liens de l'article » avec le lien du produit |
| 16 | Article sans produit ni ressource | Aucune section de liens |

Pour lire les erreurs du service worker : `chrome://extensions` → l'extension →
**Inspecter les vues : service worker**.

## Limites connues

- Pas de PDF, pas de YouTube, pas de Google Docs (aucun DOM texte exploitable).
- Les SPA doivent avoir fini leur rendu ; l'extraction est déclenchée au clic,
  ce qui suffit en pratique.
- Le résumé n'est pas streamé : il apparaît d'un bloc.

## Ce qui n'a pas été testé

L'extraction a été validée dans un vrai navigateur sur Wikipédia, MDN et deux
sites de presse. Côté Gemini, l'endpoint et le format d'erreur ont été vérifiés
avec une fausse clé (HTTP 400 `API_KEY_INVALID`).

En revanche, **aucun appel abouti n'a été exécuté et l'extension n'a jamais été
chargée dans Chrome** : cela demande une vraie clé et une installation manuelle.
Le corps de la requête Gemini reprend l'exemple de la documentation Google mais
n'a pas pu être validé (l'authentification échoue avant). Le protocole ci-dessus
est à dérouler avant de considérer le MVP validé.
