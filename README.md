# ALEXCE

## Google Calendar

To enable the **Add to Google Calendar** button, create a Google OAuth 2.0 Web client, enable the Google Calendar API, and add your local and production URLs as authorized JavaScript origins. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CALENDAR_CLIENT_ID`. The app requests only the `calendar.events` scope when the user clicks the button.

## Gold price forecast

The **GOLD / ရွှေစျေး** tab (`src/GoldPredictor.jsx`) shows the live Bybit gold price, a TradingView-style chart and a short-term forecast:

- **Data** (`src/bybitGold.js`): Bybit's public v5 API, no key needed. The primary market is `XAUUSDT`, Bybit's gold TradFi perpetual: REST for history, WebSocket for live ticks. Bybit TradFi's MT5 CFD symbol `XAUUSD.s` has no public price API, so it can't be shown directly; `XAUUSDT` tracks the same spot gold. If `XAUUSDT` is unavailable, the page falls back to Bybit's spot gold tokens and labels them.
- **Chart** (`src/GoldChart.jsx`): [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) with candles or line, 1m–1W timeframes, volume, MA 20/50, Bollinger Bands, RSI, the forecast overlay on 1D, zoom/pan, full-screen mode, and older history loaded as you scroll left.
- **Model** (`src/goldForecast.js`): damped-trend Holt smoothing on log daily closes, with 80% / 95% ranges from recent volatility. A rolling backtest compares the model with a "no change" guess, and the page shows that comparison next to the forecast.
- **Tests**: `npm test` runs the model, indicator and Bybit client tests with Node's built-in test runner.
