/**
 * Pure-logic tests. No dependency, no DOM, no Chrome: only the modules that can
 * run in Node. Everything that needs a browser (extraction, the API call) is
 * covered by the manual protocol in the README.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hashText } from '../extension/src/lib/cache.js';
import { checkPageSupport, normalizeUrl } from '../extension/src/lib/pages.js';
import { buildUserContent, parseSummary } from '../extension/src/lib/prompt.js';
import { truncateAtWord } from '../extension/src/lib/text.js';

test('checkPageSupport accepte une page web ordinaire', () => {
  assert.equal(checkPageSupport('https://example.com/article').ok, true);
  assert.equal(checkPageSupport('http://example.com/a?b=1#c').ok, true);
});

test('checkPageSupport refuse les pages internes et le Web Store', () => {
  for (const url of [
    'chrome://extensions',
    'chrome-extension://abc/page.html',
    'devtools://devtools/bundled/x.html',
    'about:blank',
    'view-source:https://example.com',
    'https://chromewebstore.google.com/detail/x',
    'file:///C:/tmp/a.html',
  ]) {
    const result = checkPageSupport(url);
    assert.equal(result.ok, false, `${url} devrait être refusée`);
    assert.ok(result.reason.length > 10, `${url} doit avoir une raison lisible`);
  }
});

test('checkPageSupport refuse une URL absente ou illisible', () => {
  assert.equal(checkPageSupport(undefined).ok, false);
  assert.equal(checkPageSupport('pas une url').ok, false);
});

test('normalizeUrl ignore les paramètres de suivi et le fragment', () => {
  assert.equal(
    normalizeUrl('https://example.com/article?utm_source=x#intro'),
    'https://example.com/article',
  );
  assert.equal(normalizeUrl('https://example.com/article/'), 'https://example.com/article');
  assert.equal(
    normalizeUrl('https://example.com/a?b=1'),
    normalizeUrl('https://example.com/a?b=2'),
    'deux URLs qui ne diffèrent que par la query doivent partager la même entrée de cache',
  );
});

test('parseSummary lit le format demandé', () => {
  const { tldr, points } = parseSummary(
    'TLDR: Le marché baisse.\n- Premier point\n- Deuxième point\n- Troisième point',
  );
  assert.equal(tldr, 'Le marché baisse.');
  assert.deepEqual(points, ['Premier point', 'Deuxième point', 'Troisième point']);
});

test('parseSummary tolère les variantes du modèle', () => {
  const variants = [
    'TL;DR : Résumé court.\n* Point A\n• Point B',
    'tldr: Résumé court.\n- Point A\n- Point B',
  ];
  for (const raw of variants) {
    const { tldr, points } = parseSummary(raw);
    assert.equal(tldr, 'Résumé court.', `variante mal lue : ${raw}`);
    assert.equal(points.length, 2);
  }
});

test('parseSummary ne perd jamais le contenu si le format dérive', () => {
  const { tldr, points } = parseSummary('Une phrase seule.\nUne autre ligne.');
  assert.equal(tldr, 'Une phrase seule.');
  assert.deepEqual(points, ['Une autre ligne.']);
});

test('parseSummary sur une réponse vide ne jette pas', () => {
  assert.deepEqual(parseSummary(''), { tldr: '', points: [], linkNumbers: [] });
});

test('buildUserContent délimite le contenu et signale la troncature', () => {
  const content = buildUserContent({
    title: 'Titre',
    url: 'https://example.com/a',
    text: 'Corps.',
    truncated: true,
  });
  assert.match(content, /<article>\nCorps\.\n<\/article>/);
  assert.match(content, /tronqué/);
  assert.ok(content.indexOf('<article>') > content.indexOf('Source :'));
});

test('truncateAtWord coupe sur un espace quand il est proche de la limite', () => {
  const text = `${'a'.repeat(90)} ${'b'.repeat(30)}`;
  assert.equal(truncateAtWord(text, 100), 'a'.repeat(90));
});

test('truncateAtWord coupe net si le dernier espace est trop loin', () => {
  const text = `a ${'b'.repeat(200)}`;
  assert.equal(truncateAtWord(text, 100).length, 100);
});

test('truncateAtWord laisse un texte court intact', () => {
  assert.equal(truncateAtWord('court', 100), 'court');
});

test('hashText est stable et discrimine', async () => {
  const a = await hashText('même contenu');
  const b = await hashText('même contenu');
  const c = await hashText('autre contenu');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{16}$/);
});
