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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function calculateRsi(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length <= period) {
    return null;
  }

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1];

    if (change > 0) {
      gainSum += change;
    } else if (change < 0) {
      lossSum += Math.abs(change);
    }
  }

  let averageGain = gainSum / period;
  let averageLoss = lossSum / period;

  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    averageGain = ((averageGain * (period - 1)) + gain) / period;
    averageLoss = ((averageLoss * (period - 1)) + loss) / period;
  }

  if (averageGain === 0 && averageLoss === 0) {
    return 50;
  }

  if (averageLoss === 0) {
    return 100;
  }

  if (averageGain === 0) {
    return 0;
  }

  const relativeStrength = averageGain / averageLoss;
  const rsi = 100 - (100 / (1 + relativeStrength));

  return round(rsi);
}

function getRsiState(rsi) {
  if (rsi === null) {
    return "unavailable";
  }

  if (rsi >= 70) {
    return "overbought";
  }

  if (rsi <= 30) {
    return "oversold";
  }

  return "neutral";
}

function calculateEma(values, period) {
  if (!Array.isArray(values) || values.length < period) {
    return null;
  }

  const seedValues = values.slice(0, period);

  let ema =
    seedValues.reduce((sum, value) => sum + value, 0) / period;

  const multiplier = 2 / (period + 1);

  for (let i = period; i < values.length; i += 1) {
    ema = ((values[i] - ema) * multiplier) + ema;
  }

  return round(ema);
}

function getEmaTrend(ema20, ema50) {
  if (ema20 === null || ema50 === null || ema50 === 0) {
    return "neutral";
  }

  const differencePercent =
    Math.abs(((ema20 - ema50) / ema50) * 100);

  if (differencePercent < 0.05) {
    return "neutral";
  }

  return ema20 > ema50 ? "bullish" : "bearish";
}

function calculateTechnicalScore(rsi14, ema20, ema50, emaTrend) {
  if (
    rsi14 === null ||
    ema20 === null ||
    ema50 === null ||
    ema50 === 0
  ) {
    return {
      technicalScore: null,
      technicalLevel: "unavailable",
    };
  }

  const emaSeparationPercent =
    Math.abs(((ema20 - ema50) / ema50) * 100);

  const emaScore = emaTrend === "neutral"
    ? 10
    : clamp(20 + (emaSeparationPercent / 0.5) * 40, 20, 60);

  let rsiScore = 0;

  if (emaTrend === "bullish") {
    rsiScore = clamp(40 - Math.abs(rsi14 - 60) * 2, 0, 40);
  } else if (emaTrend === "bearish") {
    rsiScore = clamp(40 - Math.abs(rsi14 - 40) * 2, 0, 40);
  } else {
    rsiScore = clamp(20 - Math.abs(rsi14 - 50), 0, 20);
  }

  const technicalScore = round(
    clamp(emaScore + rsiScore, 0, 100)
  );

  let technicalLevel = "low";

  if (technicalScore >= 70) {
    technicalLevel = "high";
  } else if (technicalScore >= 40) {
    technicalLevel = "medium";
  }

  return {
    technicalScore,
    technicalLevel,
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

    const closes = candles.map((candle) => candle.close);

    const rsi14 = calculateRsi(closes, 14);
    const ema20 = calculateEma(closes, 20);
    const ema50 = calculateEma(closes, 50);
    const emaTrend = getEmaTrend(ema20, ema50);

    const technical = calculateTechnicalScore(
      rsi14,
      ema20,
      ema50,
      emaTrend
    );

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
      indicators: {
        rsi14,
        rsiState: getRsiState(rsi14),
        ema20,
        ema50,
        emaTrend,
        technicalScore: technical.technicalScore,
        technicalLevel: technical.technicalLevel,
      },
      technicalScoreModel: "rsi14-ema20-ema50-v1",
      indicatorNote:
        "Technical Score is a market-filtering heuristic based on RSI and EMA alignment, not a trading recommendation or profit guarantee.",
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
