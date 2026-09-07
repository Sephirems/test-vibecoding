/**
 * Runs inside the page. chrome.scripting serialises this function to source
 * text, so it MUST be self-contained: no imports, no closures, no references
 * to anything outside its own body.
 */

/**
 * @returns {{ ok: true, title: string, text: string, links: object[], usedFallback: boolean }
 *          | { ok: false, reason: string }}
 */
export function extractArticleFromPage() {
  const MIN_CHARS = 400;
  const MAX_LINKS = 12;

  const clean = (value) =>
    String(value || '')
      .replace(/\r/g, '')
      .replace(/[ \t ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  const Readability = globalThis.__articleSummarizerReadability;
  if (typeof Readability !== 'function') {
    return { ok: false, reason: "Le moteur d'extraction n'a pas pu être chargé dans la page." };
  }

  let title = document.title || '';
  let text = '';
  /** @type {{ href: string, text: string, host: string }[]} */
  let links = [];

  try {
    // Readability mutates the document it is given, so it gets a copy.
    const article = new Readability(document.cloneNode(true), { charThreshold: 250 }).parse();
    if (article) {
      if (article.title) title = article.title;
      // article.textContent runs blocks together ('TitleFirst paragraph...'),
      // which reads badly and costs quality. Re-parse the cleaned HTML and join
      // block elements with newlines instead. DOMParser does not execute
      // scripts, so this stays safe on a hostile page.
      const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, dd, dt, figcaption, td';
      const parsed = new DOMParser().parseFromString(article.content || '', 'text/html');
      // Leaves only: a <td> wrapping a <figcaption> would otherwise contribute
      // the same sentence twice.
      const blocks = Array.from(parsed.body.querySelectorAll(BLOCKS)).filter(
        (node) => node.querySelector(BLOCKS) === null,
      );
      text =
        blocks.length > 0
          ? clean(blocks.map((node) => node.textContent).join('\n'))
          : clean(parsed.body.textContent || article.textContent);

      // Links are collected from the real DOM, never from the model. The model
      // only ever picks an index in this list, so it cannot invent a URL and a
      // hostile page cannot talk one into the panel.
      const seen = new Set();
      const pageHost = location.hostname;
      for (const anchor of parsed.body.querySelectorAll('a[href]')) {
        if (links.length >= MAX_LINKS) break;
        const raw = anchor.getAttribute('href') || '';
        if (/^(#|mailto:|javascript:|tel:)/i.test(raw)) continue;

        let url;
        try {
          url = new URL(raw, document.baseURI);
        } catch {
          continue;
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
        if (seen.has(url.href)) continue;
        seen.add(url.href);

        const label = clean(anchor.textContent).slice(0, 80);
        links.push({
          href: url.href,
          text: label || url.hostname,
          host: url.hostname.replace(/^www\./, ''),
          external: url.hostname !== pageHost,
        });
      }
      // Outbound links first: on a review page those are the product ones.
      links.sort((a, b) => Number(b.external) - Number(a.external));
    }
  } catch (error) {
    // Not fatal: the innerText fallback below still has a chance.
    console.warn('[Résumé] Readability a échoué :', error);
  }

  if (text.length >= MIN_CHARS) {
    return { ok: true, title, text, links, usedFallback: false };
  }

  const fallback = clean(document.body ? document.body.innerText : '');
  if (fallback.length >= MIN_CHARS) {
    return { ok: true, title, text: fallback, links, usedFallback: true };
  }

  const best = Math.max(text.length, fallback.length);
  return {
    ok: false,
    reason:
      best === 0
        ? "Aucun texte lisible n'a été trouvé sur cette page."
        : `Cette page ne contient pas assez de texte à résumer (${best} caractères lus, ${MIN_CHARS} minimum). Article payant ou page non textuelle ?`,
  };
}
