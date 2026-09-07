/**
 * Summaries are cached per normalized URL so that reopening the side panel on
 * an article already read costs nothing. The stored text hash lets us detect
 * that the page content changed and re-summarize.
 */
import { normalizeUrl } from './pages.js';

const PREFIX = 'sum:';
const INDEX_KEY = 'sumIndex';
const MAX_ENTRIES = 50;

/**
 * @typedef {object} CachedSummary
 * @property {string} tldr
 * @property {string[]} points
 * @property {string} raw
 * @property {string} textHash
 * @property {string} title
 * @property {string} provider
 * @property {string} model
 * @property {string} url
 * @property {number} createdAt
 * @property {boolean} truncated
 */

/**
 * @param {string} text
 * @returns {Promise<string>} hex SHA-256, first 16 chars (collision risk is
 * irrelevant for a local cache)
 */
export async function hashText(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * @param {string} url
 * @returns {Promise<CachedSummary | null>}
 */
export async function readCache(url) {
  const key = PREFIX + normalizeUrl(url);
  const stored = await chrome.storage.local.get(key);
  return stored[key] ?? null;
}

/**
 * @param {string} url
 * @param {CachedSummary} summary
 */
export async function writeCache(url, summary) {
  const key = PREFIX + normalizeUrl(url);
  const { [INDEX_KEY]: rawIndex } = await chrome.storage.local.get(INDEX_KEY);
  const index = Array.isArray(rawIndex) ? rawIndex.filter((k) => k !== key) : [];
  index.push(key);

  const expired = index.splice(0, Math.max(0, index.length - MAX_ENTRIES));
  await chrome.storage.local.set({ [key]: summary, [INDEX_KEY]: index });
  if (expired.length > 0) await chrome.storage.local.remove(expired);
}
