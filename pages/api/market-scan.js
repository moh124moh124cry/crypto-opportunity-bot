import {
  fetchAllExchangeTickers,
} from "../../lib/exchanges";

const DEFAULT_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
];

function round(value, decimals = 4) {
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

function normalizeSymbol(symbol) {
  const normalized =
    String(symbol || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .trim();

  if (
    !/^[A-Z0-9]{5,20}$/.test(
      normalized
    ) ||
    !normalized.endsWith("USDT")
  ) {
    throw new Error(
      "Invalid USDT symbol"
    );
  }

  return normalized;
}

async function fetchBinanceTickers(
  symbols
) {
  try {
    const params =
      new URLSearchParams();

    if (
      symbols.length === 1
    ) {
      params.set(
        "symbol",
        symbols[0]
      );
    } else {
      params.set(
        "symbols",
        JSON.stringify(
          symbols
        )
      );
    }

    const response =
      await fetch(
        `https://data-api.binance.vision/api/v3/ticker/24hr?${params.toString()}`,
        {
          headers: {
            Accept:
              "application/json",
          },
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data?.msg ||
          "Binance request failed"
      );
    }

    const list =
      Array.isArray(data)
        ? data
        : [data];

    return list.map(
      (ticker) => ({
        ok: true,

        exchange:
          "Binance",

        market:
          "spot",

        symbol:
          ticker.symbol,

        price:
          Number(
            ticker.lastPrice
          ),

        openPrice:
          Number(
            ticker.openPrice
          ),

        highPrice:
          Number(
            ticker.highPrice
          ),

        lowPrice:
          Number(
            ticker.lowPrice
          ),

        priceChangePercent:
          Number(
            ticker.priceChangePercent
          ),

        baseVolume:
          Number(
            ticker.volume
          ),

        quoteVolume:
          Number(
            ticker.quoteVolume
          ),

        bidPrice:
          Number(
            ticker.bidPrice
          ),

        askPrice:
          Number(
            ticker.askPrice
          ),

        fetchedAt:
          new Date()
            .toISOString(),
      })
    );
  } catch (error) {
    return symbols.map(
      (symbol) => ({
        ok: false,

        exchange:
          "Binance",

        market:
          "spot",

        symbol,

        error:
          error?.message ||
          "Unable to fetch Binance ticker",

        fetchedAt:
          new Date()
            .toISOString(),
      })
    );
  }
}

function calculateComparison(
  exchangeResults
) {
  const valid =
    exchangeResults.filter(
      (item) =>
        item.ok &&
        Number.isFinite(
          Number(item.price)
        ) &&
        Number(item.price) > 0
    );

  if (
    valid.length === 0
  ) {
    return {
      successfulExchanges:
        0,

      averagePrice:
        null,

      lowestPrice:
        null,

      lowestPriceExchange:
        null,

      highestPrice:
        null,

      highestPriceExchange:
        null,

      priceSpreadPercent:
        null,

      directionConsensus:
        "unavailable",
    };
  }

  const sorted =
    [...valid].sort(
      (a, b) =>
        Number(a.price) -
        Number(b.price)
    );

  const lowest =
    sorted[0];

  const highest =
    sorted[
      sorted.length - 1
    ];

  const averagePrice =
    valid.reduce(
      (sum, item) =>
        sum +
        Number(item.price),
      0
    ) / valid.length;

  const spreadPercent =
    Number(lowest.price) > 0
      ? (
          (
            Number(
              highest.price
            ) -
            Number(
              lowest.price
            )
          ) /
          Number(
            lowest.price
          )
        ) * 100
      : null;

  const changes =
    valid
      .map(
        (item) =>
          Number(
            item
              .priceChangePercent
          )
      )
      .filter(
        Number.isFinite
      );

  const bullishCount =
    changes.filter(
      (value) =>
        value > 0
    ).length;

  const bearishCount =
    changes.filter(
      (value) =>
        value < 0
    ).length;

  let directionConsensus =
    "mixed";

  if (
    bullishCount >
    bearishCount
  ) {
    directionConsensus =
      "bullish";
  } else if (
    bearishCount >
    bullishCount
  ) {
    directionConsensus =
      "bearish";
  }

  return {
    successfulExchanges:
      valid.length,

    averagePrice:
      round(
        averagePrice,
        8
      ),

    lowestPrice:
      round(
        Number(
          lowest.price
        ),
        8
      ),

    lowestPriceExchange:
      lowest.exchange,

    highestPrice:
      round(
        Number(
          highest.price
        ),
        8
      ),

    highestPriceExchange:
      highest.exchange,

    priceSpreadPercent:
      round(
        spreadPercent,
        4
      ),

    directionConsensus,
  };
}

export default async function handler(
  req,
  res
) {
  if (
    req.method !== "GET"
  ) {
    res.setHeader(
      "Allow",
      ["GET"]
    );

    return res
      .status(405)
      .json({
        ok: false,

        error:
          "Method not allowed",
      });
  }

  try {
    const requestedSymbol =
      req.query.symbol
        ? normalizeSymbol(
            req.query.symbol
          )
        : null;

    const symbols =
      requestedSymbol
        ? [
            requestedSymbol,
          ]
        : DEFAULT_SYMBOLS;

    const [
      binanceResults,
      otherExchangeResults,
    ] =
      await Promise.all([
        fetchBinanceTickers(
          symbols
        ),

        Promise.all(
          symbols.map(
            (symbol) =>
              fetchAllExchangeTickers(
                symbol
              )
          )
        ),
      ]);

    const binanceMap =
      new Map(
        binanceResults.map(
          (item) => [
            item.symbol,
            item,
          ]
        )
      );

    const scanResults =
      symbols.map(
        (
          symbol,
          index
        ) => {
          const external =
            otherExchangeResults[
              index
            ];

          const exchanges = [
            binanceMap.get(
              symbol
            ) || {
              ok: false,

              exchange:
                "Binance",

              symbol,

              error:
                "Binance result unavailable",
            },

            ...(
              external?.results ||
              []
            ),
          ];

          const comparison =
            calculateComparison(
              exchanges
            );

          return {
            symbol,

            exchangeCount:
              exchanges.length,

            successfulExchanges:
              comparison
                .successfulExchanges,

            averagePrice:
              comparison
                .averagePrice,

            lowestPrice:
              comparison
                .lowestPrice,

            lowestPriceExchange:
              comparison
                .lowestPriceExchange,

            highestPrice:
              comparison
                .highestPrice,

            highestPriceExchange:
              comparison
                .highestPriceExchange,

            priceSpreadPercent:
              comparison
                .priceSpreadPercent,

            directionConsensus:
              comparison
                .directionConsensus,

            exchanges,
          };
        }
      );

    const totalSuccessful =
      scanResults.reduce(
        (sum, item) =>
          sum +
          item
            .successfulExchanges,
        0
      );

    res.setHeader(
      "Cache-Control",
      "s-maxage=5, stale-while-revalidate=10"
    );

    return res
      .status(200)
      .json({
        ok: true,

        mode:
          "market-scan",

        market:
          "spot",

        quoteAsset:
          "USDT",

        exchanges: [
          "Binance",
          "Bybit",
          "OKX",
          "Bitget",
        ],

        symbolCount:
          symbols.length,

        expectedExchangeResults:
          symbols.length * 4,

        successfulExchangeResults:
          totalSuccessful,

        model:
          "multi-exchange-market-scan-v1",

        note:
          "Exchange prices are snapshots taken at slightly different times. Price spread is informational and is not an arbitrage recommendation.",

        results:
          scanResults,

        fetchedAt:
          new Date()
            .toISOString(),
      });
  } catch (error) {
    return res
      .status(400)
      .json({
        ok: false,

        error:
          error?.message ||
          "Unable to build market scan",
      });
  }
}
