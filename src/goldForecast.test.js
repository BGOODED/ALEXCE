import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, backtest, buildForecast, marketSignals, normalCdf, relativeStrengthIndex } from './goldForecast.js';

const makeCandles = (closes) => closes.map((close, index) => ({ time: Date.UTC(2026, 0, 1) + index * DAY_MS, close }));

// Deterministic pseudo-random walk so tests are repeatable.
const randomWalk = (length, seed = 7) => {
  let state = seed;
  let price = 3000;
  return Array.from({ length }, () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    price *= Math.exp(((state / 2147483648) - 0.5) * 0.02);
    return price;
  });
};

test('normalCdf matches known values', () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-4);
  assert.ok(Math.abs(normalCdf(-1.2816) - 0.1) < 1e-4);
});

test('relativeStrengthIndex is 100 for only gains and 0 for only losses', () => {
  assert.equal(relativeStrengthIndex(Array.from({ length: 30 }, (_, index) => 100 + index)), 100);
  assert.equal(relativeStrengthIndex(Array.from({ length: 30 }, (_, index) => 100 - index)), 0);
  assert.equal(relativeStrengthIndex([1, 2, 3]), null);
});

test('buildForecast returns ordered, widening ranges', () => {
  const { path } = buildForecast(makeCandles(randomWalk(300)), 30);
  assert.equal(path.length, 30);
  path.forEach((point) => {
    assert.ok(point.low95 < point.low80 && point.low80 < point.price && point.price < point.high80 && point.high80 < point.high95);
    assert.ok(point.chanceHigher >= 0 && point.chanceHigher <= 1);
  });
  assert.ok(path[29].high80 - path[29].low80 > path[0].high80 - path[0].low80);
  assert.equal(path[0].time - DAY_MS, Date.UTC(2026, 0, 1) + 299 * DAY_MS);
});

test('buildForecast follows a steady uptrend', () => {
  const closes = Array.from({ length: 200 }, (_, index) => 2000 * Math.exp(0.004 * index + 0.001 * Math.sin(index)));
  const { path } = buildForecast(makeCandles(closes), 7);
  assert.ok(path[6].price > closes[closes.length - 1]);
  assert.ok(path[6].chanceHigher > 0.5);
});

test('buildForecast handles a flat series without NaN', () => {
  const { path } = buildForecast(makeCandles(Array(100).fill(2500)), 3);
  path.forEach((point) => {
    assert.ok(Math.abs(point.price - 2500) < 1e-6);
    assert.equal(point.chanceHigher, 0.5);
  });
});

test('backtest reports sane metrics and beats "no change" on a clean trend', () => {
  const walk = backtest(makeCandles(randomWalk(400)), 7);
  assert.equal(walk.samples, 120);
  [walk.modelError, walk.naiveError, walk.directionAccuracy, walk.rangeCoverage].forEach((value) => assert.ok(value >= 0 && value <= 1));

  const closes = Array.from({ length: 300 }, (_, index) => 2000 * Math.exp(0.003 * index + 0.002 * Math.sin(index)));
  const trend = backtest(makeCandles(closes), 7);
  assert.ok(trend.modelError < trend.naiveError);
  assert.ok(trend.directionAccuracy > 0.9);

  assert.equal(backtest(makeCandles(randomWalk(70)), 30), null);
});

test('marketSignals classifies trend and momentum', () => {
  const rising = marketSignals(makeCandles(Array.from({ length: 80 }, (_, index) => 2000 + index * 5)));
  assert.equal(rising.trend, 'up');
  assert.equal(rising.momentum, 'overbought');
  const falling = marketSignals(makeCandles(Array.from({ length: 80 }, (_, index) => 3000 - index * 5)));
  assert.equal(falling.trend, 'down');
  assert.equal(falling.momentum, 'oversold');
});
