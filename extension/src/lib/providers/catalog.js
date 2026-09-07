/**
 * Provider metadata only — no SDK, no network code.
 *
 * The options page needs labels, models and key hints but must not pull a
 * 500 KB SDK into its bundle, so the description of a provider is kept
 * separate from its implementation.
 */

/**
 * @typedef {'anthropic' | 'gemini'} ProviderId
 * @typedef {object} ProviderInfo
 * @property {ProviderId} id
 * @property {string} label      shown in the UI
 * @property {string} model      model identifier, shown to the user
 * @property {string} keyPrefix  expected key prefix, used for a soft warning
 * @property {string} keyHint    placeholder text
 * @property {string} consoleUrl where to get a key
 */

/** @type {Record<ProviderId, ProviderInfo>} */
export const PROVIDER_CATALOG = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic — Claude',
    model: 'claude-sonnet-5',
    keyPrefix: 'sk-ant-',
    keyHint: 'sk-ant-…',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
  },
  gemini: {
    id: 'gemini',
    label: 'Google — Gemini',
    model: 'gemini-3.8-flash',
    keyPrefix: 'AIza',
    keyHint: 'AIza…',
    consoleUrl: 'https://aistudio.google.com/apikey',
  },
};

/** @type {ProviderInfo[]} */
export const CATALOG_LIST = Object.values(PROVIDER_CATALOG);
