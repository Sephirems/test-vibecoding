/**
 * Options page: provider choice and API keys. The rows are built from the
 * provider registry, so adding a provider needs no HTML change.
 *
 * No key is validated against the API here: a test call costs money, and the
 * first real summary reports a bad key clearly enough.
 */
import { CATALOG_LIST } from './lib/providers/catalog.js';
import { clearKey, getSettings, setKey, setProvider } from './lib/storage.js';

const container = document.getElementById('providers');

/** @type {Map<string, { card: HTMLElement, radio: HTMLInputElement, input: HTMLInputElement, state: HTMLElement }>} */
const rows = new Map();

/**
 * @param {string} tag
 * @param {Record<string, string>} attributes
 * @param {string} [text]
 */
function element(tag, attributes = {}, text) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildRow(provider) {
  const card = element('section', { class: 'provider', 'data-provider': provider.id });

  const head = element('div', { class: 'provider-head' });
  const radio = /** @type {HTMLInputElement} */ (
    element('input', { type: 'radio', name: 'provider', id: `radio-${provider.id}`, value: provider.id })
  );
  const label = element('label', { for: `radio-${provider.id}` }, provider.label);
  const model = element('span', { class: 'provider-model' }, provider.model);
  head.append(radio, label, model);

  const input = /** @type {HTMLInputElement} */ (
    element('input', {
      type: 'password',
      spellcheck: 'false',
      autocomplete: 'off',
      placeholder: provider.keyHint,
      id: `key-${provider.id}`,
      'aria-label': `Clé API ${provider.label}`,
    })
  );

  const row = element('div', { class: 'row' });
  const save = element('button', { type: 'button', class: 'primary' }, 'Enregistrer');
  const toggle = element('button', { type: 'button' }, 'Afficher');
  const remove = element('button', { type: 'button' }, 'Effacer');
  row.append(save, toggle, remove);

  const state = element('p', { class: 'state' });

  const link = element('p', { class: 'state' });
  const anchor = element('a', { href: provider.consoleUrl, target: '_blank', rel: 'noreferrer' }, 'Obtenir une clé');
  link.append(anchor);

  card.append(head, input, row, state, link);

  radio.addEventListener('change', async () => {
    if (!radio.checked) return;
    await setProvider(provider.id);
    await render();
  });

  save.addEventListener('click', async () => {
    const value = input.value.trim();
    if (!value) {
      state.textContent = 'Saisis une clé avant d’enregistrer.';
      return;
    }
    await setKey(provider.id, value);
    const known = provider.keyPrefixes.some((prefix) => value.startsWith(prefix));
    state.textContent = known
      ? 'Clé enregistrée.'
      : `Format inattendu (attendu : ${provider.keyPrefixes.join(' ou ')}). Enregistrée quand même.`;
  });

  toggle.addEventListener('click', () => {
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    toggle.textContent = hidden ? 'Masquer' : 'Afficher';
  });

  remove.addEventListener('click', async () => {
    await clearKey(provider.id);
    input.value = '';
    state.textContent = 'Clé effacée.';
  });

  rows.set(provider.id, { card, radio, input, state });
  return card;
}

async function render() {
  const settings = await getSettings();
  for (const provider of CATALOG_LIST) {
    const row = rows.get(provider.id);
    const key = settings.keys[provider.id] ?? '';
    row.radio.checked = settings.provider === provider.id;
    row.card.dataset.active = String(settings.provider === provider.id);
    if (document.activeElement !== row.input) row.input.value = key;
    if (!row.state.textContent) {
      row.state.textContent = key ? 'Une clé est enregistrée.' : 'Aucune clé enregistrée.';
    }
  }
}

container.append(...CATALOG_LIST.map(buildRow));
render();
