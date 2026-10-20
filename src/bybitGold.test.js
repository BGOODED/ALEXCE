import test from 'node:test';
import assert from 'node:assert/strict';
import { GOLD_MARKETS, fetchGoldHistory, fetchKlines, fetchTicker, parseStreamMessage } from './bybitGold.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Bybit returns kline rows newest first: [start, open, high, low, close, volume, turnover].
const klineRows = (count) => Array.from({ length: count }, (_, index) => {
  const price = 4000 + index;
  return [String(Date.UTC(2026, 3, 1) + index * DAY_MS), String(price - 1), String(price + 2), String(price - 3), String(price), '120.5', '480000'];
}).reverse();

const withFetch = async (handler, run) => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return handler(String(url));
  };
  try {
    await run(requested);
  } finally {
    globalThis.fetch = originalFetch;
  }
};
const ok = (result) => ({ ok: true, json: async () => ({ retCode: 0, retMsg: 'OK', result }) });

test('the primary market is the Bybit gold TradFi perpetual', () => {
  assert.deepEqual([GOLD_MARKETS[0].category, GOLD_MARKETS[0].symbol, GOLD_MARKETS[0].primary], ['linear', 'XAUUSDT', true]);
});

test('fetchKlines builds the request and returns ascending OHLCV candles', async () => {
  await withFetch(() => ok({ list: klineRows(3) }), async (requested) => {
    const candles = await fetchKlines(GOLD_MARKETS[0], '60', { limit: 3, end: 123 });
    const url = new URL(requested[0]);
    assert.equal(url.origin + url.pathname, 'https://api.bybit.com/v5/market/kline');
    assert.deepEqual(Object.fromEntries(url.searchParams), { category: 'linear', symbol: 'XAUUSDT', interval: '60', limit: '3', end: '123' });
    assert.deepEqual(candles[0], { time: Date.UTC(2026, 3, 1), open: 3999, high: 4002, low: 3997, close: 4000, volume: 120.5 });
    assert.ok(candles[0].time < candles[2].time);
  });
});

test('fetchKlines rejects Bybit error responses', async () => {
  await withFetch(() => ({ ok: true, json: async () => ({ retCode: 10001, retMsg: 'Not supported symbols' }) }), async () => {
    await assert.rejects(fetchKlines(GOLD_MARKETS[0], 'D'), /Not supported symbols/);
  });
});

test('fetchGoldHistory uses XAUUSDT when it has enough history', async () => {
  await withFetch(() => ok({ list: klineRows(200) }), async (requested) => {
    const { market, candles } = await fetchGoldHistory();
    assert.equal(market.symbol, 'XAUUSDT');
    assert.equal(candles.length, 200);
    assert.equal(requested.length, 1);
  });
});

test('fetchGoldHistory falls back to the next Bybit market when XAUUSDT fails', async () => {
  await withFetch((url) => (url.includes('symbol=XAUUSDT') ? { ok: false, json: async () => ({}) } : ok({ list: klineRows(90) })), async (requested) => {
    const { market } = await fetchGoldHistory();
    assert.equal(market.symbol, 'XAUTUSDT');
    assert.equal(market.primary, undefined);
    assert.equal(requested.length, 2);
  });
});

test('fetchGoldHistory rejects when every market fails', async () => {
  await withFetch(() => { throw new Error('network down'); }, async () => {
    await assert.rejects(fetchGoldHistory(), /unavailable/);
  });
});

test('fetchTicker normalizes Bybit ticker fields to numbers', async () => {
  await withFetch(() => ok({ list: [{ symbol: 'XAUUSDT', lastPrice: '4121.35', price24hPcnt: '0.0042', markPrice: '4121.10', indexPrice: '4120.95', bid1Price: '4121.3', ask1Price: '4121.4', fundingRate: '0.0001', turnover24h: '' }] }), async () => {
    const ticker = await fetchTicker(GOLD_MARKETS[0]);
    assert.deepEqual(ticker, { lastPrice: 4121.35, change24h: 0.0042, markPrice: 4121.1, indexPrice: 4120.95, bid: 4121.3, ask: 4121.4, fundingRate: 0.0001 });
  });
});

test('parseStreamMessage reads kline and ticker pushes and ignores the rest', () => {
  const kline = parseStreamMessage(JSON.stringify({ topic: 'kline.1.XAUUSDT', data: [{ start: 1760000000000, open: '4120', high: '4122', low: '4119', close: '4121.5', volume: '3.2', confirm: false }] }));
  assert.deepEqual(kline, { type: 'kline', bars: [{ time: 1760000000000, open: 4120, high: 4122, low: 4119, close: 4121.5, volume: 3.2, confirm: false }] });
  assert.deepEqual(parseStreamMessage(JSON.stringify({ topic: 'tickers.XAUUSDT', type: 'delta', data: { lastPrice: '4121.6' } })), { type: 'ticker', ticker: { lastPrice: 4121.6 } });
  assert.equal(parseStreamMessage(JSON.stringify({ op: 'pong', success: true })), null);
  assert.equal(parseStreamMessage('not json'), null);
});
