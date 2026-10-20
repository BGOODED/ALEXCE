import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FORECAST_HORIZONS, MIN_HISTORY, backtest, buildForecast, fetchGoldHistory, marketSignals, unitFactor } from './goldForecast.js';

const MMK_RATE_STORAGE_KEY = 'alexce-gold-mmk-rate';
const HISTORY_DAYS = 90;
const UNITS = ['mmk_kyattha', 'usd_oz', 'usd_g', 'thb_baht'];
const dateLocales = { en: 'en-US', my: 'my-MM', th: 'th-TH-u-ca-gregory' };

const goldText = {
  en: {
    title: 'GOLD PRICE FORECAST',
    subtitle: 'Live world gold price with a statistical forecast, likely price ranges and an honest accuracy check.',
    status: { loading: 'Loading prices…', live: 'Live', stale: 'Showing last loaded prices', offline: 'Price feed offline' },
    retry: 'Retry',
    updated: 'Updated',
    units: { usd_oz: 'USD / oz', usd_g: 'USD / gram', mmk_kyattha: 'MMK / tical', thb_baht: 'THB / baht' },
    days: (h) => (h === 1 ? '1 day' : `${h} days`),
    currentPrice: 'Current price',
    today: 'Today',
    forecastIn: (h) => `Forecast in ${h === 1 ? '1 day' : `${h} days`}`,
    vsToday: 'vs today',
    likelyRange: 'Likely range (80%)',
    rangeHint: '8 in 10 chance the price ends inside',
    chanceHigher: 'Chance of ending higher',
    chartTitle: 'Price history & forecast',
    chartSubtitle: 'Last 90 days, then the forecast with 80% / 95% ranges.',
    convertedNote: 'Converted at today’s exchange rate.',
    legend: { history: 'Price', forecast: 'Forecast', band80: '80% range', band95: '95% range' },
    signalsTitle: 'Market signals',
    trend: 'Trend',
    trendValues: { up: 'Uptrend', down: 'Downtrend', sideways: 'Sideways' },
    momentum: 'Momentum (RSI 14)',
    momentumValues: { overbought: 'Overbought', oversold: 'Oversold', neutral: 'Neutral' },
    sma20: '20-day average',
    sma50: '50-day average',
    change7d: '7-day change',
    change30d: '30-day change',
    volatility: 'Volatility (30-day, yearly)',
    accuracyTitle: 'Model accuracy check',
    accuracyNote: (n, h) => `Back-tested on the last ${n} days: each day the model forecast ${h === 1 ? '1 day' : `${h} days`} ahead using only data available at that time.`,
    modelError: 'Model average error',
    naiveError: '“No change” guess error',
    directionHits: 'Direction correct',
    rangeCoverage: 'Actual price inside 80% range',
    beatsBaseline: 'At this horizon the model was more accurate than simply assuming no change.',
    losesBaseline: 'At this horizon the model was not more accurate than simply assuming no change — treat this forecast as low confidence.',
    notEnoughData: 'Not enough price history to test this horizon yet.',
    tableTitle: 'Forecast table',
    columns: { horizon: 'Horizon', date: 'Date', forecast: 'Forecast', range: '80% range', chance: 'Chance higher' },
    localTitle: 'Myanmar price settings',
    fxRate: 'Exchange rate (MMK per 1 USD)',
    useLiveRate: 'Use live rate',
    liveRate: 'Live feed rate',
    purity: 'Gold purity',
    purityOptions: { pe16: '16 pe (pure gold)', pe15: '15 pe' },
    fxNote: 'Estimated from the world gold price. Local shops quote at the market exchange rate and add their own premium, which can differ from the live feed rate — enter today’s market rate for a closer local estimate.',
    kyat: 'Ks',
    lakh: 'lakh',
    sourceNote: (source) => `Prices from ${source}: PAX Gold (PAXG/USDT), a token backed by one troy ounce of London gold, which tracks world gold (XAU/USD) closely.`,
    disclaimer: 'Forecasts are statistical estimates from past prices only (damped-trend smoothing on log prices, with ranges from recent volatility). They cannot foresee news or central-bank decisions, are not financial advice, and gold can move outside these ranges.',
  },
  my: {
    title: 'ရွှေစျေး ခန့်မှန်းချက်',
    subtitle: 'ကမ္ဘာ့ရွှေစျေး တိုက်ရိုက်နှင့် စာရင်းအင်းနည်းဖြင့် ခန့်မှန်းချက်၊ ဖြစ်နိုင်ခြေရှိသော စျေးအပိုင်းအခြားများနှင့် တိကျမှုစစ်ဆေးချက်။',
    status: { loading: 'စျေးနှုန်းများ ရယူနေသည်…', live: 'တိုက်ရိုက်', stale: 'နောက်ဆုံးရရှိထားသော စျေးနှုန်းများကို ပြသနေသည်', offline: 'စျေးနှုန်းဒေတာ ချိတ်ဆက်၍မရပါ' },
    retry: 'ထပ်ကြိုးစားရန်',
    updated: 'အပ်ဒိတ်',
    units: { usd_oz: 'ဒေါ်လာ / အောင်စ', usd_g: 'ဒေါ်လာ / ဂရမ်', mmk_kyattha: 'ကျပ် / ကျပ်သား', thb_baht: 'ဘတ် / ဘတ်ချိန်' },
    days: (h) => `${h} ရက်`,
    currentPrice: 'လက်ရှိစျေး',
    today: 'ယနေ့',
    forecastIn: (h) => `${h} ရက်အကြာ ခန့်မှန်းစျေး`,
    vsToday: 'ယနေ့စျေးနှင့် နှိုင်းယှဉ်လျှင်',
    likelyRange: 'ဖြစ်နိုင်ခြေရှိသော အပိုင်းအခြား (၈၀%)',
    rangeHint: '၁၀ ကြိမ်တွင် ၈ ကြိမ် ဤအပိုင်းအခြားအတွင်း ရှိနိုင်သည်',
    chanceHigher: 'စျေးတက်နိုင်ခြေ',
    chartTitle: 'စျေးနှုန်းမှတ်တမ်းနှင့် ခန့်မှန်းချက်',
    chartSubtitle: 'လွန်ခဲ့သော ၉၀ ရက်နှင့် ၈၀% / ၉၅% အပိုင်းအခြားပါ ခန့်မှန်းချက်။',
    convertedNote: 'ယနေ့ငွေလဲနှုန်းဖြင့် တွက်ချက်ထားသည်။',
    legend: { history: 'စျေးနှုန်း', forecast: 'ခန့်မှန်းချက်', band80: '၈၀% အပိုင်းအခြား', band95: '၉၅% အပိုင်းအခြား' },
    signalsTitle: 'စျေးကွက်အချက်ပြများ',
    trend: 'လမ်းကြောင်း',
    trendValues: { up: 'အတက်', down: 'အကျ', sideways: 'ဘေးတိုက်' },
    momentum: 'အရှိန် (RSI 14)',
    momentumValues: { overbought: 'ဝယ်လွန်နေ', oversold: 'ရောင်းလွန်နေ', neutral: 'ကြားနေ' },
    sma20: '၂၀ ရက် ပျမ်းမျှစျေး',
    sma50: '၅၀ ရက် ပျမ်းမျှစျေး',
    change7d: '၇ ရက် ပြောင်းလဲမှု',
    change30d: '၃၀ ရက် ပြောင်းလဲမှု',
    volatility: 'အတက်အကျနှုန်း (၃၀ ရက်၊ နှစ်စဉ်)',
    accuracyTitle: 'မော်ဒယ် တိကျမှုစစ်ဆေးချက်',
    accuracyNote: (n, h) => `နောက်ဆုံး ${n} ရက်ဖြင့် နောက်ကြောင်းပြန် စမ်းသပ်ထားသည် — နေ့စဉ် ထိုအချိန်က ရရှိနိုင်သော ဒေတာသာ အသုံးပြု၍ ${h} ရက် ကြိုတင်ခန့်မှန်းခဲ့သည်။`,
    modelError: 'မော်ဒယ် ပျမ်းမျှအမှား',
    naiveError: '“စျေးမပြောင်းလဲ” ဟု ခန့်မှန်းခြင်း၏ အမှား',
    directionHits: 'အတက်/အကျ ဦးတည်ချက် မှန်ကန်မှု',
    rangeCoverage: '၈၀% အပိုင်းအခြားအတွင်း ကျရောက်မှု',
    beatsBaseline: 'ဤကာလအတွက် မော်ဒယ်သည် “စျေးမပြောင်းလဲ” ဟု ယူဆခြင်းထက် ပိုမိုတိကျခဲ့သည်။',
    losesBaseline: 'ဤကာလအတွက် မော်ဒယ်သည် “စျေးမပြောင်းလဲ” ဟု ယူဆခြင်းထက် ပိုမတိကျခဲ့ပါ — ဤခန့်မှန်းချက်ကို ယုံကြည်မှုနည်းသည်ဟု သဘောထားပါ။',
    notEnoughData: 'ဤကာလကို စမ်းသပ်ရန် စျေးနှုန်းမှတ်တမ်း မလုံလောက်သေးပါ။',
    tableTitle: 'ခန့်မှန်းချက်ဇယား',
    columns: { horizon: 'ကာလ', date: 'ရက်စွဲ', forecast: 'ခန့်မှန်းစျေး', range: '၈၀% အပိုင်းအခြား', chance: 'တက်နိုင်ခြေ' },
    localTitle: 'မြန်မာရွှေစျေး ဆက်တင်',
    fxRate: 'ငွေလဲနှုန်း (၁ ဒေါ်လာ = ကျပ်)',
    useLiveRate: 'တိုက်ရိုက်နှုန်း သုံးရန်',
    liveRate: 'တိုက်ရိုက်ဒေတာနှုန်း',
    purity: 'ရွှေအရည်အသွေး',
    purityOptions: { pe16: '၁၆ ပဲရည် (အခေါက်ရွှေ)', pe15: '၁၅ ပဲရည်' },
    fxNote: 'ကမ္ဘာ့ရွှေစျေးမှ ခန့်မှန်းတွက်ချက်ထားခြင်း ဖြစ်သည်။ ပြည်တွင်းရွှေဆိုင်များသည် ပြင်ပငွေလဲနှုန်းဖြင့် စျေးသတ်မှတ်ပြီး ပရီမီယံ ထပ်ပေါင်းသောကြောင့် တိုက်ရိုက်ဒေတာနှုန်းနှင့် ကွာခြားနိုင်သည် — ပိုမိုနီးစပ်သော ပြည်တွင်းစျေးအတွက် ယနေ့ ပြင်ပငွေလဲနှုန်းကို ထည့်ပါ။',
    kyat: 'ကျပ်',
    lakh: 'သိန်း',
    sourceNote: (source) => `စျေးနှုန်းရင်းမြစ် ${source}: PAX Gold (PAXG/USDT) — တိုကင်တစ်ခုလျှင် London ရွှေ ၁ ထရိုင်အောင်စဖြင့် အာမခံထားပြီး ကမ္ဘာ့ရွှေစျေး (XAU/USD) နှင့် နီးကပ်စွာ လိုက်ပါသည်။`,
    disclaimer: 'ခန့်မှန်းချက်များသည် ယခင်စျေးနှုန်းများကိုသာ အခြေခံသော စာရင်းအင်းဆိုင်ရာ ခန့်မှန်းချက်များ ဖြစ်သည် (log စျေးနှုန်းအပေါ် damped-trend smoothing နှင့် မကြာသေးမီ အတက်အကျနှုန်းမှ အပိုင်းအခြားများ)။ သတင်းများ သို့မဟုတ် ဗဟိုဘဏ်ဆုံးဖြတ်ချက်များကို ကြိုမမြင်နိုင်ပါ၊ ငွေကြေးဆိုင်ရာ အကြံဉာဏ် မဟုတ်ပါ၊ ရွှေစျေးသည် ဤအပိုင်းအခြားများ ပြင်ပသို့ ရောက်နိုင်ပါသည်။',
  },
  th: {
    title: 'พยากรณ์ราคาทองคำ',
    subtitle: 'ราคาทองคำโลกแบบสด พร้อมการพยากรณ์เชิงสถิติ ช่วงราคาที่น่าจะเป็น และการตรวจสอบความแม่นยำอย่างตรงไปตรงมา',
    status: { loading: 'กำลังโหลดราคา…', live: 'สด', stale: 'แสดงราคาที่โหลดล่าสุด', offline: 'ไม่สามารถเชื่อมต่อแหล่งราคา' },
    retry: 'ลองอีกครั้ง',
    updated: 'อัปเดต',
    units: { usd_oz: 'USD / ออนซ์', usd_g: 'USD / กรัม', mmk_kyattha: 'MMK / ကျပ်သား', thb_baht: 'THB / ทอง 1 บาท' },
    days: (h) => `${h} วัน`,
    currentPrice: 'ราคาปัจจุบัน',
    today: 'วันนี้',
    forecastIn: (h) => `พยากรณ์อีก ${h} วัน`,
    vsToday: 'เทียบกับวันนี้',
    likelyRange: 'ช่วงที่น่าจะเป็น (80%)',
    rangeHint: 'มีโอกาส 8 ใน 10 ที่ราคาจะอยู่ในช่วงนี้',
    chanceHigher: 'โอกาสที่ราคาจะสูงขึ้น',
    chartTitle: 'ประวัติราคาและการพยากรณ์',
    chartSubtitle: '90 วันที่ผ่านมา และการพยากรณ์พร้อมช่วง 80% / 95%',
    convertedNote: 'แปลงด้วยอัตราแลกเปลี่ยนวันนี้',
    legend: { history: 'ราคา', forecast: 'พยากรณ์', band80: 'ช่วง 80%', band95: 'ช่วง 95%' },
    signalsTitle: 'สัญญาณตลาด',
    trend: 'แนวโน้ม',
    trendValues: { up: 'ขาขึ้น', down: 'ขาลง', sideways: 'ไซด์เวย์' },
    momentum: 'โมเมนตัม (RSI 14)',
    momentumValues: { overbought: 'ซื้อมากเกินไป', oversold: 'ขายมากเกินไป', neutral: 'เป็นกลาง' },
    sma20: 'ค่าเฉลี่ย 20 วัน',
    sma50: 'ค่าเฉลี่ย 50 วัน',
    change7d: 'เปลี่ยนแปลง 7 วัน',
    change30d: 'เปลี่ยนแปลง 30 วัน',
    volatility: 'ความผันผวน (30 วัน, ต่อปี)',
    accuracyTitle: 'ตรวจสอบความแม่นยำของโมเดล',
    accuracyNote: (n, h) => `ทดสอบย้อนหลังกับ ${n} วันล่าสุด: แต่ละวันโมเดลพยากรณ์ล่วงหน้า ${h} วัน โดยใช้เฉพาะข้อมูลที่มีในขณะนั้น`,
    modelError: 'ค่าคลาดเคลื่อนเฉลี่ยของโมเดล',
    naiveError: 'ค่าคลาดเคลื่อนของการเดา “ไม่เปลี่ยนแปลง”',
    directionHits: 'ทายทิศทางถูก',
    rangeCoverage: 'ราคาจริงอยู่ในช่วง 80%',
    beatsBaseline: 'ที่ระยะนี้ โมเดลแม่นยำกว่าการสมมติว่าราคาไม่เปลี่ยนแปลง',
    losesBaseline: 'ที่ระยะนี้ โมเดลไม่ได้แม่นยำกว่าการสมมติว่าราคาไม่เปลี่ยนแปลง — ควรถือว่าการพยากรณ์นี้มีความเชื่อมั่นต่ำ',
    notEnoughData: 'ยังมีประวัติราคาไม่พอสำหรับทดสอบระยะนี้',
    tableTitle: 'ตารางพยากรณ์',
    columns: { horizon: 'ระยะเวลา', date: 'วันที่', forecast: 'พยากรณ์', range: 'ช่วง 80%', chance: 'โอกาสขึ้น' },
    localTitle: 'ตั้งค่าราคาทองเมียนมา',
    fxRate: 'อัตราแลกเปลี่ยน (จ๊าดต่อ 1 USD)',
    useLiveRate: 'ใช้อัตราสด',
    liveRate: 'อัตราจากแหล่งข้อมูลสด',
    purity: 'ความบริสุทธิ์ของทอง',
    purityOptions: { pe16: '16 pe (ทองบริสุทธิ์)', pe15: '15 pe' },
    fxNote: 'ประเมินจากราคาทองคำโลก ร้านทองในเมียนมาใช้อัตราแลกเปลี่ยนตลาดและบวกค่าพรีเมียมของตนเอง ซึ่งอาจต่างจากอัตราสด — ใส่อัตราตลาดของวันนี้เพื่อให้ได้ราคาใกล้เคียงยิ่งขึ้น',
    kyat: 'จ๊าด',
    lakh: null,
    sourceNote: (source) => `ราคาจาก ${source}: PAX Gold (PAXG/USDT) โทเคนที่มีทองคำลอนดอนหนุนหลัง 1 ทรอยออนซ์ต่อโทเคน และเคลื่อนไหวใกล้เคียงราคาทองคำโลก (XAU/USD)`,
    disclaimer: 'การพยากรณ์เป็นการประมาณการทางสถิติจากราคาในอดีตเท่านั้น (damped-trend smoothing บน log ราคา พร้อมช่วงจากความผันผวนล่าสุด) ไม่สามารถคาดการณ์ข่าวหรือการตัดสินใจของธนาคารกลางได้ ไม่ใช่คำแนะนำทางการเงิน และราคาทองคำอาจเคลื่อนไหวนอกช่วงเหล่านี้',
  },
};

const formatPercent = (value, digits = 2) => (Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%` : '—');

const formatAxisValue = (value) => {
  if (value >= 100000) return value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 });
  return value.toLocaleString('en-US', { maximumFractionDigits: value >= 1000 ? 0 : 1 });
};

const readStoredRate = () => {
  try {
    return window.localStorage.getItem(MMK_RATE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

function useElementWidth(fallback) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function GoldChart({ history, forecast, darkMode, formatPrice, formatDate, t }) {
  const [containerRef, width] = useElementWidth(640);
  const [hoverIndex, setHoverIndex] = useState(null);
  const height = 300;
  const padding = { top: 16, right: 60, bottom: 30, left: 6 };
  const colors = darkMode
    ? { history: '#fbbf24', forecast: '#22d3ee', grid: '#1e293b', text: '#94a3b8', tooltip: 'bg-slate-900 border-slate-700' }
    : { history: '#d97706', forecast: '#0891b2', grid: '#e2e8f0', text: '#64748b', tooltip: 'bg-white border-slate-200' };

  const last = history[history.length - 1];
  const anchor = { time: last.time, price: last.price, low80: last.price, high80: last.price, low95: last.price, high95: last.price };
  const points = [...history, ...forecast.map((point) => ({ ...point, isForecast: true }))];
  const minTime = points[0].time;
  const maxTime = points[points.length - 1].time;
  const values = [...history.map((point) => point.price), ...forecast.flatMap((point) => [point.low95, point.high95])];
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = (rawMax - rawMin) * 0.08 || rawMax * 0.01;
  const minValue = rawMin - pad;
  const maxValue = rawMax + pad;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (time) => padding.left + ((time - minTime) / Math.max(maxTime - minTime, 1)) * plotWidth;
  const y = (value) => padding.top + ((maxValue - value) / (maxValue - minValue)) * plotHeight;
  const polyline = (items) => items.map((point) => `${x(point.time).toFixed(1)},${y(point.price).toFixed(1)}`).join(' ');
  const band = (lowKey, highKey) => {
    const sequence = [anchor, ...forecast];
    return [
      ...sequence.map((point) => `${x(point.time).toFixed(1)},${y(point[highKey]).toFixed(1)}`),
      ...[...sequence].reverse().map((point) => `${x(point.time).toFixed(1)},${y(point[lowKey]).toFixed(1)}`),
    ].join(' ');
  };
  const yTicks = [0, 1, 2, 3, 4].map((index) => minValue + ((maxValue - minValue) * index) / 4);
  const xTickCount = width < 480 ? 3 : 5;
  const xTicks = Array.from({ length: xTickCount }, (_, index) => minTime + ((maxTime - minTime) * index) / (xTickCount - 1));

  const handlePointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    points.forEach((point, index) => {
      if (Math.abs(x(point.time) - pointerX) < Math.abs(x(points[nearest].time) - pointerX)) nearest = index;
    });
    setHoverIndex(nearest);
  };

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoveredX = hovered ? x(hovered.time) : 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t.chartTitle}
        className="block select-none"
        style={{ touchAction: 'pan-y' }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} stroke={colors.grid} strokeWidth="1" />
            <text x={width - padding.right + 6} y={y(tick) + 4} fontSize="11" fill={colors.text}>{formatAxisValue(tick)}</text>
          </g>
        ))}
        {xTicks.map((tick, index) => (
          <text key={tick} x={x(tick)} y={height - 8} fontSize="11" fill={colors.text} textAnchor={index === 0 ? 'start' : index === xTickCount - 1 ? 'end' : 'middle'}>{formatDate(tick)}</text>
        ))}
        <polygon points={band('low95', 'high95')} fill={colors.forecast} opacity="0.12" />
        <polygon points={band('low80', 'high80')} fill={colors.forecast} opacity="0.22" />
        <line x1={x(last.time)} x2={x(last.time)} y1={padding.top} y2={height - padding.bottom} stroke={colors.text} strokeDasharray="3 4" strokeWidth="1" />
        <text x={x(last.time) - 4} y={padding.top + 10} fontSize="10" fill={colors.text} textAnchor="end">{t.today}</text>
        <polyline points={polyline(history)} fill="none" stroke={colors.history} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={polyline([anchor, ...forecast])} fill="none" stroke={colors.forecast} strokeWidth="2" strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" />
        {hovered && (
          <g pointerEvents="none">
            <line x1={hoveredX} x2={hoveredX} y1={padding.top} y2={height - padding.bottom} stroke={colors.text} strokeWidth="1" />
            <circle cx={hoveredX} cy={y(hovered.price)} r="4.5" fill={hovered.isForecast ? colors.forecast : colors.history} stroke={darkMode ? '#0f172a' : '#ffffff'} strokeWidth="2" />
          </g>
        )}
      </svg>
      {hovered && (
        <div
          className={`pointer-events-none absolute top-2 z-10 rounded-xl border px-3 py-2 text-xs shadow-xl ${colors.tooltip}`}
          style={{ left: Math.min(Math.max(hoveredX - 80, 0), width - 170), width: 170 }}
        >
          <div className="opacity-60">{formatDate(hovered.time)}{hovered.isForecast ? ` · ${t.legend.forecast}` : ''}</div>
          <div className="font-black tabular-nums text-sm mt-0.5">{formatPrice(hovered.price)}</div>
          {hovered.isForecast && <div className="opacity-70 mt-0.5 tabular-nums text-[11px]">{formatPrice(hovered.low80)} – {formatPrice(hovered.high80)}</div>}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 text-[11px] opacity-80">
        <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 rounded" style={{ background: colors.history }} />{t.legend.history}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: colors.forecast }} />{t.legend.forecast}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: colors.forecast, opacity: 0.4 }} />{t.legend.band80}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: colors.forecast, opacity: 0.18 }} />{t.legend.band95}</span>
      </div>
    </div>
  );
}

export default function GoldPredictor({ darkMode, language, fxRates }) {
  const t = goldText[language] || goldText.en;
  const [feed, setFeed] = useState({ status: 'loading', candles: [], source: '', updatedAt: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [horizon, setHorizon] = useState(7);
  const [unit, setUnit] = useState(language === 'my' ? 'mmk_kyattha' : 'usd_oz');
  const [purity, setPurity] = useState(1);
  const [mmkRateInput, setMmkRateInput] = useState(readStoredRate);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const { source, candles } = await fetchGoldHistory(controller.signal);
        setFeed({ status: 'live', candles, source, updatedAt: Date.now() });
      } catch {
        if (!controller.signal.aborted) setFeed((previous) => ({ ...previous, status: previous.candles.length ? 'stale' : 'offline' }));
      }
    };
    setFeed((previous) => (previous.candles.length ? previous : { ...previous, status: 'loading' }));
    load();
    const refresh = setInterval(load, 60000);
    return () => {
      controller.abort();
      clearInterval(refresh);
    };
  }, [reloadKey]);

  useEffect(() => {
    try {
      if (mmkRateInput) window.localStorage.setItem(MMK_RATE_STORAGE_KEY, mmkRateInput);
      else window.localStorage.removeItem(MMK_RATE_STORAGE_KEY);
    } catch {
      // Storage can be unavailable (private mode); the rate just won't be remembered.
    }
  }, [mmkRateInput]);

  const { candles } = feed;
  const ready = candles.length >= MIN_HISTORY;
  const forecast = useMemo(() => (ready ? buildForecast(candles, 30) : null), [candles, ready]);
  const signals = useMemo(() => (ready ? marketSignals(candles) : null), [candles, ready]);
  const accuracy = useMemo(() => (ready ? backtest(candles, horizon) : null), [candles, horizon, ready]);

  const liveMmkRate = fxRates?.MMK;
  const mmkRate = Number(mmkRateInput) > 0 ? Number(mmkRateInput) : liveMmkRate;
  const factor = unitFactor(unit, { mmkRate, thbRate: fxRates?.THB, purity });
  const digits = unit === 'mmk_kyattha' || unit === 'thb_baht' ? 0 : 2;
  const formatPrice = (usdPerOunce) => {
    const value = usdPerOunce * factor;
    if (!Number.isFinite(value)) return '—';
    const amount = value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    if (unit === 'mmk_kyattha') return `${amount} ${t.kyat}`;
    return unit === 'thb_baht' ? `฿${amount}` : `$${amount}`;
  };
  const formatLakh = (usdPerOunce) => {
    const value = (usdPerOunce * factor) / 100000;
    return unit === 'mmk_kyattha' && t.lakh && Number.isFinite(value) ? `≈ ${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${t.lakh}` : null;
  };
  const dateLocale = dateLocales[language] || dateLocales.en;
  const formatDate = (time) => new Intl.DateTimeFormat(dateLocale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(time);
  const formatTime = (time) => new Intl.DateTimeFormat(dateLocale, { hour: '2-digit', minute: '2-digit' }).format(time);

  const card = `${darkMode ? 'bg-[#12161f] border-slate-800' : 'bg-white border-slate-200'} border rounded-3xl p-5 shadow-xl`;
  const pill = (active) => `shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold transition ${active ? 'bg-amber-500 text-slate-950' : darkMode ? 'bg-slate-900 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}`;
  const changeColor = (value) => (value >= 0 ? 'text-emerald-400' : 'text-rose-400');
  const accent = darkMode ? 'text-amber-400' : 'text-amber-600';
  const notice = (positive) => (positive
    ? darkMode ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-800 bg-emerald-50 border-emerald-200'
    : darkMode ? 'text-amber-300 bg-amber-500/10 border-amber-500/20' : 'text-amber-800 bg-amber-50 border-amber-200');
  const statusColor = feed.status === 'live' ? 'text-emerald-400' : feed.status === 'offline' ? 'text-rose-400' : 'text-amber-400';
  const target = forecast?.path[horizon - 1];

  return (
    // data-localized keeps App's DOM text translator from rewriting these already-translated strings.
    <div data-localized className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-amber-400">{t.title}</h2>
          <p className="text-sm opacity-70 mt-1 max-w-2xl">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-bold">
          <span className={statusColor}>● {t.status[feed.status]}{feed.updatedAt && feed.status !== 'loading' ? ` · ${t.updated} ${formatTime(feed.updatedAt)}` : ''}</span>
          {(feed.status === 'offline' || feed.status === 'stale') && (
            <button type="button" onClick={() => setReloadKey((key) => key + 1)} className={`${accent} border border-amber-500/30 rounded-lg px-3 py-1.5`}>{t.retry}</button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {UNITS.map((option) => <button key={option} type="button" onClick={() => setUnit(option)} className={pill(unit === option)}>{t.units[option]}</button>)}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FORECAST_HORIZONS.map((option) => <button key={option} type="button" onClick={() => setHorizon(option)} className={pill(horizon === option)}>{t.days(option)}</button>)}
        </div>
      </div>

      {!ready && (
        <div className={`${card} text-center py-16`}>
          {feed.status === 'offline'
            ? <><p className="font-bold text-rose-400">{t.status.offline}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs">{t.retry}</button></>
            : <p className="text-sm opacity-60 animate-pulse">{t.status.loading}</p>}
        </div>
      )}

      {ready && forecast && signals && target && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={card}>
              <div className="text-xs opacity-60">{t.currentPrice}</div>
              <div className={`text-2xl font-black tabular-nums mt-2 break-all ${accent}`}>{formatPrice(signals.price)}</div>
              <div className="text-xs mt-1"><span className={`font-bold ${changeColor(signals.change1d)}`}>{formatPercent(signals.change1d)}</span> <span className="opacity-60">{t.today}</span></div>
              {formatLakh(signals.price) && <div className="text-[11px] opacity-60 mt-1">{formatLakh(signals.price)}</div>}
              {unit === 'mmk_kyattha' && Number.isFinite(mmkRate) && <div className="text-[11px] opacity-60 mt-1">1 USD = {mmkRate.toLocaleString('en-US', { maximumFractionDigits: 2 })} {t.kyat}</div>}
            </div>
            <div className={card}>
              <div className="text-xs opacity-60">{t.forecastIn(horizon)}</div>
              <div className="text-2xl font-black tabular-nums mt-2 break-all">{formatPrice(target.price)}</div>
              <div className="text-xs mt-1"><span className={`font-bold ${changeColor(target.price / signals.price - 1)}`}>{formatPercent(target.price / signals.price - 1)}</span> <span className="opacity-60">{t.vsToday}</span></div>
              {formatLakh(target.price) && <div className="text-[11px] opacity-60 mt-1">{formatLakh(target.price)}</div>}
            </div>
            <div className={card}>
              <div className="text-xs opacity-60">{t.likelyRange}</div>
              <div className="text-base font-black tabular-nums mt-2 leading-snug">{formatPrice(target.low80)}<span className="opacity-50"> – </span><br className="hidden lg:block" />{formatPrice(target.high80)}</div>
              <div className="text-[11px] opacity-60 mt-1">{t.rangeHint}</div>
            </div>
            <div className={card}>
              <div className="text-xs opacity-60">{t.chanceHigher}</div>
              <div className={`text-2xl font-black mt-2 ${target.chanceHigher >= 0.5 ? 'text-emerald-400' : 'text-rose-400'}`}>{Math.round(target.chanceHigher * 100)}%</div>
              <div className={`h-2 rounded-full mt-3 overflow-hidden ${darkMode ? 'bg-rose-500/30' : 'bg-rose-200'}`}>
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.round(target.chanceHigher * 100)}%` }} />
              </div>
            </div>
          </div>

          <div className={card}>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-1 mb-4">
              <div>
                <h3 className="font-black">{t.chartTitle}</h3>
                <p className="text-xs opacity-60 mt-1">{t.chartSubtitle}{unit === 'mmk_kyattha' || unit === 'thb_baht' ? ` ${t.convertedNote}` : ''}</p>
              </div>
            </div>
            <GoldChart
              history={candles.slice(-HISTORY_DAYS).map((candle) => ({ time: candle.time, price: candle.close }))}
              forecast={forecast.path.slice(0, horizon)}
              darkMode={darkMode}
              formatPrice={formatPrice}
              formatDate={formatDate}
              t={t}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={card}>
              <h3 className="font-black mb-4">{t.signalsTitle}</h3>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                {[
                  [t.trend, t.trendValues[signals.trend], signals.trend === 'up' ? 'text-emerald-400' : signals.trend === 'down' ? 'text-rose-400' : accent],
                  [t.momentum, `${signals.rsi.toFixed(0)} · ${t.momentumValues[signals.momentum]}`, signals.momentum === 'neutral' ? '' : accent],
                  [t.sma20, formatPrice(signals.sma20), ''],
                  [t.sma50, formatPrice(signals.sma50), ''],
                  [t.change7d, formatPercent(signals.change7d), changeColor(signals.change7d)],
                  [t.change30d, formatPercent(signals.change30d), changeColor(signals.change30d)],
                  [t.volatility, `${(signals.volatility * 100).toFixed(1)}%`, ''],
                ].map(([label, value, color]) => (
                  <div key={label} className={`rounded-2xl p-3 ${darkMode ? 'bg-slate-900/70' : 'bg-slate-50'}`}>
                    <dt className="opacity-60">{label}</dt>
                    <dd className={`font-black tabular-nums mt-1 text-sm ${color}`}>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className={card}>
              <h3 className="font-black mb-1">{t.accuracyTitle}</h3>
              {accuracy ? (
                <>
                  <p className="text-xs opacity-60 mb-4">{t.accuracyNote(accuracy.samples, horizon)}</p>
                  <dl className="grid grid-cols-2 gap-3 text-xs">
                    {[
                      [t.modelError, `${(accuracy.modelError * 100).toFixed(2)}%`, accuracy.modelError < accuracy.naiveError ? 'text-emerald-400' : accent],
                      [t.naiveError, `${(accuracy.naiveError * 100).toFixed(2)}%`, ''],
                      [t.directionHits, accuracy.directionAccuracy === null ? '—' : `${Math.round(accuracy.directionAccuracy * 100)}%`, ''],
                      [t.rangeCoverage, `${Math.round(accuracy.rangeCoverage * 100)}%`, ''],
                    ].map(([label, value, color]) => (
                      <div key={label} className={`rounded-2xl p-3 ${darkMode ? 'bg-slate-900/70' : 'bg-slate-50'}`}>
                        <dt className="opacity-60">{label}</dt>
                        <dd className={`font-black tabular-nums mt-1 text-sm ${color}`}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className={`text-xs mt-4 rounded-xl px-4 py-3 border ${notice(accuracy.modelError < accuracy.naiveError)}`}>
                    {accuracy.modelError < accuracy.naiveError ? t.beatsBaseline : t.losesBaseline}
                  </p>
                </>
              ) : <p className="text-xs opacity-60 mt-3">{t.notEnoughData}</p>}
            </div>
          </div>

          <div className={card}>
            <h3 className="font-black mb-4">{t.tableTitle}</h3>
            <div className="mobile-scroll-table overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="opacity-60">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">{t.columns.horizon}</th>
                    <th className="py-2 pr-3 font-semibold">{t.columns.date}</th>
                    <th className="py-2 pr-3 font-semibold">{t.columns.forecast}</th>
                    <th className="py-2 pr-3 font-semibold">{t.columns.range}</th>
                    <th className="py-2 font-semibold text-right">{t.columns.chance}</th>
                  </tr>
                </thead>
                <tbody>
                  {FORECAST_HORIZONS.map((option) => {
                    const point = forecast.path[option - 1];
                    return (
                      <tr
                        key={option}
                        onClick={() => setHorizon(option)}
                        className={`cursor-pointer border-t ${darkMode ? 'border-slate-800 hover:bg-slate-900/60' : 'border-slate-100 hover:bg-slate-50'} ${option === horizon ? accent : ''}`}
                      >
                        <td className="py-3 pr-3 font-bold">{t.days(option)}</td>
                        <td className="py-3 pr-3 opacity-80">{formatDate(point.time)}</td>
                        <td className="py-3 pr-3 tabular-nums font-bold">{formatPrice(point.price)} <span className={`font-normal ${changeColor(point.price / signals.price - 1)}`}>{formatPercent(point.price / signals.price - 1)}</span></td>
                        <td className="py-3 pr-3 tabular-nums opacity-80">{formatPrice(point.low80)} – {formatPrice(point.high80)}</td>
                        <td className="py-3 tabular-nums font-bold text-right">{Math.round(point.chanceHigher * 100)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {unit === 'mmk_kyattha' && (
            <div className={card}>
              <h3 className="font-black mb-4">{t.localTitle}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-xs opacity-80">
                  {t.fxRate}
                  <div className="flex gap-2 mt-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      value={mmkRateInput}
                      onChange={(event) => setMmkRateInput(event.target.value)}
                      placeholder={Number.isFinite(liveMmkRate) ? String(Math.round(liveMmkRate)) : ''}
                      className={`w-full ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'} border rounded-xl px-4 py-3 text-sm tabular-nums focus:outline-none focus:border-amber-500`}
                    />
                    <button type="button" onClick={() => setMmkRateInput('')} disabled={!mmkRateInput} className={`shrink-0 ${accent} border border-amber-500/30 rounded-xl px-3 text-xs font-bold disabled:opacity-40`}>{t.useLiveRate}</button>
                  </div>
                  <span className="block mt-1 opacity-60">{t.liveRate}: {Number.isFinite(liveMmkRate) ? liveMmkRate.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</span>
                </label>
                <div className="text-xs opacity-80">
                  {t.purity}
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {[[1, t.purityOptions.pe16], [15 / 16, t.purityOptions.pe15]].map(([value, label]) => (
                      <button key={label} type="button" onClick={() => setPurity(value)} className={`py-3 rounded-xl text-xs font-bold ${purity === value ? 'bg-amber-500 text-slate-950' : darkMode ? 'bg-slate-900 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-[11px] opacity-60 mt-4 leading-relaxed">{t.fxNote}</p>
            </div>
          )}

          <div className="text-[11px] leading-relaxed space-y-2">
            <p className="opacity-60">{t.sourceNote(feed.source)}</p>
            <p className={`border rounded-xl px-4 py-3 ${notice(false)}`}>{t.disclaimer}</p>
          </div>
        </>
      )}
    </div>
  );
}
