/**
 * Provider choice and API keys.
 *
 * Keys live in chrome.storage.local and are never written to this repository.
 * chrome.storage.local is NOT encrypted: anyone with access to the Chrome
 * profile directory can read it. Acceptable for personal use on your own
 * machine, not for a distributed extension.
 */

const PROVIDER_KEY = 'provider';
const KEY_FIELD = { anthropic: 'anthropicKey', gemini: 'geminiKey' };
const LEGACY_KEY_FIELD = 'apiKey';
const DEFAULT_PROVIDER = 'anthropic';

/**
 * @typedef {'anthropic' | 'gemini'} ProviderId
 * @typedef {object} Settings
 * @property {ProviderId} provider
 * @property {Record<ProviderId, string>} keys
 */

/** @returns {Promise<Settings>} */
export async function getSettings() {
  const stored = await chrome.storage.local.get([
    PROVIDER_KEY,
    KEY_FIELD.anthropic,
    KEY_FIELD.gemini,
    LEGACY_KEY_FIELD,
  ]);

  // v0.1 stored a single `apiKey`, which was always an Anthropic one.
  const anthropic = stored[KEY_FIELD.anthropic] ?? stored[LEGACY_KEY_FIELD] ?? '';
  const provider = stored[PROVIDER_KEY] in KEY_FIELD ? stored[PROVIDER_KEY] : DEFAULT_PROVIDER;

  return {
    provider,
    keys: {
      anthropic: typeof anthropic === 'string' ? anthropic.trim() : '',
      gemini: typeof stored[KEY_FIELD.gemini] === 'string' ? stored[KEY_FIELD.gemini].trim() : '',
    },
  };
}

/** @param {ProviderId} provider */
export async function setProvider(provider) {
  if (!(provider in KEY_FIELD)) {
    throw new Error(`Fournisseur inconnu : ${provider}`);
  }
  await chrome.storage.local.set({ [PROVIDER_KEY]: provider });
}

/**
 * @param {ProviderId} provider
 * @param {string} key
 */
export async function setKey(provider, key) {
  if (!(provider in KEY_FIELD)) {
    throw new Error(`Fournisseur inconnu : ${provider}`);
  }
  await chrome.storage.local.set({ [KEY_FIELD[provider]]: key.trim() });
  // Drop the v0.1 field once the same value lives under its provider name.
  if (provider === 'anthropic') await chrome.storage.local.remove(LEGACY_KEY_FIELD);
}

/** @param {ProviderId} provider */
export async function clearKey(provider) {
  const fields = [KEY_FIELD[provider]];
  if (provider === 'anthropic') fields.push(LEGACY_KEY_FIELD);
  await chrome.storage.local.remove(fields);
}
