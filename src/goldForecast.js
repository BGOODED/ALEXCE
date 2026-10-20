// Gold forecasting helpers: damped-trend model, backtest and market signals.
// Input candles are { time (ms), close } in ascending order, one per day.
import { rsi, sma } from './indicators.js';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const FORECAST_HORIZONS = [1, 7, 14, 30];
export const MIN_HISTORY = 60;

const Z80 = 1.2816;
const Z95 = 1.96;

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function dailyVolatility(logPrices, lookback = 60) {
  const recent = logPrices.slice(-(lookback + 1));
  const returns = recent.slice(1).map((value, index) => value - recent[index]);
  if (returns.length < 2) return 0;
  const average = mean(returns);
  return Math.sqrt(returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / (returns.length - 1));
}

// Standard normal CDF (Abramowitz & Stegun 7.1.26).
export function normalCdf(x) {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

const chanceAbove = (expectedMove, spread) => {
  if (spread > 0) return normalCdf(expectedMove / spread);
  if (expectedMove > 0) return 1;
  return expectedMove < 0 ? 0 : 0.5;
};

const dampedSum = (phi, horizon) => {
  let sum = 0;
  let power = 1;
  for (let step = 1; step <= horizon; step += 1) {
    power *= phi;
    sum += power;
  }
  return sum;
};

// Damped-trend Holt smoothing (ETS A,Ad,N) in error-correction form.
// levels[t] / trends[t] only depend on series[0..t], so they are safe to backtest with.
export function runHolt(series, { alpha, beta, phi }) {
  let level = series[0];
  let trend = 0;
  let sse = 0;
  const levels = [level];
  const trends = [trend];
  for (let t = 1; t < series.length; t += 1) {
    const error = series[t] - (level + phi * trend);
    sse += error * error;
    level += phi * trend + alpha * error;
    trend = phi * trend + alpha * beta * error;
    levels.push(level);
    trends.push(trend);
  }
  return { levels, trends, sse };
}

const HOLT_GRID = {
  alpha: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  beta: [0.01, 0.05, 0.1, 0.2, 0.3],
  phi: [0.8, 0.9, 0.95, 0.98],
};

export function fitHolt(series) {
  let best = null;
  HOLT_GRID.alpha.forEach((alpha) => HOLT_GRID.beta.forEach((beta) => HOLT_GRID.phi.forEach((phi) => {
    const { sse } = runHolt(series, { alpha, beta, phi });
    if (!best || sse < best.sse) best = { alpha, beta, phi, sse };
  })));
  return { alpha: best.alpha, beta: best.beta, phi: best.phi };
}

// Point forecast (median) plus 80% / 95% ranges that widen with sqrt(horizon).
export function buildForecast(candles, maxHorizon = 30) {
  const logPrices = candles.map((candle) => Math.log(candle.close));
  const params = fitHolt(logPrices);
  const { levels, trends } = runHolt(logPrices, params);
  const level = levels[levels.length - 1];
  const trend = trends[trends.length - 1];
  const lastLog = logPrices[logPrices.length - 1];
  const lastTime = candles[candles.length - 1].time;
  const sigma = dailyVolatility(logPrices);
  const path = [];
  let damping = 0;
  let power = 1;
  for (let horizon = 1; horizon <= maxHorizon; horizon += 1) {
    power *= params.phi;
    damping += power;
    const center = level + damping * trend;
    const spread = sigma * Math.sqrt(horizon);
    path.push({
      horizon,
      time: lastTime + horizon * DAY_MS,
      price: Math.exp(center),
      low80: Math.exp(center - Z80 * spread),
      high80: Math.exp(center + Z80 * spread),
      low95: Math.exp(center - Z95 * spread),
      high95: Math.exp(center + Z95 * spread),
      chanceHigher: chanceAbove(center - lastLog, spread),
    });
  }
  return { params, sigma, path };
}

// Rolling-origin backtest: parameters are fitted only on data before the test window,
// and every forecast uses data up to its origin. Compared with a "no change" guess.
export function backtest(candles, horizon, windowSize = 120) {
  const logPrices = candles.map((candle) => Math.log(candle.close));
  const lastOrigin = logPrices.length - 1 - horizon;
  const firstOrigin = Math.max(MIN_HISTORY, lastOrigin - windowSize + 1);
  const samples = lastOrigin - firstOrigin + 1;
  if (samples < 10) return null;

  const params = fitHolt(logPrices.slice(0, firstOrigin + 1));
  const { levels, trends } = runHolt(logPrices, params);
  const damping = dampedSum(params.phi, horizon);
  let modelError = 0;
  let naiveError = 0;
  let directionHits = 0;
  let directionSamples = 0;
  let insideRange = 0;

  for (let origin = firstOrigin; origin <= lastOrigin; origin += 1) {
    const actual = logPrices[origin + horizon];
    const actualPrice = Math.exp(actual);
    const center = levels[origin] + damping * trends[origin];
    const spread = dailyVolatility(logPrices.slice(0, origin + 1)) * Math.sqrt(horizon);
    modelError += Math.abs(Math.exp(center) - actualPrice) / actualPrice;
    naiveError += Math.abs(Math.exp(logPrices[origin]) - actualPrice) / actualPrice;
    const actualMove = actual - logPrices[origin];
    const predictedMove = center - logPrices[origin];
    if (actualMove !== 0 && predictedMove !== 0) {
      directionSamples += 1;
      if (Math.sign(actualMove) === Math.sign(predictedMove)) directionHits += 1;
    }
    if (Math.abs(actual - center) <= Z80 * spread) insideRange += 1;
  }

  return {
    samples,
    modelError: modelError / samples,
    naiveError: naiveError / samples,
    directionAccuracy: directionSamples ? directionHits / directionSamples : null,
    rangeCoverage: insideRange / samples,
  };
}

const lastValue = (values) => (values.length ? values[values.length - 1] : null);

export const simpleMovingAverage = (values, period) => lastValue(sma(values, period));
export const relativeStrengthIndex = (values, period = 14) => lastValue(rsi(values, period));

export function marketSignals(candles) {
  const closes = candles.map((candle) => candle.close);
  const price = closes[closes.length - 1];
  const sma20 = simpleMovingAverage(closes, 20);
  const sma50 = simpleMovingAverage(closes, 50);
  const rsi = relativeStrengthIndex(closes);
  const changeOver = (days) => (closes.length > days ? price / closes[closes.length - 1 - days] - 1 : null);

  let trend = 'sideways';
  if (sma20 !== null && sma50 !== null && price > sma20 && sma20 > sma50) trend = 'up';
  else if (sma20 !== null && sma50 !== null && price < sma20 && sma20 < sma50) trend = 'down';

  let momentum = 'neutral';
  if (rsi !== null && rsi >= 70) momentum = 'overbought';
  else if (rsi !== null && rsi <= 30) momentum = 'oversold';

  return {
    price,
    sma20,
    sma50,
    rsi,
    trend,
    momentum,
    change1d: changeOver(1),
    change7d: changeOver(7),
    change30d: changeOver(30),
    volatility: dailyVolatility(closes.map(Math.log), 30) * Math.sqrt(365),
  };
}
