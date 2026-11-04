# Dashboard Signal Scanner

The Trading Dashboard's Quick Access section includes a signal-only scanner for
NIFTY 50 equities and supported index instruments. It uses the OpenAlgo broker
session already connected to the account and does not place orders.

## Run the scanner

1. Sign in to OpenAlgo and connect the broker from the normal Broker page.
2. Open **Dashboard** and find **BUY / SELL Signal Scanner** under **Quick Access**.
3. Optionally adjust the timeframe, ATR multiplier, or ATR period while the
   scanner is stopped. Defaults are `15m`, `3.65`, and `10`.
4. Select **Start Scanner**. The scanner runs as a child process managed by
   OpenAlgo's Python Strategy Host and checks completed candles during market
   hours. Select **Stop Scanner** to turn it off.
5. Select **Enable notifications** and allow notifications in the browser.
   The signal list is saved in OpenAlgo; browser notifications are delivered
   only while the dashboard is open.

The scanner calculates Heikin-Ashi OHLC4, an RMA ATR loss, and the trailing
stop and crossover rules from the user's SP Bot Python strategy. Its outputs
are BUY/SELL notifications with symbol, exchange, timeframe, candle time, and
price. A symbol or index not available from the connected broker is skipped
and counted as unavailable in the last-scan status.

The symbol universe is a curated 50-stock NIFTY list plus NIFTY, BANKNIFTY,
FINNIFTY, MIDCPNIFTY, and SENSEX where the broker supports those index
exchanges. Since index constituents can change, operators should update the
scanner's symbol list when the official NIFTY 50 constituents change.

## Safety and limitations

- Signals are informational; they are not orders and do not change positions.
- The scanner reads historical bars from the existing broker session. Broker
  history support and rate limits determine whether each instrument can be
  checked.
- Signal history is retained for 14 days and capped at 10,000 events per account.
- Settings can only be changed while the scanner is stopped; save settings and
  start the scanner again to use them.
- Running the scanner requires a connected broker, ready master contracts,
  and the OpenAlgo API key injected by the Python Strategy Host.
