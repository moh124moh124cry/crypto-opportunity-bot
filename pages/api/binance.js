const DEFAULT_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
];

function normalizeTicker(data) {
  return {
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
        ...normalizeTicker(data),
        fetchedAt,
      });
    }

    const markets = Array.isArray(data)
      ? data.map(normalizeTicker)
      : [normalizeTicker(data)];

    return res.status(200).json({
      ok: true,
      source: "Binance",
      market: "spot",
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
