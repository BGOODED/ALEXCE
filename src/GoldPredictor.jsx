import React, { useEffect, useMemo, useState } from 'react';
import GoldChart from './GoldChart.jsx';
import { fetchGoldHistory, fetchKlines, fetchTicker, openBybitStream } from './bybitGold.js';
import { FORECAST_HORIZONS, MIN_HISTORY, backtest, buildForecast, marketSignals } from './goldForecast.js';

const dateLocales = { en: 'en-US', my: 'my-MM', th: 'th-TH-u-ca-gregory' };

const goldText = {
  en: {
    title: 'GOLD PRICE FORECAST',
    subtitle: 'Live Bybit TradFi gold price with a TradingView-style chart and a statistical forecast.',
    status: { loading: 'Loading Bybit prices…', live: 'Live', stale: 'Showing last loaded prices', offline: 'Bybit price feed offline' },
    stream: { connecting: 'Connecting…', live: 'Real-time', reconnecting: 'Reconnecting…' },
    retry: 'Retry',
    updated: 'Updated',
    marketType: { linear: 'TradFi Perpetual', spot: 'Spot' },
    ticker: { change24h: '24h change', high24h: '24h high', low24h: '24h low', markPrice: 'Mark price', indexPrice: 'Index (spot gold)', buySell: 'Buy / Sell', turnover24h: '24h turnover', fundingRate: 'Funding rate' },
    fallbackNotice: (symbol) => `Bybit XAUUSDT is unavailable right now, so this page is showing Bybit ${symbol}. Its price can differ from Bybit TradFi gold.`,
    mt5Note: 'Bybit TradFi’s MT5 symbol XAUUSD.s has no public price feed. XAUUSDT is Bybit’s gold TradFi perpetual on the public API and tracks the same spot gold, so the two usually differ by only a few dollars.',
    chart: {
      candles: 'Candles',
      line: 'Line',
      studies: { volume: 'Vol', ma20: 'MA 20', ma50: 'MA 50', bb: 'BB', rsi: 'RSI', forecast: 'Forecast' },
      reset: 'Reset',
      fullscreen: 'Full screen',
      exitFullscreen: 'Exit',
      hint: 'Scroll or pinch to zoom · drag to pan · drag an axis to stretch · double-click an axis to reset',
      forecastAhead: (duration) => `Forecast +${duration}`,
      predictionTitle: 'Price prediction',
      predictionSubtitle: (frame) => `From the ${frame} chart. Updates with every new candle.`,
      inLabel: (duration) => `In ${duration}`,
      up: 'Up',
      down: 'Down',
      chanceUp: 'Chance of rising',
      range80: '80% range',
      hitRate: (percent, samples) => `Direction right ${percent}% of the time over the last ${samples} candles`,
      notEnough: 'Needs at least 60 candles to predict.',
      loading: 'Loading chart…',
      error: 'Could not load Bybit chart data.',
    },
    legend: { forecast: 'Forecast' },
    forecastTitle: 'Forecast',
    forecastSubtitle: 'Based on Bybit daily closes.',
    lastPrice: 'Last price',
    days: (h) => (h === 1 ? '1 day' : `${h} days`),
    forecastIn: (h) => `Forecast in ${h === 1 ? '1 day' : `${h} days`}`,
    vsToday: 'vs today',
    likelyRange: 'Likely range (80%)',
    rangeHint: '8 in 10 chance the price ends inside',
    chanceHigher: 'Chance of ending higher',
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
    sourceNote: (symbol, name) => `Prices: Bybit ${symbol} (${name}) public market data — REST for history, WebSocket for live updates. Chart by TradingView Lightweight Charts.`,
    disclaimer: 'Forecasts are statistical estimates from past prices only (damped-trend smoothing on log prices, with ranges from recent volatility). They cannot foresee news or central-bank decisions, are not financial advice, and gold can move outside these ranges.',
  },
  my: {
    title: 'ရွှေစျေး ခန့်မှန်းချက်',
    subtitle: 'Bybit TradFi ရွှေစျေး တိုက်ရိုက်၊ TradingView ပုံစံ ဇယားနှင့် စာရင်းအင်းနည်းဖြင့် ခန့်မှန်းချက်။',
    status: { loading: 'Bybit စျေးနှုန်းများ ရယူနေသည်…', live: 'တိုက်ရိုက်', stale: 'နောက်ဆုံးရရှိထားသော စျေးနှုန်းများကို ပြသနေသည်', offline: 'Bybit စျေးနှုန်းဒေတာ ချိတ်ဆက်၍မရပါ' },
    stream: { connecting: 'ချိတ်ဆက်နေသည်…', live: 'အချိန်နှင့်တပြေးညီ', reconnecting: 'ပြန်လည်ချိတ်ဆက်နေသည်…' },
    retry: 'ထပ်ကြိုးစားရန်',
    updated: 'အပ်ဒိတ်',
    marketType: { linear: 'TradFi Perpetual', spot: 'Spot' },
    ticker: { change24h: '၂၄ နာရီ ပြောင်းလဲမှု', high24h: '၂၄ နာရီ အမြင့်ဆုံး', low24h: '၂၄ နာရီ အနိမ့်ဆုံး', markPrice: 'Mark စျေး', indexPrice: 'Index (spot ရွှေစျေး)', buySell: 'Buy / Sell (ဝယ် / ရောင်း)', turnover24h: '၂၄ နာရီ အရောင်းအဝယ်တန်ဖိုး', fundingRate: 'Funding နှုန်း' },
    fallbackNotice: (symbol) => `Bybit XAUUSDT ကို ယခု ရယူ၍မရသဖြင့် Bybit ${symbol} ကို ပြသနေသည်။ ၎င်း၏စျေးသည် Bybit TradFi ရွှေစျေးနှင့် ကွာခြားနိုင်သည်။`,
    mt5Note: 'Bybit TradFi ၏ MT5 သင်္ကေတ XAUUSD.s အတွက် အများသုံး စျေးနှုန်း API မရှိပါ။ XAUUSDT သည် Bybit ၏ အများသုံး API ပေါ်ရှိ ရွှေ TradFi perpetual ဖြစ်ပြီး spot ရွှေစျေးကို လိုက်သောကြောင့် နှစ်ခုကြား ဒေါ်လာ အနည်းငယ်သာ ကွာလေ့ရှိသည်။',
    chart: {
      candles: 'Candle',
      line: 'Line',
      studies: { volume: 'Vol', ma20: 'MA 20', ma50: 'MA 50', bb: 'BB', rsi: 'RSI', forecast: 'ခန့်မှန်း' },
      reset: 'ပြန်ညှိ',
      fullscreen: 'မျက်နှာပြင်အပြည့်',
      exitFullscreen: 'ထွက်ရန်',
      hint: 'ချဲ့/ချုံ့ရန် scroll လုပ်ပါ သို့မဟုတ် လက်နှစ်ချောင်းဖြင့် ဆွဲပါ · ဘေးတိုက်ရွှေ့ရန် ဆွဲပါ · ဝင်ရိုးကို ဆွဲ၍ ဆန့်နိုင်သည် · မူလအတိုင်းပြန်ရန် ဝင်ရိုးကို နှစ်ချက်နှိပ်ပါ',
      forecastAhead: (duration) => `${duration} အကြာ ခန့်မှန်းစျေး`,
      predictionTitle: 'စျေး ကြိုတင်ခန့်မှန်းချက်',
      predictionSubtitle: (frame) => `${frame} ဇယားမှ တွက်ထားသည်။ Candle အသစ်ပေါ်တိုင်း ပြန်တွက်သည်။`,
      inLabel: (duration) => `${duration} အကြာ`,
      up: 'တက်',
      down: 'ကျ',
      chanceUp: 'တက်နိုင်ခြေ',
      range80: '၈၀% အပိုင်းအခြား',
      hitRate: (percent, samples) => `နောက်ဆုံး candle ${samples} ခုတွင် အတက်/အကျ ${percent}% မှန်ခဲ့သည်`,
      notEnough: 'ခန့်မှန်းရန် candle အနည်းဆုံး ၆၀ လိုသည်။',
      loading: 'ဇယား ဖွင့်နေသည်…',
      error: 'Bybit ဇယားဒေတာ ရယူ၍မရပါ။',
    },
    legend: { forecast: 'ခန့်မှန်းချက်' },
    forecastTitle: 'ခန့်မှန်းချက်',
    forecastSubtitle: 'Bybit နေ့စဉ် ပိတ်စျေးများကို အခြေခံထားသည်။',
    lastPrice: 'နောက်ဆုံးစျေး',
    days: (h) => `${h} ရက်`,
    forecastIn: (h) => `${h} ရက်အကြာ ခန့်မှန်းစျေး`,
    vsToday: 'ယနေ့စျေးနှင့် နှိုင်းယှဉ်လျှင်',
    likelyRange: 'ဖြစ်နိုင်ခြေရှိသော အပိုင်းအခြား (၈၀%)',
    rangeHint: '၁၀ ကြိမ်တွင် ၈ ကြိမ် ဤအပိုင်းအခြားအတွင်း ရှိနိုင်သည်',
    chanceHigher: 'စျေးတက်နိုင်ခြေ',
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
    sourceNote: (symbol, name) => `စျေးနှုန်းရင်းမြစ်: Bybit ${symbol} (${name}) အများသုံး စျေးကွက်ဒေတာ — မှတ်တမ်းအတွက် REST၊ တိုက်ရိုက်စျေးအတွက် WebSocket။ ဇယားကို TradingView Lightweight Charts ဖြင့် ပြသထားသည်။`,
    disclaimer: 'ခန့်မှန်းချက်များသည် ယခင်စျေးနှုန်းများကိုသာ အခြေခံသော စာရင်းအင်းဆိုင်ရာ ခန့်မှန်းချက်များ ဖြစ်သည် (log စျေးနှုန်းအပေါ် damped-trend smoothing နှင့် မကြာသေးမီ အတက်အကျနှုန်းမှ အပိုင်းအခြားများ)။ သတင်းများ သို့မဟုတ် ဗဟိုဘဏ်ဆုံးဖြတ်ချက်များကို ကြိုမမြင်နိုင်ပါ၊ ငွေကြေးဆိုင်ရာ အကြံဉာဏ် မဟုတ်ပါ၊ ရွှေစျေးသည် ဤအပိုင်းအခြားများ ပြင်ပသို့ ရောက်နိုင်ပါသည်။',
  },
  th: {
    title: 'พยากรณ์ราคาทองคำ',
    subtitle: 'ราคาทองคำสดจาก Bybit TradFi พร้อมกราฟสไตล์ TradingView และการพยากรณ์เชิงสถิติ',
    status: { loading: 'กำลังโหลดราคา Bybit…', live: 'สด', stale: 'แสดงราคาที่โหลดล่าสุด', offline: 'เชื่อมต่อแหล่งราคา Bybit ไม่ได้' },
    stream: { connecting: 'กำลังเชื่อมต่อ…', live: 'เรียลไทม์', reconnecting: 'กำลังเชื่อมต่อใหม่…' },
    retry: 'ลองอีกครั้ง',
    updated: 'อัปเดต',
    marketType: { linear: 'TradFi Perpetual', spot: 'Spot' },
    ticker: { change24h: 'เปลี่ยนแปลง 24 ชม.', high24h: 'สูงสุด 24 ชม.', low24h: 'ต่ำสุด 24 ชม.', markPrice: 'ราคา Mark', indexPrice: 'Index (ทองสปอต)', buySell: 'Buy / Sell', turnover24h: 'มูลค่าซื้อขาย 24 ชม.', fundingRate: 'Funding rate' },
    fallbackNotice: (symbol) => `ขณะนี้ดึง Bybit XAUUSDT ไม่ได้ จึงแสดง Bybit ${symbol} แทน ราคาอาจต่างจากทองคำ Bybit TradFi`,
    mt5Note: 'สัญลักษณ์ MT5 ของ Bybit TradFi (XAUUSD.s) ไม่มีแหล่งราคาสาธารณะ XAUUSDT คือสัญญา TradFi perpetual ทองคำของ Bybit บน API สาธารณะ ซึ่งอ้างอิงทองคำสปอตเดียวกัน ราคาจึงมักต่างกันเพียงไม่กี่ดอลลาร์',
    chart: {
      candles: 'แท่งเทียน',
      line: 'เส้น',
      studies: { volume: 'Vol', ma20: 'MA 20', ma50: 'MA 50', bb: 'BB', rsi: 'RSI', forecast: 'พยากรณ์' },
      reset: 'รีเซ็ต',
      fullscreen: 'เต็มจอ',
      exitFullscreen: 'ออก',
      hint: 'เลื่อนหรือจีบนิ้วเพื่อซูม · ลากเพื่อเลื่อน · ลากแกนเพื่อยืด · ดับเบิลคลิกที่แกนเพื่อรีเซ็ต',
      forecastAhead: (duration) => `พยากรณ์ +${duration}`,
      predictionTitle: 'คาดการณ์ราคาล่วงหน้า',
      predictionSubtitle: (frame) => `คำนวณจากกราฟ ${frame} อัปเดตทุกแท่งเทียนใหม่`,
      inLabel: (duration) => `อีก ${duration}`,
      up: 'ขึ้น',
      down: 'ลง',
      chanceUp: 'โอกาสขึ้น',
      range80: 'ช่วง 80%',
      hitRate: (percent, samples) => `ทายทิศทางถูก ${percent}% ใน ${samples} แท่งล่าสุด`,
      notEnough: 'ต้องมีอย่างน้อย 60 แท่งเพื่อคาดการณ์',
      loading: 'กำลังโหลดกราฟ…',
      error: 'โหลดข้อมูลกราฟ Bybit ไม่ได้',
    },
    legend: { forecast: 'พยากรณ์' },
    forecastTitle: 'การพยากรณ์',
    forecastSubtitle: 'คำนวณจากราคาปิดรายวันของ Bybit',
    lastPrice: 'ราคาล่าสุด',
    days: (h) => `${h} วัน`,
    forecastIn: (h) => `พยากรณ์อีก ${h} วัน`,
    vsToday: 'เทียบกับวันนี้',
    likelyRange: 'ช่วงที่น่าจะเป็น (80%)',
    rangeHint: 'มีโอกาส 8 ใน 10 ที่ราคาจะอยู่ในช่วงนี้',
    chanceHigher: 'โอกาสที่ราคาจะสูงขึ้น',
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
    sourceNote: (symbol, name) => `ราคา: ข้อมูลตลาดสาธารณะของ Bybit ${symbol} (${name}) — REST สำหรับข้อมูลย้อนหลัง, WebSocket สำหรับราคาสด กราฟโดย TradingView Lightweight Charts`,
    disclaimer: 'การพยากรณ์เป็นการประมาณการทางสถิติจากราคาในอดีตเท่านั้น (damped-trend smoothing บน log ราคา พร้อมช่วงจากความผันผวนล่าสุด) ไม่สามารถคาดการณ์ข่าวหรือการตัดสินใจของธนาคารกลางได้ ไม่ใช่คำแนะนำทางการเงิน และราคาทองคำอาจเคลื่อนไหวนอกช่วงเหล่านี้',
  },
};

const formatUsd = (value) => (Number.isFinite(value) ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const formatPlain = (value) => (Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const formatPercent = (value, digits = 2) => (Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%` : '—');
const formatCompact = (value) => (Number.isFinite(value) ? value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 }) : '—');

export default function GoldPredictor({ darkMode, language }) {
  const t = goldText[language] || goldText.en;
  const [feed, setFeed] = useState({ status: 'loading', market: null, candles: [], updatedAt: null });
  const [ticker, setTicker] = useState({});
  const [streamStatus, setStreamStatus] = useState('connecting');
  const [reloadKey, setReloadKey] = useState(0);
  const [horizon, setHorizon] = useState(7);

  // Daily history: picks the Bybit market once, then refreshes it every minute.
  useEffect(() => {
    const controller = new AbortController();
    let market = null;
    const load = async () => {
      try {
        const result = market
          ? { market, candles: await fetchKlines(market, 'D', { limit: 400, signal: controller.signal }) }
          : await fetchGoldHistory(controller.signal);
        market = result.market;
        setFeed({ status: 'live', market, candles: result.candles, updatedAt: Date.now() });
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

  // Live ticker: WebSocket for real-time updates, REST polling as a backstop.
  const { market, candles } = feed;
  const marketKey = market ? `${market.category}:${market.symbol}` : '';
  useEffect(() => {
    if (!market) return undefined;
    const controller = new AbortController();
    const merge = (data) => setTicker((previous) => ({ ...previous, ...data }));
    setTicker({});
    const poll = () => fetchTicker(market, controller.signal).then(merge).catch(() => {});
    poll();
    const pollTimer = setInterval(poll, 15000);
    const closeStream = openBybitStream(market.category, [`tickers.${market.symbol}`], {
      onMessage: (message) => {
        if (message.type === 'ticker') merge(message.ticker);
      },
      onStatus: setStreamStatus,
    });
    return () => {
      controller.abort();
      clearInterval(pollTimer);
      closeStream();
    };
  }, [marketKey]);

  const ready = candles.length >= MIN_HISTORY;
  const forecast = useMemo(() => (ready ? buildForecast(candles, 30) : null), [candles, ready]);
  const signals = useMemo(() => (ready ? marketSignals(candles) : null), [candles, ready]);
  const accuracy = useMemo(() => (ready ? backtest(candles, horizon) : null), [candles, horizon, ready]);

  const dateLocale = dateLocales[language] || dateLocales.en;
  const formatDate = (time) => new Intl.DateTimeFormat(dateLocale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(time);
  const formatTime = (time) => new Intl.DateTimeFormat(dateLocale, { hour: '2-digit', minute: '2-digit' }).format(time);

  const card = `${darkMode ? 'bg-[#12161f] border-slate-800' : 'bg-white border-slate-200'} border rounded-3xl p-5 shadow-xl`;
  const tile = `rounded-2xl p-3 ${darkMode ? 'bg-slate-900/70' : 'bg-slate-50'}`;
  const pill = (active) => `shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold transition ${active ? 'bg-amber-500 text-slate-950' : darkMode ? 'bg-slate-900 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}`;
  const changeColor = (value) => (value >= 0 ? 'text-emerald-400' : 'text-rose-400');
  const accent = darkMode ? 'text-amber-400' : 'text-amber-600';
  const notice = (positive) => (positive
    ? darkMode ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-800 bg-emerald-50 border-emerald-200'
    : darkMode ? 'text-amber-300 bg-amber-500/10 border-amber-500/20' : 'text-amber-800 bg-amber-50 border-amber-200');
  const statusColor = feed.status === 'live' ? 'text-emerald-400' : feed.status === 'offline' ? 'text-rose-400' : 'text-amber-400';

  const lastPrice = ticker.lastPrice ?? signals?.price;
  const target = forecast?.path[horizon - 1];
  const tickerStats = market ? [
    [t.ticker.high24h, formatPlain(ticker.high24h)],
    [t.ticker.low24h, formatPlain(ticker.low24h)],
    ...(market.category === 'linear' ? [[t.ticker.markPrice, formatPlain(ticker.markPrice)], [t.ticker.indexPrice, formatPlain(ticker.indexPrice)]] : []),
    // Same order as the Bybit app: Buy is the ask, Sell is the bid.
    [t.ticker.buySell, `${formatPlain(ticker.ask)} / ${formatPlain(ticker.bid)}`],
    [t.ticker.turnover24h, `${formatCompact(ticker.turnover24h)} USDT`],
    ...(market.category === 'linear' ? [[t.ticker.fundingRate, Number.isFinite(ticker.fundingRate) ? `${(ticker.fundingRate * 100).toFixed(4)}%` : '—']] : []),
  ] : [];

  return (
    // data-localized keeps App's DOM text translator from rewriting these already-translated strings.
    <div data-localized className="max-w-7xl mx-auto space-y-6">
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

      {!market && (
        <div className={`${card} text-center py-16`}>
          {feed.status === 'offline'
            ? <><p className="font-bold text-rose-400">{t.status.offline}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs">{t.retry}</button></>
            : <p className="text-sm opacity-60 animate-pulse">{t.status.loading}</p>}
        </div>
      )}

      {market && (
        <>
          <div className={card}>
            <div className="flex flex-col xl:flex-row xl:items-center gap-5">
              <div className="flex items-center gap-4 shrink-0">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center text-slate-950 font-black">Au</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black">{market.symbol}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500">Bybit · {t.marketType[market.category]}</span>
                  </div>
                  <div className="text-xs opacity-60">{market.name}</div>
                </div>
              </div>
              <div className="shrink-0">
                <div className={`text-3xl font-black tabular-nums ${accent}`}>{formatPlain(lastPrice)} <span className="text-xs font-bold opacity-60">USDT</span></div>
                <div className="text-xs mt-0.5 flex items-center gap-2">
                  <span className={`font-bold ${changeColor(ticker.change24h)}`}>{formatPercent(ticker.change24h)}</span>
                  <span className="opacity-60">{t.ticker.change24h}</span>
                  <span className={`font-bold ${streamStatus === 'live' ? 'text-emerald-400' : 'text-amber-400'}`}>● {t.stream[streamStatus]}</span>
                </div>
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-xs flex-1">
                {tickerStats.map(([label, value]) => (
                  <div key={label}>
                    <dt className="opacity-60">{label}</dt>
                    <dd className="font-bold tabular-nums mt-0.5">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {!market.primary && <p className={`text-xs mt-4 rounded-xl px-4 py-3 border ${notice(false)}`}>{t.fallbackNotice(market.symbol)}</p>}
            <p className="text-[11px] opacity-60 mt-4 leading-relaxed">{t.mt5Note}</p>
          </div>

          <GoldChart market={market} darkMode={darkMode} t={t} dateLocale={dateLocale} />
        </>
      )}

      {ready && forecast && signals && target && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-2">
            <div>
              <h3 className="text-xl font-black">{t.forecastTitle}</h3>
              <p className="text-xs opacity-60 mt-1">{t.forecastSubtitle}</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {FORECAST_HORIZONS.map((option) => <button key={option} type="button" onClick={() => setHorizon(option)} className={pill(horizon === option)}>{t.days(option)}</button>)}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={card}>
              <div className="text-xs opacity-60">{t.lastPrice}</div>
              <div className={`text-2xl font-black tabular-nums mt-2 break-all ${accent}`}>{formatUsd(lastPrice)}</div>
              <div className="text-xs mt-1"><span className={`font-bold ${changeColor(ticker.change24h)}`}>{formatPercent(ticker.change24h)}</span> <span className="opacity-60">{t.ticker.change24h}</span></div>
            </div>
            <div className={card}>
              <div className="text-xs opacity-60">{t.forecastIn(horizon)}</div>
              <div className="text-2xl font-black tabular-nums mt-2 break-all">{formatUsd(target.price)}</div>
              <div className="text-xs mt-1"><span className={`font-bold ${changeColor(target.price / signals.price - 1)}`}>{formatPercent(target.price / signals.price - 1)}</span> <span className="opacity-60">{t.vsToday}</span></div>
            </div>
            <div className={card}>
              <div className="text-xs opacity-60">{t.likelyRange}</div>
              <div className="text-base font-black tabular-nums mt-2 leading-snug">{formatUsd(target.low80)}<span className="opacity-50"> – </span><br className="hidden lg:block" />{formatUsd(target.high80)}</div>
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={card}>
              <h3 className="font-black mb-4">{t.signalsTitle}</h3>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                {[
                  [t.trend, t.trendValues[signals.trend], signals.trend === 'up' ? 'text-emerald-400' : signals.trend === 'down' ? 'text-rose-400' : accent],
                  [t.momentum, `${signals.rsi.toFixed(0)} · ${t.momentumValues[signals.momentum]}`, signals.momentum === 'neutral' ? '' : accent],
                  [t.sma20, formatUsd(signals.sma20), ''],
                  [t.sma50, formatUsd(signals.sma50), ''],
                  [t.change7d, formatPercent(signals.change7d), changeColor(signals.change7d)],
                  [t.change30d, formatPercent(signals.change30d), changeColor(signals.change30d)],
                  [t.volatility, `${(signals.volatility * 100).toFixed(1)}%`, ''],
                ].map(([label, value, color]) => (
                  <div key={label} className={tile}>
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
                      <div key={label} className={tile}>
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
                        <td className="py-3 pr-3 tabular-nums font-bold">{formatUsd(point.price)} <span className={`font-normal ${changeColor(point.price / signals.price - 1)}`}>{formatPercent(point.price / signals.price - 1)}</span></td>
                        <td className="py-3 pr-3 tabular-nums opacity-80">{formatUsd(point.low80)} – {formatUsd(point.high80)}</td>
                        <td className="py-3 tabular-nums font-bold text-right">{Math.round(point.chanceHigher * 100)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-[11px] leading-relaxed space-y-2">
            <p className="opacity-60">{t.sourceNote(market.symbol, market.name)}</p>
            <p className={`border rounded-xl px-4 py-3 ${notice(false)}`}>{t.disclaimer}</p>
          </div>
        </>
      )}
    </div>
  );
}
