import React, { useEffect, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart } from 'lightweight-charts';
import { TIMEFRAMES, fetchKlines, openBybitStream } from './bybitGold.js';
import { MIN_HISTORY, buildForecast } from './goldForecast.js';
import { bollinger, rsi, sma } from './indicators.js';

const INITIAL_BARS = 1000;
const MAX_BARS = 10000;
const VISIBLE_BARS = 150;
const FORECAST_FIT_BARS = 500;
const STUDIES = ['volume', 'ma20', 'ma50', 'bb', 'rsi', 'forecast'];
const COLORS = { up: '#26a69a', down: '#ef5350', ma20: '#f59e0b', ma50: '#a855f7', bb: '#3b82f6', rsi: '#a855f7', forecast: '#22d3ee' };
const PRICE_FORMAT = { type: 'price', precision: 2, minMove: 0.01 };

// Intraday bars are shown in the viewer's time zone. A fixed offset keeps times strictly
// increasing across daylight-saving changes, which the chart requires.
const TZ_OFFSET_SECONDS = -new Date().getTimezoneOffset() * 60;
const toChartTime = (ms, intraday) => Math.floor(ms / 1000) + (intraday ? TZ_OFFSET_SECONDS : 0);

const formatPrice = (value) => (Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const formatDuration = (ms) => {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${+hours.toFixed(1)}h`;
  const days = hours / 24;
  return days < 14 ? `${+days.toFixed(1)}d` : `${+(days / 7).toFixed(1)}w`;
};
const formatVolume = (value) => (Number.isFinite(value) ? value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 }) : '—');

const themeOptions = (darkMode) => {
  const border = darkMode ? '#1e293b' : '#e2e8f0';
  const grid = darkMode ? '#1a2230' : '#f1f5f9';
  return {
    layout: {
      background: { type: ColorType.Solid, color: darkMode ? '#12161f' : '#ffffff' },
      textColor: darkMode ? '#94a3b8' : '#475569',
      panes: { separatorColor: border },
    },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderColor: border },
    timeScale: { borderColor: border },
  };
};

function buildSeries(chart, settings) {
  const series = {};
  const { studies } = settings;
  series.main = settings.chartType === 'candles'
    ? chart.addSeries(CandlestickSeries, { upColor: COLORS.up, downColor: COLORS.down, wickUpColor: COLORS.up, wickDownColor: COLORS.down, borderVisible: false, priceFormat: PRICE_FORMAT })
    : chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2, priceFormat: PRICE_FORMAT });
  if (studies.volume) {
    series.volume = chart.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    series.volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  }
  const overlay = (color, options = {}) => chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat: PRICE_FORMAT, ...options });
  if (studies.ma20) series.ma20 = overlay(COLORS.ma20);
  if (studies.ma50) series.ma50 = overlay(COLORS.ma50);
  if (studies.bb) {
    series.bbUpper = overlay(COLORS.bb);
    series.bbMiddle = overlay(COLORS.bb, { lineStyle: LineStyle.Dashed });
    series.bbLower = overlay(COLORS.bb);
  }
  if (studies.forecast) {
    series.forecastMid = overlay(COLORS.forecast, { lineWidth: 2, lineStyle: LineStyle.Dashed, lastValueVisible: true, title: settings.forecastLabel });
    series.forecastHigh = overlay(COLORS.forecast, { lineStyle: LineStyle.Dotted });
    series.forecastLow = overlay(COLORS.forecast, { lineStyle: LineStyle.Dotted });
  }
  if (studies.rsi) {
    series.rsi = chart.addSeries(LineSeries, { color: COLORS.rsi, lineWidth: 1, priceLineVisible: false, priceFormat: { type: 'price', precision: 1, minMove: 0.1 } }, 1);
    [70, 30].forEach((price) => series.rsi.createPriceLine({ price, color: '#64748b', lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: '' }));
    chart.panes()[0]?.setStretchFactor(3);
    chart.panes()[1]?.setStretchFactor(1);
  }
  return series;
}

const volumeColor = (candle) => (candle.close >= candle.open ? 'rgba(38, 166, 154, 0.45)' : 'rgba(239, 83, 80, 0.45)');

// Forecast points strictly after the last candle (the chart rejects duplicate times).
const futureForecast = (candles, forecast) => {
  const last = candles[candles.length - 1];
  return forecast && last ? forecast.filter((point) => point.time > last.time) : [];
};

function setForecastData(series, candles, settings, forecast) {
  if (!series.forecastMid || !candles.length) return;
  const last = candles[candles.length - 1];
  const anchor = { time: toChartTime(last.time, settings.intraday), value: last.close };
  const points = futureForecast(candles, forecast);
  const line = (key) => [anchor, ...points.map((point) => ({ time: toChartTime(point.time, settings.intraday), value: point[key] }))];
  series.forecastMid.setData(line('price'));
  series.forecastHigh.setData(line('high80'));
  series.forecastLow.setData(line('low80'));
}

function indicatorValues(candles, studies) {
  const closes = candles.map((candle) => candle.close);
  return {
    ma20: studies.ma20 ? sma(closes, 20) : null,
    ma50: studies.ma50 ? sma(closes, 50) : null,
    bb: studies.bb ? bollinger(closes, 20, 2) : null,
    rsi: studies.rsi ? rsi(closes, 14) : null,
  };
}

const indicatorLines = (series, values) => [
  [series.ma20, values.ma20], [series.ma50, values.ma50], [series.rsi, values.rsi],
  [series.bbUpper, values.bb?.upper], [series.bbMiddle, values.bb?.middle], [series.bbLower, values.bb?.lower],
].filter(([target, data]) => target && data);

function setAllData(series, candles, settings, forecast) {
  if (!series.main || !candles.length) return;
  const time = (ms) => toChartTime(ms, settings.intraday);
  series.main.setData(settings.chartType === 'candles'
    ? candles.map((candle) => ({ time: time(candle.time), open: candle.open, high: candle.high, low: candle.low, close: candle.close }))
    : candles.map((candle) => ({ time: time(candle.time), value: candle.close })));
  series.volume?.setData(candles.map((candle) => ({ time: time(candle.time), value: candle.volume, color: volumeColor(candle) })));
  indicatorLines(series, indicatorValues(candles, settings.studies)).forEach(([target, data]) => {
    target.setData(data.flatMap((value, index) => (value === null ? [] : [{ time: time(candles[index].time), value }])));
  });
  setForecastData(series, candles, settings, forecast);
}

// Live tick: update only the newest bar of every series.
function updateLatest(series, candles, settings) {
  if (!series.main) return;
  const last = candles[candles.length - 1];
  const time = toChartTime(last.time, settings.intraday);
  series.main.update(settings.chartType === 'candles' ? { time, open: last.open, high: last.high, low: last.low, close: last.close } : { time, value: last.close });
  series.volume?.update({ time, value: last.volume, color: volumeColor(last) });
  indicatorLines(series, indicatorValues(candles, settings.studies)).forEach(([target, data]) => {
    const value = data[data.length - 1];
    if (value !== null) target.update({ time, value });
  });
}

function showRecent(chart, count, forecast) {
  const extra = forecast ? forecast.length + 4 : 8;
  chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - VISIBLE_BARS), to: count + extra });
  chart.priceScale('right').applyOptions({ autoScale: true });
}

export default function GoldChart({ market, darkMode, t, forecastHorizon, dateLocale }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const candlesRef = useRef([]);
  const viewRef = useRef({ key: '' });
  const settingsRef = useRef(null);
  const loadOlderRef = useRef(null);
  const forecastRef = useRef(null);
  const refreshForecastRef = useRef(null);
  const [timeframe, setTimeframe] = useState('1H');
  const [chartType, setChartType] = useState('candles');
  const [studies, setStudies] = useState({ volume: true, ma20: true, ma50: false, bb: false, rsi: false, forecast: true });
  const [status, setStatus] = useState('loading');
  const [streamStatus, setStreamStatus] = useState('connecting');
  const [hoverIndex, setHoverIndex] = useState(null);
  const [lastCandle, setLastCandle] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [, setForecastVersion] = useState(0);

  const frame = TIMEFRAMES.find((item) => item.id === timeframe);
  const forecastBars = frame.forecastBars ?? forecastHorizon;
  settingsRef.current = { chartType, studies, intraday: frame.intraday, stepMs: frame.ms, forecastBars, forecastLabel: t.legend.forecast };
  const marketKey = market ? `${market.category}:${market.symbol}` : '';

  useEffect(() => {
    // Created once; theme and data changes are applied by the effects below.
    const theme = themeOptions(darkMode);
    const chart = createChart(containerRef.current, {
      autoSize: true,
      ...theme,
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { ...theme.timeScale, rightOffset: 8, barSpacing: 8 },
      localization: { locale: dateLocale, priceFormatter: formatPrice },
    });
    chartRef.current = chart;
    const handleCrosshair = (param) => setHoverIndex(param.time !== undefined && param.logical !== undefined ? Math.round(param.logical) : null);
    const handleRange = (range) => {
      if (range && range.from < 15) loadOlderRef.current?.();
    };
    chart.subscribeCrosshairMove(handleCrosshair);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRange);
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = {};
    };
  }, []);

  useEffect(() => {
    chartRef.current?.applyOptions(themeOptions(darkMode));
  }, [darkMode]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const range = candlesRef.current.length ? chart.timeScale().getVisibleLogicalRange() : null;
    Object.values(seriesRef.current).forEach((series) => chart.removeSeries(series));
    seriesRef.current = buildSeries(chart, settingsRef.current);
    setAllData(seriesRef.current, candlesRef.current, settingsRef.current, forecastRef.current);
    if (range) chart.timeScale().setVisibleLogicalRange(range);
  }, [chartType, studies]);

  // Projects the next bars of the current timeframe from its recent closes.
  refreshForecastRef.current = () => {
    const candles = candlesRef.current;
    const { stepMs, forecastBars: bars } = settingsRef.current;
    forecastRef.current = bars && candles.length >= MIN_HISTORY ? buildForecast(candles.slice(-FORECAST_FIT_BARS), bars, stepMs).path : null;
    setForecastData(seriesRef.current, candles, settingsRef.current, forecastRef.current);
    setForecastVersion((version) => version + 1);
  };

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !market) return undefined;
    const view = { key: `${marketKey}:${frame.interval}:${reloadKey}`, market, interval: frame.interval, loadingOlder: false, reachedStart: false };
    viewRef.current = view;
    candlesRef.current = [];
    setStatus('loading');
    setHoverIndex(null);
    chart.applyOptions({ timeScale: { timeVisible: frame.intraday, secondsVisible: false } });

    const controller = new AbortController();
    let closeStream = null;
    const applyBar = (bar) => {
      const candles = candlesRef.current;
      const last = candles[candles.length - 1];
      if (!last || bar.time < last.time) return;
      const opensNewBar = bar.time > last.time;
      if (opensNewBar) candles.push(bar);
      else candles[candles.length - 1] = bar;
      updateLatest(seriesRef.current, candles, settingsRef.current);
      // A new bar refits the projection; a tick only moves its starting point.
      if (opensNewBar) refreshForecastRef.current();
      else setForecastData(seriesRef.current, candles, settingsRef.current, forecastRef.current);
      setLastCandle(bar);
    };

    fetchKlines(market, frame.interval, { limit: INITIAL_BARS, signal: controller.signal })
      .then((candles) => {
        if (controller.signal.aborted || viewRef.current !== view) return;
        if (!candles.length) throw new Error('No candles');
        candlesRef.current = candles;
        setAllData(seriesRef.current, candles, settingsRef.current, null);
        refreshForecastRef.current();
        showRecent(chart, candles.length, forecastRef.current);
        setLastCandle(candles[candles.length - 1]);
        setStatus('ready');
        closeStream = openBybitStream(market.category, [`kline.${frame.interval}.${market.symbol}`], {
          onMessage: (message) => {
            if (message.type === 'kline') message.bars.forEach(applyBar);
          },
          onStatus: setStreamStatus,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });

    return () => {
      controller.abort();
      closeStream?.();
    };
  }, [marketKey, frame.interval, frame.intraday, reloadKey]);

  useEffect(() => {
    refreshForecastRef.current();
  }, [forecastBars]);

  // Scrolling near the left edge loads older bars, like TradingView.
  loadOlderRef.current = async () => {
    const view = viewRef.current;
    const chart = chartRef.current;
    const candles = candlesRef.current;
    if (!chart || !view.market || view.loadingOlder || view.reachedStart || !candles.length || candles.length >= MAX_BARS) return;
    view.loadingOlder = true;
    try {
      const older = (await fetchKlines(view.market, view.interval, { end: candles[0].time - 1, limit: 1000 })).filter((candle) => candle.time < candles[0].time);
      if (viewRef.current !== view) return;
      if (!older.length) {
        view.reachedStart = true;
        return;
      }
      const range = chart.timeScale().getVisibleLogicalRange();
      candlesRef.current = [...older, ...candlesRef.current];
      setAllData(seriesRef.current, candlesRef.current, settingsRef.current, forecastRef.current);
      if (range) chart.timeScale().setVisibleLogicalRange({ from: range.from + older.length, to: range.to + older.length });
    } catch {
      // A failed page of history is retried on the next scroll.
    } finally {
      view.loadingOlder = false;
    }
  };

  useEffect(() => {
    if (!expanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [expanded]);

  const resetView = () => {
    if (chartRef.current && candlesRef.current.length) showRecent(chartRef.current, candlesRef.current.length, forecastRef.current);
  };

  // Legend: hovered bar, or the latest bar when the pointer is outside the chart.
  const candles = candlesRef.current;
  const hoveringCandle = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < candles.length;
  const shownIndex = hoveringCandle ? hoverIndex : candles.length - 1;
  const shown = hoveringCandle ? candles[hoverIndex] : lastCandle || candles[shownIndex];
  const previous = candles[shownIndex - 1];
  const change = shown && previous ? shown.close - previous.close : null;
  const projection = studies.forecast ? futureForecast(candles, forecastRef.current) : [];
  const hoveredForecast = hoverIndex !== null && hoverIndex >= candles.length ? projection[hoverIndex - candles.length] : null;
  const projectionEnd = projection[projection.length - 1];
  const values = candles.length ? indicatorValues(candles, studies) : {};
  const at = (series) => series?.[shownIndex] ?? null;
  const formatBarTime = (ms) => new Intl.DateTimeFormat(dateLocale, frame.intraday
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
    : { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(ms);

  const panel = darkMode ? 'bg-[#12161f] border-slate-800' : 'bg-white border-slate-200';
  const toolButton = (active) => `shrink-0 px-2.5 py-1.5 rounded-md text-xs font-bold transition ${active ? (darkMode ? 'bg-slate-700 text-white' : 'bg-slate-900 text-white') : darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`;
  const divider = <span className={`shrink-0 w-px h-5 ${darkMode ? 'bg-slate-800' : 'bg-slate-200'}`} />;
  const streamColor = streamStatus === 'live' ? 'bg-emerald-400' : 'bg-amber-400';

  return (
    <div className={expanded ? `fixed inset-0 z-[70] flex flex-col p-2 sm:p-4 ${darkMode ? 'bg-slate-950' : 'bg-slate-100'}` : ''}>
      <div className={`${panel} border rounded-3xl shadow-xl overflow-hidden flex flex-col ${expanded ? 'flex-1 min-h-0' : ''}`}>
        <div className={`flex items-center gap-1.5 overflow-x-auto px-3 py-2 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          {TIMEFRAMES.map((item) => (
            <button key={item.id} type="button" onClick={() => setTimeframe(item.id)} className={toolButton(timeframe === item.id)}>{item.id}</button>
          ))}
          {divider}
          <button type="button" onClick={() => setChartType('candles')} className={toolButton(chartType === 'candles')}>{t.chart.candles}</button>
          <button type="button" onClick={() => setChartType('line')} className={toolButton(chartType === 'line')}>{t.chart.line}</button>
          {divider}
          {STUDIES.map((study) => (
            <button key={study} type="button" aria-pressed={studies[study]} onClick={() => setStudies((previousStudies) => ({ ...previousStudies, [study]: !previousStudies[study] }))} className={toolButton(studies[study])}>{t.chart.studies[study]}</button>
          ))}
          <span className="ml-auto" />
          <button type="button" onClick={resetView} className={toolButton(false)} title={t.chart.reset}>↺ <span className="hidden sm:inline">{t.chart.reset}</span></button>
          <button type="button" onClick={() => setExpanded((value) => !value)} className={toolButton(expanded)} title={expanded ? t.chart.exitFullscreen : t.chart.fullscreen}>⛶ <span className="hidden sm:inline">{expanded ? t.chart.exitFullscreen : t.chart.fullscreen}</span></button>
        </div>

        <div className={`relative ${expanded ? 'flex-1 min-h-0' : 'h-[440px] sm:h-[560px]'}`}>
          <div ref={containerRef} className="absolute inset-0" />
          {shown && (
            <div className="pointer-events-none absolute left-3 top-2 z-10 text-[11px] leading-5 tabular-nums">
              <div className="flex items-center gap-2 font-bold">
                <span className={`inline-block w-2 h-2 rounded-full ${streamColor}`} />
                <span>{market.symbol} · {frame.id} · Bybit</span>
                <span className="font-normal opacity-60">{formatBarTime(shown.time)}</span>
              </div>
              <div className="flex flex-wrap gap-x-2">
                {[['O', shown.open], ['H', shown.high], ['L', shown.low], ['C', shown.close]].map(([label, value]) => (
                  <span key={label}><span className="opacity-60">{label}</span> <span className={shown.close >= shown.open ? 'text-[#26a69a]' : 'text-[#ef5350]'}>{formatPrice(value)}</span></span>
                ))}
                {change !== null && <span className={change >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'}>{change >= 0 ? '+' : ''}{formatPrice(change)} ({change >= 0 ? '+' : ''}{((change / previous.close) * 100).toFixed(2)}%)</span>}
                {studies.volume && <span><span className="opacity-60">Vol</span> {formatVolume(shown.volume)}</span>}
              </div>
              <div className="flex flex-wrap gap-x-3">
                {studies.ma20 && <span style={{ color: COLORS.ma20 }}>MA 20 {formatPrice(at(values.ma20))}</span>}
                {studies.ma50 && <span style={{ color: COLORS.ma50 }}>MA 50 {formatPrice(at(values.ma50))}</span>}
                {studies.bb && <span style={{ color: COLORS.bb }}>BB 20 2 · {formatPrice(at(values.bb?.upper))} / {formatPrice(at(values.bb?.middle))} / {formatPrice(at(values.bb?.lower))}</span>}
                {studies.rsi && <span style={{ color: COLORS.rsi }}>RSI 14 {Number.isFinite(at(values.rsi)) ? at(values.rsi).toFixed(1) : '—'}</span>}
              </div>
              {hoveredForecast ? (
                <div style={{ color: COLORS.forecast }}>{t.legend.forecast} {formatBarTime(hoveredForecast.time)} · {formatPrice(hoveredForecast.price)} ({formatPrice(hoveredForecast.low80)} – {formatPrice(hoveredForecast.high80)})</div>
              ) : projectionEnd && (
                <div style={{ color: COLORS.forecast }}>{t.chart.forecastAhead(formatDuration(projectionEnd.horizon * frame.ms))} · {formatPrice(projectionEnd.price)} (80% {formatPrice(projectionEnd.low80)} – {formatPrice(projectionEnd.high80)})</div>
              )}
            </div>
          )}
          {status !== 'ready' && (
            <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 text-sm ${darkMode ? 'bg-[#12161f]/80' : 'bg-white/80'}`}>
              {status === 'error'
                ? <><span className="font-bold text-rose-400">{t.chart.error}</span><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs">{t.retry}</button></>
                : <span className="opacity-70 animate-pulse">{t.chart.loading}</span>}
            </div>
          )}
        </div>

        <div className={`px-4 py-2 text-[11px] opacity-60 border-t ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>{t.chart.hint}</div>
      </div>
    </div>
  );
}
