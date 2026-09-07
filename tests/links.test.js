/**
 * The model returns link numbers, never URLs. These tests pin the boundary that
 * makes that safe: an index that does not exist, a duplicate or anything the
 * model made up must never produce a link.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickLinks } from '../extension/src/lib/links.js';
import { buildUserContent, parseSummary } from '../extension/src/lib/prompt.js';

const CANDIDATES = [
  { href: 'https://a.example/1', text: 'Voir le prix', host: 'a.example' },
  { href: 'https://b.example/2', text: 'Test complet', host: 'b.example' },
  { href: 'https://c.example/3', text: 'Fiche technique', host: 'c.example' },
  { href: 'https://d.example/4', text: 'Autre', host: 'd.example' },
];

test('parseSummary lit la ligne LIENS', () => {
  const { tldr, points, linkNumbers } = parseSummary(
    'TLDR: Un test.\n- point A\n- point B\nLIENS: 1, 3',
  );
  assert.equal(tldr, 'Un test.');
  assert.deepEqual(points, ['point A', 'point B']);
  assert.deepEqual(linkNumbers, [1, 3]);
});

test('la ligne LIENS n’est jamais prise pour un point', () => {
  const { points } = parseSummary('TLDR: x\n- point\nLIENS: 2');
  assert.deepEqual(points, ['point']);
});

test('sans ligne LIENS, aucun lien n’est sélectionné', () => {
  const { linkNumbers } = parseSummary('TLDR: x\n- point');
  assert.deepEqual(linkNumbers, []);
  assert.deepEqual(pickLinks(linkNumbers, CANDIDATES), []);
});

test('une URL écrite par le modèle sur la ligne LIENS est ignorée', () => {
  // The model is told never to write an address. If it does anyway, only the
  // digits are read — here the "2" of the port, not the host.
  const { linkNumbers } = parseSummary('TLDR: x\n- point\nLIENS: https://malveillant.example');
  assert.deepEqual(linkNumbers, []);
  assert.deepEqual(pickLinks(linkNumbers, CANDIDATES), []);
});

test('pickLinks résout les numéros dans l’ordre donné', () => {
  const picked = pickLinks([3, 1], CANDIDATES);
  assert.deepEqual(
    picked.map((link) => link.href),
    ['https://c.example/3', 'https://a.example/1'],
  );
});

test('pickLinks ignore un numéro hors bornes', () => {
  assert.deepEqual(pickLinks([0, 99, -1, 2], CANDIDATES).map((l) => l.host), ['b.example']);
});

test('pickLinks dédoublonne', () => {
  assert.equal(pickLinks([1, 1, 1], CANDIDATES).length, 1);
});

test('pickLinks plafonne à trois liens', () => {
  assert.equal(pickLinks([1, 2, 3, 4], CANDIDATES).length, 3);
});

test('pickLinks tolère des entrées absentes', () => {
  assert.deepEqual(pickLinks(undefined, CANDIDATES), []);
  assert.deepEqual(pickLinks([1], undefined), []);
});

test('buildUserContent numérote les liens sans jamais donner les URLs', () => {
  const content = buildUserContent({
    title: 'T',
    url: 'https://exemple.fr/a',
    text: 'Corps.',
    truncated: false,
    links: CANDIDATES,
  });
  assert.match(content, /\[1\] Voir le prix — a\.example/);
  assert.match(content, /\[4\] Autre — d\.example/);
  for (const link of CANDIDATES) {
    assert.ok(!content.includes(link.href), `l'URL ${link.href} ne doit pas être envoyée au modèle`);
  }
});

test('buildUserContent n’ajoute aucune section quand il n’y a pas de lien', () => {
  const content = buildUserContent({
    title: 'T',
    url: 'https://exemple.fr/a',
    text: 'Corps.',
    truncated: false,
  });
  assert.ok(!content.includes('Liens présents'));
});
