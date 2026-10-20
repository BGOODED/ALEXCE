import test from 'node:test';
import assert from 'node:assert/strict';
import { bollinger, ema, rsi, sma } from './indicators.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('sma averages the trailing window and pads the start with null', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  assert.deepEqual(sma([1, 2], 3), [null, null]);
});

test('ema seeds with the simple average then smooths', () => {
  const values = ema([1, 2, 3, 4, 5], 3);
  assert.deepEqual(values.slice(0, 2), [null, null]);
  close(values[2], 2);
  close(values[3], 3);
  close(values[4], 4);
});

test('bollinger uses population standard deviation', () => {
  const { upper, middle, lower } = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
  close(middle[7], 5);
  close(upper[7], 9);
  close(lower[7], 1);
  assert.equal(upper[6], null);
});

test('rsi is 100 for only gains, 0 for only losses and null before the period', () => {
  const rising = rsi(Array.from({ length: 20 }, (_, index) => index), 14);
  assert.equal(rising[13], null);
  assert.equal(rising[14], 100);
  assert.equal(rsi(Array.from({ length: 20 }, (_, index) => -index), 14)[19], 0);
  assert.equal(rsi(Array(20).fill(5), 14)[19], 50);
});
