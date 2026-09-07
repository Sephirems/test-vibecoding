/**
 * Tests for the provider layer: settings migration and Gemini response
 * handling. chrome.storage is faked — the point is the migration logic, not
 * Chrome itself.
 */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

/** Minimal in-memory stand-in for chrome.storage.local. */
function fakeStorage(initial = {}) {
  let data = { ...initial };
  return {
    dump: () => ({ ...data }),
    local: {
      async get(keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(
          list.filter((k) => k in data).map((k) => [k, data[k]]),
        );
      },
      async set(values) {
        data = { ...data, ...values };
      },
      async remove(keys) {
        for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
      },
    },
  };
}

let storage;
beforeEach(() => {
  storage = fakeStorage();
  globalThis.chrome = { storage: { local: storage.local } };
});

const { getSettings, setKey, setProvider, clearKey } = await import(
  '../extension/src/lib/storage.js'
);
const { CATALOG_LIST, PROVIDER_CATALOG } = await import(
  '../extension/src/lib/providers/catalog.js'
);
const { extractText } = await import('../extension/src/lib/providers/gemini.js');

test('sans réglage, le fournisseur par défaut est Anthropic et aucune clé', async () => {
  const settings = await getSettings();
  assert.equal(settings.provider, 'anthropic');
  assert.deepEqual(settings.keys, { anthropic: '', gemini: '' });
});

test('une clé v0.1 stockée sous « apiKey » est reprise comme clé Anthropic', async () => {
  await storage.local.set({ apiKey: 'sk-ant-ancienne' });
  const settings = await getSettings();
  assert.equal(settings.keys.anthropic, 'sk-ant-ancienne');
  assert.equal(settings.provider, 'anthropic');
});

test('enregistrer une clé Anthropic supprime le champ hérité', async () => {
  await storage.local.set({ apiKey: 'sk-ant-ancienne' });
  await setKey('anthropic', 'sk-ant-nouvelle');
  assert.equal((await getSettings()).keys.anthropic, 'sk-ant-nouvelle');
  assert.ok(!('apiKey' in storage.dump()), 'le champ hérité doit disparaître');
});

test('les deux clés coexistent et le fournisseur actif est indépendant', async () => {
  await setKey('anthropic', 'sk-ant-a');
  await setKey('gemini', 'AIza-b');
  await setProvider('gemini');

  const settings = await getSettings();
  assert.equal(settings.provider, 'gemini');
  assert.equal(settings.keys.anthropic, 'sk-ant-a');
  assert.equal(settings.keys.gemini, 'AIza-b');
});

test('effacer une clé laisse l’autre intacte', async () => {
  await setKey('anthropic', 'sk-ant-a');
  await setKey('gemini', 'AIza-b');
  await clearKey('gemini');

  const settings = await getSettings();
  assert.equal(settings.keys.gemini, '');
  assert.equal(settings.keys.anthropic, 'sk-ant-a');
});

test('un fournisseur inconnu en stockage retombe sur Anthropic', async () => {
  await storage.local.set({ provider: 'openai' });
  assert.equal((await getSettings()).provider, 'anthropic');
});

test('setProvider refuse un identifiant inconnu', async () => {
  await assert.rejects(() => setProvider('openai'), /Fournisseur inconnu/);
});

test('le catalogue décrit chaque fournisseur complètement', () => {
  assert.ok(CATALOG_LIST.length >= 2);
  for (const provider of CATALOG_LIST) {
    for (const field of ['id', 'label', 'model', 'keyHint', 'consoleUrl']) {
      assert.ok(provider[field], `${provider.id}.${field} manquant`);
    }
    assert.match(provider.consoleUrl, /^https:\/\//);
    assert.ok(
      Array.isArray(provider.keyPrefixes) && provider.keyPrefixes.length > 0,
      `${provider.id}.keyPrefixes doit être une liste non vide`,
    );
  }
  assert.equal(PROVIDER_CATALOG.gemini.model, 'gemini-3.8-flash');
  // Google issues "AQ." auth keys since 2026; "AIza" standard keys are retired.
  assert.ok(PROVIDER_CATALOG.gemini.keyPrefixes.includes('AQ.'));
});

test('extractText lit une réponse Gemini normale', () => {
  const text = extractText({
    candidates: [{ content: { parts: [{ text: 'TLDR: ok' }] }, finishReason: 'STOP' }],
  });
  assert.equal(text, 'TLDR: ok');
});

test('extractText concatène plusieurs parts', () => {
  const text = extractText({
    candidates: [{ content: { parts: [{ text: 'TLDR: a' }, { text: '\n- b' }] } }],
  });
  assert.equal(text, 'TLDR: a\n- b');
});

test('extractText accepte une réponse coupée par max_tokens', () => {
  const text = extractText({
    candidates: [{ content: { parts: [{ text: 'partiel' }] }, finishReason: 'MAX_TOKENS' }],
  });
  assert.equal(text, 'partiel');
});

test('extractText signale un blocage de sécurité', () => {
  assert.throws(
    () => extractText({ promptFeedback: { blockReason: 'SAFETY' } }),
    (error) => error.code === 'REFUSED' && /SAFETY/.test(error.message),
  );
});

test('extractText signale une interruption du modèle', () => {
  assert.throws(
    () => extractText({ candidates: [{ finishReason: 'RECITATION' }] }),
    (error) => error.code === 'REFUSED',
  );
});

test('extractText signale une réponse vide', () => {
  assert.throws(
    () => extractText({ candidates: [{ content: { parts: [] } }] }),
    (error) => error.code === 'EMPTY_RESPONSE' && error.retryable === true,
  );
});
