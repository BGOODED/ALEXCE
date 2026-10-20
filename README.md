# ALEXCE

## Google Calendar

To enable the **Add to Google Calendar** button, create a Google OAuth 2.0 Web client, enable the Google Calendar API, and add your local and production URLs as authorized JavaScript origins. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CALENDAR_CLIENT_ID`. The app requests only the `calendar.events` scope when the user clicks the button.

## Gold price forecast

The **GOLD / ရွှေစျေး** tab (`src/GoldPredictor.jsx`) shows the live world gold price with a short-term forecast:

- **Data**: daily PAX Gold (PAXG/USDT) candles from Binance, falling back to Binance's public data endpoint and then Bybit. PAXG is backed by one troy ounce of gold per token and tracks XAU/USD closely. No API key is needed.
- **Model** (`src/goldForecast.js`): damped-trend Holt smoothing on log prices, with 80% / 95% ranges from recent volatility. A rolling backtest compares the model with a "no change" guess, and the page shows that comparison next to the forecast.
- **Units**: USD per ounce or gram, MMK per tical (ကျပ်သား, 16.33 g, 16 or 15 ပဲရည်) with an editable exchange rate, and THB per baht-weight (96.5%).
- **Tests**: `npm test` runs the model tests with Node's built-in test runner.
