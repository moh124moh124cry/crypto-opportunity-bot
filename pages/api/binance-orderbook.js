function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function summarizeSide(levels) {
  let baseQuantity = 0;
  let quoteNotional = 0;

  for (const level of levels) {
    const price = Number(level[0]);
    const quantity = Number(level[1]);

    if (!Number.isFinite(price) || !Number.isFinite(quantity)) {
      continue;
    }

    baseQuantity += quantity;
    quoteNotional += price * quantity;
  }

  return {
    baseQuantity: round(baseQuantity),
    quoteNotional: round(quoteNotional, 2),
  };
}

function getOrderBookBias(imbalancePercent) {
  if (imbalancePercent >= 10) {
    return "bullish";
  }

  if (imbalancePercent <= -10) {
    return "bearish";
  }

  return "neutral";
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

  const requestedLimit = Number(req.query.limit || 100);

  if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid symbol format",
    });
  }

  const allowedLimits = new Set([
    5,
    10,
    20,
    50,
    100,
    500,
    1000,
  ]);

  if (!allowedLimits.has(requestedLimit)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid limit",
      allowedLimits: Array.from(allowedLimits),
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    8000
  );

  try {
    const params = new URLSearchParams({
      symbol,
      limit: String(requestedLimit),
    });

    const response = await fetch(
      `https://data-api.binance.vision/api/v3/depth?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        source: "Binance",
        symbol,
        error:
          data?.msg ||
          "Binance order book request failed",
        code: data?.code ?? null,
      });
    }

    const bids = Array.isArray(data.bids)
      ? data.bids
      : [];

    const asks = Array.isArray(data.asks)
      ? data.asks
      : [];

    const bidSummary = summarizeSide(bids);
    const askSummary = summarizeSide(asks);

    const totalNotional =
      bidSummary.quoteNotional +
      askSummary.quoteNotional;

    const imbalancePercent =
      totalNotional > 0
        ? (
            (
              bidSummary.quoteNotional -
              askSummary.quoteNotional
            ) /
            totalNotional
          ) * 100
        : 0;

    const bestBid =
      bids.length > 0
        ? Number(bids[0][0])
        : null;

    const bestAsk =
      asks.length > 0
        ? Number(asks[0][0])
        : null;

    const midPrice =
      bestBid !== null &&
      bestAsk !== null
        ? (bestBid + bestAsk) / 2
        : null;

    const spread =
      bestBid !== null &&
      bestAsk !== null
        ? bestAsk - bestBid
        : null;

    const spreadPercent =
      spread !== null &&
      midPrice
        ? (spread / midPrice) * 100
        : null;

    res.setHeader(
      "Cache-Control",
      "s-maxage=2, stale-while-revalidate=5"
    );

    return res.status(200).json({
      ok: true,
      source: "Binance",
      market: "spot",
      symbol,
      depthLimit: requestedLimit,

      bestBid:
        bestBid === null
          ? null
          : round(bestBid),

      bestAsk:
        bestAsk === null
          ? null
          : round(bestAsk),

      midPrice:
        midPrice === null
          ? null
          : round(midPrice),

      spread:
        spread === null
          ? null
          : round(spread),

      spreadPercent:
        spreadPercent === null
          ? null
          : round(spreadPercent, 6),

      bidBaseQuantity:
        bidSummary.baseQuantity,

      askBaseQuantity:
        askSummary.baseQuantity,

      bidQuoteNotional:
        bidSummary.quoteNotional,

      askQuoteNotional:
        askSummary.quoteNotional,

      imbalancePercent:
        round(imbalancePercent, 2),

      orderBookBias:
        getOrderBookBias(
          imbalancePercent
        ),

      topBids:
        bids
          .slice(0, 5)
          .map(
            ([price, quantity]) => ({
              price: Number(price),
              quantity: Number(quantity),
            })
          ),

      topAsks:
        asks
          .slice(0, 5)
          .map(
            ([price, quantity]) => ({
              price: Number(price),
              quantity: Number(quantity),
            })
          ),

      note:
        "Order book imbalance is a short-lived market microstructure signal and is not a trading recommendation.",

      fetchedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    const isTimeout =
      error?.name === "AbortError";

    return res.status(502).json({
      ok: false,
      source: "Binance",
      symbol,

      error: isTimeout
        ? "Binance order book request timed out"
        : "Unable to fetch Binance order book data",
    });
  } finally {
    clearTimeout(timeout);
  }
}
