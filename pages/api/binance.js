const DEFAULT_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function calculateOpportunity(ticker) {
  const price = Number(ticker.price);
  const openPrice = Number(ticker.openPrice);
  const highPrice = Number(ticker.highPrice);
  const lowPrice = Number(ticker.lowPrice);
  const quoteVolume = Number(ticker.quoteVolume);
  const priceChangePercent = Number(ticker.priceChangePercent);

  const absoluteMomentum = Math.abs(priceChangePercent);
  const momentumScore = clamp(absoluteMomentum * 8, 0, 40);

  const liquidityScore = quoteVolume > 0
    ? clamp(((Math.log10(quoteVolume) - 6) / 4) * 30, 0, 30)
    : 0;

  const rangeSize = highPrice - lowPrice;
  const rangePosition = rangeSize > 0
    ? clamp(((price - lowPrice) / rangeSize) * 100, 0, 100)
    : 50;

  let trendBias = "neutral";

  if (priceChangePercent >= 0.5) {
    trendBias = "bullish";
  } else if (priceChangePercent <= -0.5) {
    trendBias = "bearish";
  }

  let positionStrength = 0;

  if (trendBias === "bullish") {
    positionStrength = rangePosition;
  } else if (trendBias === "bearish") {
    positionStrength = 100 - rangePosition;
  } else {
    positionStrength = 25;
  }

  const positionScore = clamp((positionStrength / 100) * 30, 0, 30);

  const opportunityScore = clamp(
    momentumScore + liquidityScore + positionScore,
    0,
    100
  );

  let opportunityLevel = "low";

  if (opportunityScore >= 75) {
    opportunityLevel = "high";
  } else if (opportunityScore >= 55) {
    opportunityLevel = "medium";
  }

  const intradayRangePercent = openPrice > 0
    ? ((highPrice - lowPrice) / openPrice) * 100
    : 0;

  return {
    opportunityScore: round(opportunityScore),
    opportunityLevel,
    trendBias,
    metrics: {
      momentumScore: round(momentumScore),
      liquidityScore: round(liquidityScore),
      positionScore: round(positionScore),
      rangePositionPercent: round(rangePosition),
      intradayRangePercent: round(intradayRangePercent),
    },
  };
}

function normalizeTicker(data) {
  const ticker = {
    symbol: data.symbol,
    price: Number(data.lastPrice),
    priceChange: Number(data.priceChange),
    priceChangePercent: Number(data.priceChangePercent),
    weightedAveragePrice: Number(data.weightedAvgPrice),
    openPrice: Number(data.openPrice),
    highPrice: Number(data.highPrice),
    lowPrice: Number(data.lowPrice),
    baseVolume: Number(data.volume),
    quoteVolume: Number(data.quoteVolume),
    tradeCount: data.count,
    openTime: data.openTime,
    closeTime: data.closeTime,
  };

  return {
    ...ticker,
    ...calculateOpportunity(ticker),
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

  const requestedSymbol = req.query.symbol
    ? String(req.query.symbol).toUpperCase().trim()
    : null;

  if (requestedSymbol && !/^[A-Z0-9]{5,20}$/.test(requestedSymbol)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid symbol format",
    });
  }

  const symbols = requestedSymbol ? [requestedSymbol] : DEFAULT_SYMBOLS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const params = new URLSearchParams();

    if (symbols.length === 1) {
      params.set("symbol", symbols[0]);
    } else {
      params.set("symbols", JSON.stringify(symbols));
    }

    const url =
      `https://data-api.binance.vision/api/v3/ticker/24hr?${params.toString()}`;

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
        symbols,
        error: data?.msg || "Binance request failed",
        code: data?.code ?? null,
      });
    }

    res.setHeader(
      "Cache-Control",
      "s-maxage=5, stale-while-revalidate=15"
    );

    const fetchedAt = new Date().toISOString();

    if (requestedSymbol) {
      return res.status(200).json({
        ok: true,
        source: "Binance",
        market: "spot",
        scoringModel: "24h-heuristic-v1",
        disclaimer:
          "Opportunity Score is a market-filtering heuristic, not a trading recommendation or profit guarantee.",
        ...normalizeTicker(data),
        fetchedAt,
      });
    }

    const markets = (Array.isArray(data) ? data : [data])
      .map(normalizeTicker)
      .sort((a, b) => b.opportunityScore - a.opportunityScore);

    return res.status(200).json({
      ok: true,
      source: "Binance",
      market: "spot",
      scoringModel: "24h-heuristic-v1",
      disclaimer:
        "Opportunity Score is a market-filtering heuristic, not a trading recommendation or profit guarantee.",
      count: markets.length,
      symbols: markets.map((item) => item.symbol),
      markets,
      fetchedAt,
    });
  } catch (error) {
    const isTimeout = error?.name === "AbortError";

    return res.status(502).json({
      ok: false,
      source: "Binance",
      symbols,
      error: isTimeout
        ? "Binance request timed out"
        : "Unable to fetch Binance market data",
    });
  } finally {
    clearTimeout(timeout);
  }
}
