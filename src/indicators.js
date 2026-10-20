// Chart indicators. Each takes an array of closes and returns an array of the
// same length, with null where there is not enough history yet.

export function sma(values, period) {
  const output = new Array(values.length).fill(null);
  let sum = 0;
  values.forEach((value, index) => {
    sum += value;
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) output[index] = sum / period;
  });
  return output;
}

export function ema(values, period) {
  const output = new Array(values.length).fill(null);
  if (values.length < period) return output;
  const smoothing = 2 / (period + 1);
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  output[period - 1] = current;
  for (let index = period; index < values.length; index += 1) {
    current += smoothing * (values[index] - current);
    output[index] = current;
  }
  return output;
}

// Bollinger Bands with population standard deviation, as TradingView draws them.
export function bollinger(values, period = 20, multiplier = 2) {
  const middle = sma(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  middle.forEach((average, index) => {
    if (average === null) return;
    const window = values.slice(index - period + 1, index + 1);
    const deviation = Math.sqrt(window.reduce((sum, value) => sum + (value - average) ** 2, 0) / period);
    upper[index] = average + multiplier * deviation;
    lower[index] = average - multiplier * deviation;
  });
  return { upper, middle, lower };
}

// Wilder's RSI.
export function rsi(values, period = 14) {
  const output = new Array(values.length).fill(null);
  let gain = 0;
  let loss = 0;
  for (let index = 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    if (index <= period) {
      gain += Math.max(change, 0) / period;
      loss += Math.max(-change, 0) / period;
    } else {
      gain = (gain * (period - 1) + Math.max(change, 0)) / period;
      loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
    }
    if (index >= period) output[index] = loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
  }
  return output;
}
