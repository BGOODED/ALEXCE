// Bybit public market data for gold.
// Bybit TradFi's MT5 symbol (XAUUSD.s) has no public API, so the primary feed is
// Bybit's gold TradFi perpetual, XAUUSDT, which tracks spot gold and trades 24/7.
// The spot gold tokens are fallbacks only, and the page labels them as such.

const REST_BASE = 'https://api.bybit.com/v5/market';
const STREAM_BASE = 'wss://stream.bybit.com/v5/public';
const PING_MS = 20000;

export const MIN_DAILY_HISTORY = 60;

export const GOLD_MARKETS = [
  { category: 'linear', symbol: 'XAUUSDT', name: 'Gold TradFi Perpetual', primary: true },
  { category: 'spot', symbol: 'XAUTUSDT', name: 'Tether Gold (XAUT) spot' },
  { category: 'spot', symbol: 'PAXGUSDT', name: 'PAX Gold (PAXG) spot' },
];

// checkpoints: bars ahead the prediction panel shows; the chart projects up to the last one.
export const TIMEFRAMES = [
  { id: '1m', interval: '1', intraday: true, ms: 60e3, checkpoints: [1, 5, 30] },
  { id: '5m', interval: '5', intraday: true, ms: 300e3, checkpoints: [1, 6, 24] },
  { id: '15m', interval: '15', intraday: true, ms: 900e3, checkpoints: [1, 4, 16] },
  { id: '1H', interval: '60', intraday: true, ms: 3600e3, checkpoints: [1, 4, 24] },
  { id: '4H', interval: '240', intraday: true, ms: 14400e3, checkpoints: [1, 6, 18] },
  { id: '1D', interval: 'D', intraday: false, ms: 86400e3, checkpoints: [1, 7, 30] },
  { id: '1W', interval: 'W', intraday: false, ms: 604800e3, checkpoints: [1, 4, 8] },
];

const toNumber = (value) => (value === undefined || value === null || value === '' ? undefined : Number(value));

const getJson = async (path, params, signal) => {
  const response = await fetch(`${REST_BASE}/${path}?${new URLSearchParams(params)}`, { signal });
  if (!response.ok) throw new Error(`Bybit HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.retCode !== 0) throw new Error(payload.retMsg || 'Bybit API error');
  return payload.result || {};
};

// Candles in ascending time order: { time (ms), open, high, low, close, volume }.
export async function fetchKlines({ category, symbol }, interval, { limit = 1000, end, signal } = {}) {
  const params = { category, symbol, interval, limit: String(limit) };
  if (end) params.end = String(end);
  const result = await getJson('kline', params, signal);
  return (result.list || [])
    .map((row) => ({ time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) }))
    .filter((candle) => Number.isFinite(candle.time) && candle.close > 0)
    .sort((a, b) => a.time - b.time);
}

export function normalizeTicker(raw = {}) {
  const ticker = {};
  [
    ['lastPrice', 'lastPrice'], ['change24h', 'price24hPcnt'], ['high24h', 'highPrice24h'], ['low24h', 'lowPrice24h'],
    ['markPrice', 'markPrice'], ['indexPrice', 'indexPrice'], ['bid', 'bid1Price'], ['ask', 'ask1Price'],
    ['volume24h', 'volume24h'], ['turnover24h', 'turnover24h'], ['fundingRate', 'fundingRate'],
  ].forEach(([key, field]) => {
    const value = toNumber(raw[field]);
    if (Number.isFinite(value)) ticker[key] = value;
  });
  return ticker;
}

export async function fetchTicker({ category, symbol }, signal) {
  const result = await getJson('tickers', { category, symbol }, signal);
  return normalizeTicker(result.list?.[0]);
}

// Resolves the first market in GOLD_MARKETS that has enough daily history.
export async function fetchGoldHistory(signal) {
  for (const market of GOLD_MARKETS) {
    try {
      const candles = await fetchKlines(market, 'D', { limit: 400, signal });
      if (candles.length >= MIN_DAILY_HISTORY) return { market, candles };
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  throw new Error('Bybit gold feed unavailable');
}

export function parseStreamMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof message.topic !== 'string') return null;
  if (message.topic.startsWith('kline.')) {
    return {
      type: 'kline',
      bars: (message.data || []).map((bar) => ({
        time: Number(bar.start), open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close), volume: Number(bar.volume), confirm: Boolean(bar.confirm),
      })),
    };
  }
  if (message.topic.startsWith('tickers.')) return { type: 'ticker', ticker: normalizeTicker(message.data) };
  return null;
}

// Subscribes to Bybit public WebSocket topics and reconnects with backoff.
// Returns a function that closes the stream.
export function openBybitStream(category, topics, { onMessage, onStatus }) {
  let socket = null;
  let pingTimer = null;
  let retryTimer = null;
  let attempt = 0;
  let closed = false;

  const connect = () => {
    onStatus?.(attempt === 0 ? 'connecting' : 'reconnecting');
    socket = new WebSocket(`${STREAM_BASE}/${category}`);
    socket.onopen = () => {
      attempt = 0;
      onStatus?.('live');
      socket.send(JSON.stringify({ op: 'subscribe', args: topics }));
      pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 'ping' }));
      }, PING_MS);
    };
    socket.onmessage = (event) => {
      const parsed = parseStreamMessage(event.data);
      if (parsed) onMessage(parsed);
    };
    socket.onclose = () => {
      clearInterval(pingTimer);
      if (closed) return;
      onStatus?.('reconnecting');
      retryTimer = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt));
      attempt += 1;
    };
    socket.onerror = () => socket.close();
  };

  connect();
  return () => {
    closed = true;
    clearInterval(pingTimer);
    clearTimeout(retryTimer);
    socket?.close();
  };
}
