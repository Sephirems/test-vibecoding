/**
 * Provider registry: metadata from the catalog plus the call implementation.
 *
 * Only the service worker imports this module — importing it pulls in every
 * provider SDK. UI code should import `catalog.js` instead.
 *
 * Adding a provider means one catalog entry and one module next to this file.
 */
import { summarize as anthropicSummarize } from './anthropic.js';
import { CATALOG_LIST, PROVIDER_CATALOG } from './catalog.js';
import { summarize as geminiSummarize } from './gemini.js';

/**
 * @typedef {import('./catalog.js').ProviderInfo & {
 *   summarize: (input: { apiKey: string, system: string, userContent: string, maxOutputTokens: number }) => Promise<string>
 * }} Provider
 */

/** @type {Record<string, (input: any) => Promise<string>>} */
const IMPLEMENTATIONS = {
  anthropic: anthropicSummarize,
  gemini: geminiSummarize,
};

/** @type {Record<string, Provider>} */
export const PROVIDERS = Object.fromEntries(
  CATALOG_LIST.map((info) => [info.id, { ...info, summarize: IMPLEMENTATIONS[info.id] }]),
);

/**
 * @param {string} id
 * @returns {Provider} the requested provider, or Anthropic if the stored id is
 * unknown (a stale setting should never leave the extension unusable)
 */
export function getProvider(id) {
  return PROVIDERS[id] ?? PROVIDERS[PROVIDER_CATALOG.anthropic.id];
}
