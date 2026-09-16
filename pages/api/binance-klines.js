const ALLOWED_INTERVALS = new Set([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
]);

function normalizeCandle(item) {
  return {
    openTime: item[0],
    open: Number(item[1]),
    high: Number(item[2]),
    low: Number(item[3]),
    close: Number(item[4]),
    volume: Number(item[5]),
    closeTime: item[6],
    quoteVolume: Number(item[7]),
    tradeCount: item[8],
    takerBuyBaseVolume: Number(item[9]),
    takerBuyQuoteVolume: Number(item[10]),
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);

    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  const symbol = String(req.query.symbol || "BTCUSDT")
    .toUpperCase()
    .trim();

  const interval = String(req.query.interval || "15m").trim();
  const requestedLimit = Number(req.query.limit || 100);

  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid symbol format",
    });
  }

  if (!ALLOWED_INTERVALS.has(interval)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid interval",
      allowedIntervals: Array.from(ALLOWED_INTERVALS),
    });
  }

  if (
    !Number.isInteger(requestedLimit) ||
    requestedLimit < 20 ||
    requestedLimit > 500
  ) {
    return res.status(400).json({
      ok: false,
      error: "Limit must be an integer between 20 and 500",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const params = new URLSearchParams({
      symbol,
      interval,
      limit: String(requestedLimit),
    });

    const url =
      `https://data-api.binance.vision/api/v3/klines?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        source: "Binance",
        symbol,
        interval,
        error: data?.msg || "Binance request failed",
        code: data?.code ?? null,
      });
    }

    const candles = Array.isArray(data)
      ? data.map(normalizeCandle)
      : [];

    res.setHeader(
      "Cache-Control",
      "s-maxage=10, stale-while-revalidate=20"
    );

    return res.status(200).json({
      ok: true,
      source: "Binance",
      market: "spot",
      symbol,
      interval,
      count: candles.length,
      candles,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const isTimeout = error?.name === "AbortError";

    return res.status(502).json({
      ok: false,
      source: "Binance",
      symbol,
      interval,
      error: isTimeout
        ? "Binance request timed out"
        : "Unable to fetch Binance candlestick data",
    });
  } finally {
    clearTimeout(timeout);
  }
}
