/**
 * Side panel UI. It owns no logic beyond rendering: it asks the service worker
 * for a page state or a summary and draws the answer. All text is written with
 * textContent — page content reaches this panel, and a crafted article must
 * never be able to inject markup here.
 */

const VIEWS = ['idle', 'loading', 'result', 'error', 'setup'];

const LOADING_STEPS = [
  'Lecture de la page…',
  'Envoi à Claude…',
  'Rédaction du résumé…',
  'Encore quelques secondes…',
];

const el = {
  pageTitle: document.getElementById('page-title'),
  pageUrl: document.getElementById('page-url'),
  summarize: document.getElementById('summarize'),
  loadingStatus: document.getElementById('loading-status'),
  tldr: document.getElementById('result-tldr'),
  points: document.getElementById('result-points'),
  notice: document.getElementById('result-notice'),
  copy: document.getElementById('copy'),
  regenerate: document.getElementById('regenerate'),
  errorMessage: document.getElementById('error-message'),
  setupMessage: document.getElementById('setup-message'),
  providerBadge: document.getElementById('provider-badge'),
  retry: document.getElementById('retry'),
  openOptions: document.getElementById('open-options'),
  footerOptions: document.getElementById('footer-options'),
};

/** @type {{ busy: boolean, summary: any, loadingTimer: number | undefined }} */
const state = { busy: false, summary: null, loadingTimer: undefined };

/** @param {string} name */
function showView(name) {
  for (const view of VIEWS) {
    document.getElementById(`view-${view}`).hidden = view !== name;
  }
}

/** @param {string} message */
function showError(message, retryable = false) {
  el.errorMessage.textContent = message;
  el.retry.hidden = !retryable;
  showView('error');
}

function startLoading() {
  let step = 0;
  el.loadingStatus.textContent = LOADING_STEPS[0];
  showView('loading');
  state.loadingTimer = setInterval(() => {
    step = Math.min(step + 1, LOADING_STEPS.length - 1);
    el.loadingStatus.textContent = LOADING_STEPS[step];
  }, 2500);
}

function stopLoading() {
  clearInterval(state.loadingTimer);
  state.loadingTimer = undefined;
}

/**
 * @param {any} summary
 * @param {boolean} fromCache
 */
function renderSummary(summary, fromCache) {
  state.summary = summary;
  el.tldr.textContent = summary.tldr || '(pas de synthèse renvoyée)';
  // Keep the placeholder visible only when there is nothing else to show.
  el.tldr.hidden = !summary.tldr && (summary.points?.length ?? 0) > 0;

  el.points.replaceChildren();
  for (const point of summary.points ?? []) {
    const li = document.createElement('li');
    li.textContent = point;
    el.points.append(li);
  }

  const notices = [];
  if (fromCache) notices.push('Résumé déjà en cache, aucun appel facturé.');
  if (summary.truncated) notices.push('Article long : seul le début a été résumé.');
  if (summary.usedFallback) notices.push('Extraction approximative : le texte principal n’a pas été identifié avec certitude.');

  el.notice.textContent = notices.join(' ');
  el.notice.hidden = notices.length === 0;
  el.copy.textContent = 'Copier';
  showView('result');
}

async function refresh() {
  if (state.busy) return;

  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: 'GET_PAGE_STATE' });
  } catch (error) {
    // The service worker was asleep and failed to wake; a retry usually works.
    showError(`Le service worker n'a pas répondu : ${error.message}`, true);
    return;
  }
  if (!response?.ok) {
    showError(response?.error?.message ?? 'État de la page indisponible.');
    return;
  }

  el.pageTitle.textContent = response.page.title || '(page sans titre)';
  el.pageUrl.textContent = response.page.url;
  el.providerBadge.textContent = `${response.provider.label} · ${response.provider.model}`;

  if (!response.hasApiKey) {
    el.setupMessage.textContent = `Aucune clé ${response.provider.label} enregistrée.`;
    showView('setup');
    return;
  }
  if (!response.supported) {
    showError(response.reason);
    return;
  }
  if (response.cached) {
    renderSummary(response.cached, true);
    return;
  }
  showView('idle');
}

/** @param {boolean} force */
async function summarize(force) {
  if (state.busy) return;
  state.busy = true;
  startLoading();

  try {
    const response = await chrome.runtime.sendMessage({ type: 'SUMMARIZE', force });
    if (response?.ok) {
      renderSummary(response.summary, response.fromCache);
    } else {
      showError(
        response?.error?.message ?? 'Erreur inconnue.',
        Boolean(response?.error?.retryable),
      );
    }
  } catch (error) {
    // Thrown when the service worker was torn down mid-request.
    showError(`Le service worker n'a pas répondu : ${error.message}`, true);
  } finally {
    stopLoading();
    state.busy = false;
  }
}

el.summarize.addEventListener('click', () => summarize(false));
el.retry.addEventListener('click', () => summarize(false));
el.regenerate.addEventListener('click', () => summarize(true));

el.copy.addEventListener('click', async () => {
  if (!state.summary) return;
  const text = [state.summary.tldr, ...(state.summary.points ?? []).map((p) => `- ${p}`)]
    .filter(Boolean)
    .join('\n');
  try {
    await navigator.clipboard.writeText(text);
    el.copy.textContent = 'Copié';
  } catch (error) {
    el.copy.textContent = 'Copie refusée';
    console.error('[Résumé] clipboard :', error);
  }
});

for (const button of [el.openOptions, el.footerOptions]) {
  button.addEventListener('click', () => chrome.runtime.openOptionsPage());
}

// The panel stays open across navigation, so it has to follow the active tab.
chrome.tabs.onActivated.addListener(() => refresh());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.status === 'complete') refresh();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.apiKey) refresh();
});

refresh();
