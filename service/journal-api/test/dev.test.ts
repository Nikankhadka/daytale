import assert from 'node:assert/strict';
import { test } from 'node:test';
import { devTokenMatches } from '../src/dev.ts';

const EXPECTED = 'dev-app-token-0123456789abcdefgh';

test('devTokenMatches accepts the exact token', () => {
  assert.equal(devTokenMatches(EXPECTED, EXPECTED), true);
});

test('devTokenMatches rejects a token that differs in one character', () => {
  assert.equal(devTokenMatches(`${EXPECTED.slice(0, -1)}X`, EXPECTED), false);
});

test('devTokenMatches rejects a token of a different length without throwing', () => {
  assert.equal(devTokenMatches(EXPECTED.slice(1), EXPECTED), false);
  assert.equal(devTokenMatches(`${EXPECTED}x`, EXPECTED), false);
});

test('devTokenMatches rejects an empty token', () => {
  assert.equal(devTokenMatches('', EXPECTED), false);
});

test('devTokenMatches rejects a correct prefix', () => {
  assert.equal(devTokenMatches(EXPECTED.slice(0, 16), EXPECTED), false);
});
