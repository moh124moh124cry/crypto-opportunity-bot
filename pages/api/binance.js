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

  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid symbol format",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const url =
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;

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
        error: data?.msg || "Binance request failed",
        code: data?.code ?? null,
      });
    }

    res.setHeader(
      "Cache-Control",
      "s-maxage=5, stale-while-revalidate=15"
    );

    return res.status(200).json({
      ok: true,
      source: "Binance",
      market: "spot",
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
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const isTimeout = error?.name === "AbortError";

    return res.status(502).json({
      ok: false,
      source: "Binance",
      symbol,
      error: isTimeout
        ? "Binance request timed out"
        : "Unable to fetch Binance market data",
    });
  } finally {
    clearTimeout(timeout);
  }
}
