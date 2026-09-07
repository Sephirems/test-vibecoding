/**
 * Turns the link numbers the model returned into real links.
 *
 * The model never sees a URL and never writes one: it picks an index in the
 * list the extension built from the page DOM. This module is the only place
 * that maps a number back to an href, which is what keeps a hallucinated or
 * page-injected address from ever reaching the panel.
 */

const MAX_SELECTED = 3;

/**
 * @param {number[]} numbers  1-based indexes as written by the model
 * @param {{ href: string, text: string, host: string }[]} candidates
 * @returns {{ href: string, text: string, host: string }[]}
 */
export function pickLinks(numbers, candidates) {
  if (!Array.isArray(numbers) || !Array.isArray(candidates)) return [];

  const picked = [];
  const seen = new Set();

  for (const number of numbers) {
    if (picked.length >= MAX_SELECTED) break;
    const link = candidates[number - 1];
    if (!link || seen.has(link.href)) continue;
    seen.add(link.href);
    picked.push(link);
  }

  return picked;
}
