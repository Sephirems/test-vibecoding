/**
 * Text helpers shared by the worker and the tests.
 */

/**
 * Cuts at a word boundary when one is close enough to the limit, so the model
 * never receives a half-word at the end of the article.
 * @param {string} text
 * @param {number} limit
 * @returns {string}
 */
export function truncateAtWord(text, limit) {
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit);
  const lastSpace = slice.lastIndexOf(' ');
  return lastSpace > limit * 0.8 ? slice.slice(0, lastSpace) : slice;
}
