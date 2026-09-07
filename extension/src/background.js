/**
 * Service worker: the only place that knows the API keys exist and that a model
 * is being called. The side panel just sends messages and renders what it gets
 * back, so swapping a direct call for a backend later touches one module.
 *
 * MV3 note: this worker is killed after ~30s idle. No state is kept in memory;
 * everything durable goes through chrome.storage.
 */
import { extractArticleFromPage } from './extract.js';
import { hashText, readCache, writeCache } from './lib/cache.js';
import { appError, toAppError } from './lib/errors.js';
import { checkPageSupport } from './lib/pages.js';
import { SYSTEM_PROMPT, buildUserContent, parseSummary } from './lib/prompt.js';
import { getProvider } from './lib/providers/index.js';
import { getSettings } from './lib/storage.js';
import { truncateAtWord } from './lib/text.js';

/** Hard ceiling on what we send. Bounds the cost of a single summary. */
const MAX_INPUT_CHARS = 15000;
const MAX_OUTPUT_TOKENS = 700;

function enableActionOpensPanel() {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[Résumé] setPanelBehavior a échoué :', error));
}

chrome.runtime.onInstalled.addListener(enableActionOpensPanel);
chrome.runtime.onStartup.addListener(enableActionOpensPanel);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handlers = {
    GET_PAGE_STATE: () => handleGetPageState(),
    SUMMARIZE: () => handleSummarize({ force: Boolean(message?.force) }),
  };

  const handler = handlers[message?.type];
  if (!handler) return false;

  handler()
    .then((payload) => sendResponse({ ok: true, ...payload }))
    .catch((error) => sendResponse({ ok: false, error: toAppError(error) }));

  return true; // keeps the channel open for the async response
});

/** @returns {Promise<chrome.tabs.Tab>} */
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || typeof tab.id !== 'number') {
    throw appError('NO_ACTIVE_TAB', "Aucun onglet actif n'a été trouvé.");
  }
  return tab;
}

/** Everything the side panel needs to draw itself, without calling any API. */
async function handleGetPageState() {
  const tab = await getActiveTab();
  const support = checkPageSupport(tab.url);
  const settings = await getSettings();
  const provider = getProvider(settings.provider);
  const cached = support.ok && tab.url ? await readCache(tab.url) : null;

  return {
    page: { title: tab.title ?? '', url: tab.url ?? '' },
    supported: support.ok,
    reason: support.ok ? '' : support.reason,
    provider: { id: provider.id, label: provider.label, model: provider.model },
    hasApiKey: settings.keys[provider.id].length > 0,
    cached: cached && cached.provider === provider.id ? cached : null,
  };
}

/**
 * @param {{ force: boolean }} options - force skips the cache
 */
async function handleSummarize({ force }) {
  const tab = await getActiveTab();
  const support = checkPageSupport(tab.url);
  if (!support.ok) throw appError('PAGE_NOT_SUPPORTED', support.reason);

  const settings = await getSettings();
  const provider = getProvider(settings.provider);
  const apiKey = settings.keys[provider.id];
  if (!apiKey) {
    throw appError(
      'NO_API_KEY',
      `Aucune clé ${provider.label} enregistrée. Ouvre les options de l'extension pour en saisir une.`,
    );
  }

  const article = await extractFromTab(/** @type {number} */ (tab.id));
  const truncated = article.text.length > MAX_INPUT_CHARS;
  const text = truncated ? truncateAtWord(article.text, MAX_INPUT_CHARS) : article.text;
  const textHash = await hashText(text);
  const url = tab.url ?? '';

  if (!force) {
    const cached = await readCache(url);
    // A cache entry from another provider is a miss: the user switched to see a
    // different summary, not to be handed the old one.
    if (cached && cached.textHash === textHash && cached.provider === provider.id) {
      return { summary: cached, fromCache: true };
    }
  }

  const raw = await provider.summarize({
    apiKey,
    system: SYSTEM_PROMPT,
    userContent: buildUserContent({ title: article.title, url, text, truncated }),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  if (!raw) {
    throw appError('EMPTY_RESPONSE', "Le modèle a répondu sans contenu. Réessaie.", true);
  }

  const { tldr, points } = parseSummary(raw);

  /** @type {import('./lib/cache.js').CachedSummary} */
  const summary = {
    tldr,
    points,
    raw,
    textHash,
    title: article.title,
    url,
    provider: provider.id,
    model: provider.model,
    createdAt: Date.now(),
    truncated,
    usedFallback: article.usedFallback,
  };

  await writeCache(url, summary);
  return { summary, fromCache: false };
}

/**
 * Two-step injection: Readability is bundled as a file and exposed on a global,
 * then the extraction function (serialised as source, so it cannot import) uses
 * it. Both run in the extension's isolated world on the page.
 * @param {number} tabId
 */
async function extractFromTab(tabId) {
  let injection;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/readability-inject.js'],
    });
    [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractArticleFromPage,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw appError('INJECTION_FAILED', `Impossible de lire cette page : ${detail}`);
  }

  const result = injection?.result;
  if (!result) {
    throw appError('EXTRACTION_FAILED', "L'extraction du contenu n'a rien renvoyé.");
  }
  if (!result.ok) {
    throw appError('CONTENT_TOO_SHORT', result.reason);
  }
  return result;
}
