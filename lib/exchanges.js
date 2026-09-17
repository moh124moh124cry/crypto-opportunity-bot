const REQUEST_TIMEOUT = 8000;

function round(value, decimals = 8) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return null;
  }

  const factor = 10 ** decimals;

  return (
    Math.round(
      Number(value) * factor
    ) / factor
  );
}

function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function normalizeSymbol(symbol) {
  const normalized =
    String(symbol || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .trim();

  if (
    !/^[A-Z0-9]{5,20}$/.test(
      normalized
    )
  ) {
    throw new Error(
      "Invalid symbol format"
    );
  }

  return normalized;
}

function splitUsdtSymbol(symbol) {
  const normalized =
    normalizeSymbol(symbol);

  if (
    !normalized.endsWith("USDT")
  ) {
    throw new Error(
      "Only USDT spot pairs are supported right now"
    );
  }

  return {
    symbol: normalized,

    baseCoin:
      normalized.slice(
        0,
        -4
      ),

    quoteCoin:
      "USDT",
  };
}

async function fetchJson(
  url,
  timeoutMs = REQUEST_TIMEOUT
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );

  try {
    const response =
      await fetch(url, {
        method: "GET",

        headers: {
          Accept:
            "application/json",

          "User-Agent":
            "Crypto-Opportunity-Bot/1.0",
        },

        signal:
          controller.signal,
      });

    let data = null;

    try {
      data =
        await response.json();
    } catch {
      throw new Error(
        "Exchange returned invalid JSON"
      );
    }

    if (!response.ok) {
      throw new Error(
        data?.msg ||
          data?.message ||
          `HTTP ${response.status}`
      );
    }

    return data;
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      throw new Error(
        "Exchange request timed out"
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildNormalizedTicker({
  exchange,
  symbol,
  price,
  openPrice,
  highPrice,
  lowPrice,
  priceChangePercent,
  baseVolume,
  quoteVolume,
  bidPrice,
  askPrice,
  exchangeTimestamp = null,
}) {
  const numericPrice =
    toNumber(price);

  const numericOpen =
    toNumber(openPrice);

  let normalizedChange =
    toNumber(
      priceChangePercent
    );

  if (
    normalizedChange === null &&
    numericPrice !== null &&
    numericOpen !== null &&
    numericOpen !== 0
  ) {
    normalizedChange =
      (
        (
          numericPrice -
          numericOpen
        ) /
        numericOpen
      ) * 100;
  }

  return {
    ok: true,

    exchange,

    market: "spot",

    symbol:
      normalizeSymbol(symbol),

    price:
      round(
        numericPrice
      ),

    openPrice:
      round(
        numericOpen
      ),

    highPrice:
      round(
        toNumber(highPrice)
      ),

    lowPrice:
      round(
        toNumber(lowPrice)
      ),

    priceChangePercent:
      round(
        normalizedChange,
        4
      ),

    baseVolume:
      round(
        toNumber(baseVolume),
        4
      ),

    quoteVolume:
      round(
        toNumber(quoteVolume),
        2
      ),

    bidPrice:
      round(
        toNumber(bidPrice)
      ),

    askPrice:
      round(
        toNumber(askPrice)
      ),

    exchangeTimestamp:
      exchangeTimestamp ===
      null
        ? null
        : String(
            exchangeTimestamp
          ),

    fetchedAt:
      new Date().toISOString(),
  };
}

export async function fetchBybitTicker(
  symbol
) {
  const {
    symbol: normalizedSymbol,
  } =
    splitUsdtSymbol(symbol);

  try {
    const params =
      new URLSearchParams({
        category: "spot",
        symbol:
          normalizedSymbol,
      });

    const data =
      await fetchJson(
        `https://api.bybit.com/v5/market/tickers?${params.toString()}`
      );

    if (
      String(data?.retCode) !==
      "0"
    ) {
      throw new Error(
        data?.retMsg ||
          "Bybit request failed"
      );
    }

    const ticker =
      data?.result?.list?.[0];

    if (!ticker) {
      throw new Error(
        "Bybit ticker not found"
      );
    }

    const changeDecimal =
      toNumber(
        ticker.price24hPcnt
      );

    return buildNormalizedTicker({
      exchange:
        "Bybit",

      symbol:
        normalizedSymbol,

      price:
        ticker.lastPrice,

      openPrice:
        ticker.prevPrice24h,

      highPrice:
        ticker.highPrice24h,

      lowPrice:
        ticker.lowPrice24h,

      priceChangePercent:
        changeDecimal === null
          ? null
          : changeDecimal *
            100,

      baseVolume:
        ticker.volume24h,

      quoteVolume:
        ticker.turnover24h,

      bidPrice:
        ticker.bid1Price,

      askPrice:
        ticker.ask1Price,

      exchangeTimestamp:
        data.time ?? null,
    });
  } catch (error) {
    return {
      ok: false,

      exchange:
        "Bybit",

      market: "spot",

      symbol:
        normalizedSymbol,

      error:
        error?.message ||
        "Unable to fetch Bybit ticker",

      fetchedAt:
        new Date().toISOString(),
    };
  }
}

export async function fetchOkxTicker(
  symbol
) {
  const {
    symbol: normalizedSymbol,
    baseCoin,
    quoteCoin,
  } =
    splitUsdtSymbol(symbol);

  const instrumentId =
    `${baseCoin}-${quoteCoin}`;

  try {
    const params =
      new URLSearchParams({
        instId:
          instrumentId,
      });

    const data =
      await fetchJson(
        `https://www.okx.com/api/v5/market/ticker?${params.toString()}`
      );

    if (
      String(data?.code) !==
      "0"
    ) {
      throw new Error(
        data?.msg ||
          "OKX request failed"
      );
    }

    const ticker =
      data?.data?.[0];

    if (!ticker) {
      throw new Error(
        "OKX ticker not found"
      );
    }

    const lastPrice =
      toNumber(ticker.last);

    const openPrice =
      toNumber(
        ticker.open24h
      );

    let changePercent =
      null;

    if (
      lastPrice !== null &&
      openPrice !== null &&
      openPrice !== 0
    ) {
      changePercent =
        (
          (
            lastPrice -
            openPrice
          ) /
          openPrice
        ) * 100;
    }

    return buildNormalizedTicker({
      exchange:
        "OKX",

      symbol:
        normalizedSymbol,

      price:
        ticker.last,

      openPrice:
        ticker.open24h,

      highPrice:
        ticker.high24h,

      lowPrice:
        ticker.low24h,

      priceChangePercent:
        changePercent,

      baseVolume:
        ticker.vol24h,

      quoteVolume:
        ticker.volCcy24h,

      bidPrice:
        ticker.bidPx,

      askPrice:
        ticker.askPx,

      exchangeTimestamp:
        ticker.ts ?? null,
    });
  } catch (error) {
    return {
      ok: false,

      exchange:
        "OKX",

      market: "spot",

      symbol:
        normalizedSymbol,

      error:
        error?.message ||
        "Unable to fetch OKX ticker",

      fetchedAt:
        new Date().toISOString(),
    };
  }
}

export async function fetchBitgetTicker(
  symbol
) {
  const {
    symbol: normalizedSymbol,
  } =
    splitUsdtSymbol(symbol);

  try {
    const params =
      new URLSearchParams({
        category: "SPOT",
        symbol:
          normalizedSymbol,
      });

    const data =
      await fetchJson(
        `https://api.bitget.com/api/v3/market/tickers?${params.toString()}`
      );

    if (
      String(data?.code) !==
      "00000"
    ) {
      throw new Error(
        data?.msg ||
          "Bitget request failed"
      );
    }

    const ticker =
      data?.data?.[0];

    if (!ticker) {
      throw new Error(
        "Bitget ticker not found"
      );
    }

    const changeDecimal =
      toNumber(
        ticker.price24hPcnt
      );

    return buildNormalizedTicker({
      exchange:
        "Bitget",

      symbol:
        normalizedSymbol,

      price:
        ticker.lastPrice,

      openPrice:
        ticker.openPrice24h,

      highPrice:
        ticker.highPrice24h,

      lowPrice:
        ticker.lowPrice24h,

      priceChangePercent:
        changeDecimal === null
          ? null
          : changeDecimal *
            100,

      baseVolume:
        ticker.volume24h,

      quoteVolume:
        ticker.quoteVolume24h,

      bidPrice:
        ticker.bid1Price,

      askPrice:
        ticker.ask1Price,

      exchangeTimestamp:
        data.requestTime ??
        null,
    });
  } catch (error) {
    return {
      ok: false,

      exchange:
        "Bitget",

      market: "spot",

      symbol:
        normalizedSymbol,

      error:
        error?.message ||
        "Unable to fetch Bitget ticker",

      fetchedAt:
        new Date().toISOString(),
    };
  }
}

export async function fetchExchangeTicker(
  exchange,
  symbol
) {
  const normalizedExchange =
    String(exchange || "")
      .toLowerCase()
      .trim();

  if (
    normalizedExchange ===
    "bybit"
  ) {
    return fetchBybitTicker(
      symbol
    );
  }

  if (
    normalizedExchange ===
    "okx"
  ) {
    return fetchOkxTicker(
      symbol
    );
  }

  if (
    normalizedExchange ===
    "bitget"
  ) {
    return fetchBitgetTicker(
      symbol
    );
  }

  return {
    ok: false,

    exchange:
      String(exchange || ""),

    market: "spot",

    symbol:
      normalizeSymbol(symbol),

    error:
      "Unsupported exchange",

    fetchedAt:
      new Date().toISOString(),
  };
}

export async function fetchAllExchangeTickers(
  symbol
) {
  const normalizedSymbol =
    normalizeSymbol(symbol);

  const results =
    await Promise.all([
      fetchBybitTicker(
        normalizedSymbol
      ),

      fetchOkxTicker(
        normalizedSymbol
      ),

      fetchBitgetTicker(
        normalizedSymbol
      ),
    ]);

  return {
    symbol:
      normalizedSymbol,

    market: "spot",

    count:
      results.length,

    successCount:
      results.filter(
        (item) =>
          item.ok
      ).length,

    results,

    fetchedAt:
      new Date().toISOString(),
  };
}
