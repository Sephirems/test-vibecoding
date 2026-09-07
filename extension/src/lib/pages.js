/**
 * Which pages the extension is allowed to read.
 * Chrome refuses script injection on its own pages and on the Web Store; we
 * detect that up front so the user gets a real explanation instead of a
 * generic injection failure.
 */

const BLOCKED_SCHEMES = [
  'chrome:',
  'chrome-extension:',
  'chrome-untrusted:',
  'devtools:',
  'edge:',
  'about:',
  'view-source:',
  'data:',
];

const BLOCKED_HOSTS = ['chromewebstore.google.com', 'addons.mozilla.org'];

/**
 * @param {string | undefined} rawUrl
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkPageSupport(rawUrl) {
  if (!rawUrl) {
    return { ok: false, reason: "Aucune page active n'a pu être identifiée." };
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: `Adresse illisible : ${rawUrl}` };
  }

  if (BLOCKED_SCHEMES.includes(url.protocol)) {
    return {
      ok: false,
      reason: "Chrome interdit la lecture de ses pages internes. Ouvre un article sur un site web.",
    };
  }

  if (BLOCKED_HOSTS.includes(url.hostname)) {
    return { ok: false, reason: "Chrome interdit la lecture des pages du Web Store." };
  }

  if (url.protocol === 'file:') {
    return {
      ok: false,
      reason:
        "Les fichiers locaux nécessitent d'autoriser « Accès aux URL de fichier » dans les détails de l'extension.",
    };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `Type de page non pris en charge (${url.protocol}).` };
  }

  return { ok: true };
}

/**
 * Cache key for a page. Query strings and fragments are dropped so that
 * tracking parameters do not create duplicate entries for the same article.
 * @param {string} rawUrl
 * @returns {string}
 */
export function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`.replace(/\/$/, '');
  } catch {
    return rawUrl;
  }
}
