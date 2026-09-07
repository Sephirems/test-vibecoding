# Décisions

Ordre chronologique. Chaque entrée dit ce qui a été décidé et pourquoi, pour
éviter de rejouer le débat.

## 1. Portée : usage personnel, pas de produit

Le projet visait initialement une extension freemium avec backend, quotas,
comptes et paiement. Abandonné après analyse des contraintes : paiements
impossibles via le Chrome Web Store (il faut un site + Stripe), statut légal
nécessaire pour encaisser en Belgique, review manuelle du store, et un coût
d'infrastructure à porter. Retenu : une extension personnelle, clé API de
l'utilisateur, sans serveur.

L'architecture reste compatible avec la version complète : tout l'appel réseau
est isolé dans une fonction (`requestSummary`).

## 2. Clé API dans `chrome.storage.local`, jamais dans le code

Une extension est une archive lisible : un secret dans le bundle est un secret
public. Pour un usage personnel, `chrome.storage.local` est acceptable — ce
n'est pas chiffré, mais l'attaquant devrait déjà avoir accès au profil Chrome.
La règle absolue reste : rien en dur dans le repo.

## 3. Side panel plutôt que popup

Un popup se ferme au premier clic hors de lui, ce qui **annule la requête en
cours**. Un résumé prend 5 à 15 s. Le side panel reste ouvert et permet de lire
le résumé à côté de l'article.

## 4. `host_permissions: ["<all_urls>"]` plutôt que `activeTab`

`activeTab` n'accorde l'accès à la page qu'après un clic sur l'icône de la barre
d'outils, un raccourci clavier ou un menu contextuel. Un bouton dans le panneau
latéral ne compte pas : après un changement d'onglet, l'extraction échouerait.
Comme l'extension n'est pas publiée et qu'aucun `content_script` n'est déclaré
(rien ne s'exécute sans clic), `<all_urls>` est le bon compromis ici. À revoir
en cas de publication.

## 5. Readability plutôt qu'une heuristique maison

Seule dépendance runtime. C'est le moteur du mode Lecture de Firefox : dix ans
de cas limites (paywalls, SPA, structures exotiques) qu'on ne réécrira pas.
Repli sur `document.body.innerText` si l'extraction rend moins de 400
caractères, signalé dans l'UI comme « extraction approximative ».

## 6. Injection en deux temps

`chrome.scripting.executeScript({ func })` sérialise la fonction en texte
source : elle ne peut donc pas importer Readability. On injecte d'abord le
bundle Readability (qui pose un global), puis la fonction d'extraction qui le
lit. Alternative écartée : injecter un seul fichier et lire la valeur de
complétion du script, comportement plus fragile.

## 7. `claude-sonnet-5`, réflexion désactivée

À usage personnel (~30 résumés/mois), le coût est négligeable : Sonnet 5 revient
à environ 0,3 €/mois, pour une qualité nettement supérieure à Haiku sur les
articles denses. `thinking: { type: 'disabled' }` parce que le résumé ne tire
aucun bénéfice des tokens de réflexion, qui coûteraient latence et argent.

## 8. Format texte strict plutôt que sorties structurées

Le modèle répond `TLDR:` + puces, parsé par une fonction tolérante. Une sortie
structurée JSON serait plus sûre sur le papier, mais ajoute une surface d'API à
ne pas se tromper pour un gain nul ici : si le format dérive, le parser retombe
sur « première ligne = synthèse, reste = points » et rien n'est perdu.

## 9. Contenu de page traité comme hostile

Un article peut contenir du texte adressé au modèle. Deux protections : le
contenu est délimité par `<article>` et désigné comme donnée non-instruction
dans le prompt système ; le rendu se fait exclusivement en `textContent`.

## 10. Texte reconstruit bloc par bloc, pas `article.textContent`

Vérifié dans un vrai navigateur : `article.textContent` de Readability colle les
blocs entre eux (« Google ChromeLogo used since March 2022… »), ce qui donne un
texte illisible et dégrade le résumé. Le HTML nettoyé est donc re-parsé avec
`DOMParser` (qui n'exécute aucun script) et les blocs sont joints par des sauts
de ligne. Seuls les blocs **feuilles** sont retenus : un `<td>` contenant une
`<figcaption>` produisait sinon la même phrase deux fois.

Mesuré sur l'article Wikipédia « Google Chrome » (1,6 Mo de HTML) : 360 ms.

## 11. Second fournisseur : Google Gemini, en REST brut

Ajout de Gemini à côté de Claude, l'utilisateur choisit dans les options.

**Pas de SDK Google.** L'appel est un seul POST ; `@google/genai` ajouterait une
deuxième grosse dépendance à un service worker qui embarque déjà le SDK
Anthropic (510 Ko). Le SDK Anthropic, lui, est conservé : il apporte les retries
et des erreurs typées qui n'existeraient pas autrement.

**Clé passée en en-tête `x-goog-api-key`**, pas via le paramètre `?key=` que
Google documente aussi : un secret dans une URL se retrouve dans les logs,
l'historique et les référents.

**Catalogue séparé de l'implémentation.** Premier jet : la page d'options
importait le registre des fournisseurs, qui importait le SDK Anthropic — le
bundle des options est passé à 513 Ko. Corrigé en scindant `catalog.js`
(métadonnées pures, importé par l'UI) et `index.js` (implémentations, importé
par le seul service worker). Options revenu à 5 Ko.

**Cache scindé par fournisseur.** Une entrée produite par Claude n'est pas
resservie après un passage à Gemini : l'utilisateur a changé pour voir un autre
résumé.

**`thinkingLevel` volontairement absent.** Gemini 3 Flash réfléchit au niveau
« medium » par défaut ; `low` serait moins cher et plus rapide, mais le champ
n'a pas pu être validé sur un appel réel et un champ inconnu ferait échouer
toute la requête en 400. À activer dans `gemini.js` une fois vérifié.

**Vérifié sans clé** : l'endpoint `gemini-3.8-flash:generateContent` existe et
l'en-tête est bien lu (HTTP 400 `API_KEY_INVALID`, ce que le mapping d'erreurs
intercepte). Le **corps** de la requête n'a pas pu être validé — l'authentification
échoue avant — mais il reprend mot pour mot l'exemple de la documentation Google.

## 12. Résumé plus long, et liens choisis par numéro

Résumé porté de 3-5 à 4-7 points, TLDR de deux phrases, `max_tokens` de 700 à
1200. Coût par résumé toujours de l'ordre du centime.

**Les liens sont extraits du DOM, jamais écrits par le modèle.** Sur un article
qui présente un produit, on veut le lien d'achat dans le résumé. Demander l'URL
au modèle ouvrirait deux trous : il peut l'inventer, et une page hostile peut
lui souffler une adresse qui deviendrait un lien cliquable dans le panneau.

Le montage retenu :

1. `extract.js` collecte les liens du contenu nettoyé par Readability (liens
   externes d'abord, dédoublonnés, 12 maximum) ;
2. le modèle ne reçoit **que le libellé et le domaine**, numérotés ;
3. il répond `LIENS: 1, 3` — des numéros, et le parser ne lit que des chiffres,
   donc une URL écrite malgré la consigne est jetée ;
4. `lib/links.js` retraduit les numéros en liens réels, borne les indices et
   plafonne à trois ;
5. le panneau construit les `<a>` avec `createElement`, `rel="noreferrer
   noopener"`, et affiche le domaine sous chaque lien pour que la destination
   soit visible avant le clic.

L'URL ne transite donc jamais par le modèle : elle va du DOM au panneau.

**Vérifié** sur la page de comparatif qui a motivé la demande : les deux liens
Amazon produits sortent en tête avec leur nom, les liens internes après, en
44 ms.

**Bug corrigé au passage** : le panneau n'écoutait que l'ancienne clé `apiKey`
dans `chrome.storage.onChanged`. Depuis le multi-fournisseur, changer de
fournisseur ne le rafraîchissait plus.
