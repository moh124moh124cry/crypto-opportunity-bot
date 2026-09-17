const DEFAULT_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
];

const PRIMARY_INTERVAL = "15m";
const CONFIRMATION_INTERVAL = "1h";
const KLINE_LIMIT = 100;
const ORDER_BOOK_LIMIT = 100;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function boostStrength(strength) {
  if (strength === "low") return "medium";
  if (strength === "medium") return "high";
  return strength;
}

function calculateOpportunity(ticker) {
  const price = Number(ticker.price);
  const highPrice = Number(ticker.highPrice);
  const lowPrice = Number(ticker.lowPrice);
  const quoteVolume = Number(ticker.quoteVolume);
  const priceChangePercent = Number(ticker.priceChangePercent);

  const momentumScore = clamp(
    Math.abs(priceChangePercent) * 8,
    0,
    40
  );

  const liquidityScore =
    quoteVolume > 0
      ? clamp(
          ((Math.log10(quoteVolume) - 6) / 4) * 30,
          0,
          30
        )
      : 0;

  const rangeSize = highPrice - lowPrice;

  const rangePosition =
    rangeSize > 0
      ? clamp(
          ((price - lowPrice) / rangeSize) * 100,
          0,
          100
        )
      : 50;

  let trendBias = "neutral";

  if (priceChangePercent >= 0.5) {
    trendBias = "bullish";
  } else if (priceChangePercent <= -0.5) {
    trendBias = "bearish";
  }

  let positionStrength = 25;

  if (trendBias === "bullish") {
    positionStrength = rangePosition;
  } else if (trendBias === "bearish") {
    positionStrength = 100 - rangePosition;
  }

  const positionScore = clamp(
    (positionStrength / 100) * 30,
    0,
    30
  );

  const opportunityScore = round(
    clamp(
      momentumScore +
        liquidityScore +
        positionScore,
      0,
      100
    )
  );

  let opportunityLevel = "low";

  if (opportunityScore >= 75) {
    opportunityLevel = "high";
  } else if (opportunityScore >= 55) {
    opportunityLevel = "medium";
  }

  return {
    opportunityScore,
    opportunityLevel,
    trendBias,
  };
}

function normalizeTicker(data) {
  const ticker = {
    symbol: data.symbol,
    price: Number(data.lastPrice),
    priceChangePercent: Number(
      data.priceChangePercent
    ),
    openPrice: Number(data.openPrice),
    highPrice: Number(data.highPrice),
    lowPrice: Number(data.lowPrice),
    quoteVolume: Number(data.quoteVolume),
    tradeCount: data.count,
  };

  return {
    ...ticker,
    ...calculateOpportunity(ticker),
  };
}

function calculateRsi(closes, period = 14) {
  if (
    !Array.isArray(closes) ||
    closes.length <= period
  ) {
    return null;
  }

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i += 1) {
    const change =
      closes[i] - closes[i - 1];

    if (change > 0) {
      gainSum += change;
    } else if (change < 0) {
      lossSum += Math.abs(change);
    }
  }

  let averageGain =
    gainSum / period;

  let averageLoss =
    lossSum / period;

  for (
    let i = period + 1;
    i < closes.length;
    i += 1
  ) {
    const change =
      closes[i] - closes[i - 1];

    const gain =
      change > 0 ? change : 0;

    const loss =
      change < 0
        ? Math.abs(change)
        : 0;

    averageGain =
      (
        averageGain *
          (period - 1) +
        gain
      ) / period;

    averageLoss =
      (
        averageLoss *
          (period - 1) +
        loss
      ) / period;
  }

  if (
    averageGain === 0 &&
    averageLoss === 0
  ) {
    return 50;
  }

  if (averageLoss === 0) {
    return 100;
  }

  if (averageGain === 0) {
    return 0;
  }

  const relativeStrength =
    averageGain / averageLoss;

  return round(
    100 -
      100 /
        (1 + relativeStrength)
  );
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
  if (
    !Array.isArray(values) ||
    values.length < period
  ) {
    return null;
  }

  let ema =
    values
      .slice(0, period)
      .reduce(
        (sum, value) =>
          sum + value,
        0
      ) / period;

  const multiplier =
    2 / (period + 1);

  for (
    let i = period;
    i < values.length;
    i += 1
  ) {
    ema =
      (
        values[i] - ema
      ) *
        multiplier +
      ema;
  }

  return round(ema);
}

function getEmaTrend(ema20, ema50) {
  if (
    ema20 === null ||
    ema50 === null ||
    ema50 === 0
  ) {
    return "neutral";
  }

  const differencePercent =
    Math.abs(
      (
        (ema20 - ema50) /
        ema50
      ) * 100
    );

  if (
    differencePercent < 0.05
  ) {
    return "neutral";
  }

  return ema20 > ema50
    ? "bullish"
    : "bearish";
}

function calculateTechnicalScore(
  rsi14,
  ema20,
  ema50,
  emaTrend
) {
  if (
    rsi14 === null ||
    ema20 === null ||
    ema50 === null ||
    ema50 === 0
  ) {
    return {
      technicalScore: null,
      technicalLevel:
        "unavailable",
    };
  }

  const emaSeparationPercent =
    Math.abs(
      (
        (ema20 - ema50) /
        ema50
      ) * 100
    );

  const emaScore =
    emaTrend === "neutral"
      ? 10
      : clamp(
          20 +
            (
              emaSeparationPercent /
              0.5
            ) *
              40,
          20,
          60
        );

  let rsiScore = 0;

  if (emaTrend === "bullish") {
    rsiScore = clamp(
      40 -
        Math.abs(
          rsi14 - 60
        ) *
          2,
      0,
      40
    );
  } else if (
    emaTrend === "bearish"
  ) {
    rsiScore = clamp(
      40 -
        Math.abs(
          rsi14 - 40
        ) *
          2,
      0,
      40
    );
  } else {
    rsiScore = clamp(
      20 -
        Math.abs(
          rsi14 - 50
        ),
      0,
      20
    );
  }

  const technicalScore =
    round(
      clamp(
        emaScore +
          rsiScore,
        0,
        100
      )
    );

  let technicalLevel =
    "low";

  if (technicalScore >= 70) {
    technicalLevel =
      "high";
  } else if (
    technicalScore >= 40
  ) {
    technicalLevel =
      "medium";
  }

  return {
    technicalScore,
    technicalLevel,
  };
}

function calculateFinalScore(
  opportunityScore,
  technicalScore
) {
  if (
    technicalScore === null
  ) {
    return {
      finalOpportunityScore:
        null,

      finalOpportunityLevel:
        "unavailable",
    };
  }

  const finalOpportunityScore =
    round(
      clamp(
        opportunityScore *
          0.5 +
          technicalScore *
            0.5,
        0,
        100
      )
    );

  let finalOpportunityLevel =
    "low";

  if (
    finalOpportunityScore >= 70
  ) {
    finalOpportunityLevel =
      "high";
  } else if (
    finalOpportunityScore >= 50
  ) {
    finalOpportunityLevel =
      "medium";
  }

  return {
    finalOpportunityScore,
    finalOpportunityLevel,
  };
}

function calculatePaperSignal({
  trendBias,
  emaTrend,
  rsi14,
  finalOpportunityScore,
}) {
  if (
    finalOpportunityScore === null ||
    rsi14 === null
  ) {
    return {
      paperSignal: "WAIT",
      signalStrength:
        "unavailable",
      signalReason:
        "Insufficient technical data",
    };
  }

  const bullishAlignment =
    trendBias === "bullish" &&
    emaTrend === "bullish";

  const bearishAlignment =
    trendBias === "bearish" &&
    emaTrend === "bearish";

  const longRsiHealthy =
    rsi14 >= 45 &&
    rsi14 <= 68;

  const shortRsiHealthy =
    rsi14 >= 32 &&
    rsi14 <= 55;

  let paperSignal = "WAIT";

  let signalReason =
    "Trend alignment or score threshold not confirmed";

  if (
    finalOpportunityScore >=
      60 &&
    bullishAlignment &&
    longRsiHealthy
  ) {
    paperSignal = "LONG";

    signalReason =
      "24h trend and 15m EMA trend are bullish with supportive RSI";
  } else if (
    finalOpportunityScore >=
      60 &&
    bearishAlignment &&
    shortRsiHealthy
  ) {
    paperSignal = "SHORT";

    signalReason =
      "24h trend and 15m EMA trend are bearish with supportive RSI";
  }

  let signalStrength = "low";

  if (
    paperSignal === "WAIT"
  ) {
    signalStrength = "none";
  } else if (
    finalOpportunityScore >=
    75
  ) {
    signalStrength = "high";
  } else if (
    finalOpportunityScore >=
    65
  ) {
    signalStrength = "medium";
  }

  return {
    paperSignal,
    signalStrength,
    signalReason,
  };
}

function summarizeOrderBookSide(
  levels
) {
  let quoteNotional = 0;

  for (
    const level of levels
  ) {
    const price =
      Number(level[0]);

    const quantity =
      Number(level[1]);

    if (
      !Number.isFinite(
        price
      ) ||
      !Number.isFinite(
        quantity
      )
    ) {
      continue;
    }

    quoteNotional +=
      price * quantity;
  }

  return quoteNotional;
}

function getOrderBookBias(
  imbalancePercent
) {
  if (
    imbalancePercent >= 10
  ) {
    return "bullish";
  }

  if (
    imbalancePercent <= -10
  ) {
    return "bearish";
  }

  return "neutral";
}

function applyOrderBookConfirmation(
  signal,
  orderBook
) {
  const orderBookBias =
    orderBook?.orderBookBias ??
    "unavailable";

  const imbalancePercent =
    orderBook?.imbalancePercent ??
    null;

  if (
    signal.paperSignal ===
    "WAIT"
  ) {
    return {
      ...signal,

      orderBookConfirmation:
        "not-applicable",
    };
  }

  if (
    orderBookBias ===
    "unavailable"
  ) {
    return {
      ...signal,

      orderBookConfirmation:
        "unavailable",
    };
  }

  if (
    orderBookBias ===
    "neutral"
  ) {
    return {
      ...signal,

      orderBookConfirmation:
        "neutral",

      signalReason:
        `${signal.signalReason}; order book is currently neutral`,
    };
  }

  const aligned =
    (
      signal.paperSignal ===
        "LONG" &&
      orderBookBias ===
        "bullish"
    ) ||
    (
      signal.paperSignal ===
        "SHORT" &&
      orderBookBias ===
        "bearish"
    );

  if (aligned) {
    return {
      ...signal,

      signalStrength:
        boostStrength(
          signal.signalStrength
        ),

      orderBookConfirmation:
        "aligned",

      signalReason:
        `${signal.signalReason}; order book confirms ${orderBookBias} pressure`,
    };
  }

  return {
    ...signal,

    signalStrength: "low",

    orderBookConfirmation:
      "conflict",

    signalReason:
      `${signal.signalReason}; order book currently conflicts (${orderBookBias}, imbalance ${imbalancePercent}%)`,
  };
}

function applyMultiTimeframeConfirmation(
  signal,
  hourlyTechnical
) {
  const hourlyTrend =
    hourlyTechnical?.emaTrend ??
    "unavailable";

  if (
    signal.paperSignal ===
    "WAIT"
  ) {
    return {
      ...signal,

      multiTimeframeConfirmation:
        "not-applicable",
    };
  }

  if (
    hourlyTrend ===
    "unavailable"
  ) {
    return {
      ...signal,

      multiTimeframeConfirmation:
        "unavailable",
    };
  }

  if (
    hourlyTrend === "neutral"
  ) {
    return {
      ...signal,

      multiTimeframeConfirmation:
        "neutral",

      signalReason:
        `${signal.signalReason}; 1h EMA trend is neutral`,
    };
  }

  const aligned =
    (
      signal.paperSignal ===
        "LONG" &&
      hourlyTrend ===
        "bullish"
    ) ||
    (
      signal.paperSignal ===
        "SHORT" &&
      hourlyTrend ===
        "bearish"
    );

  if (aligned) {
    const canBoost =
      signal.orderBookConfirmation !==
      "conflict";

    return {
      ...signal,

      signalStrength:
        canBoost
          ? boostStrength(
              signal.signalStrength
            )
          : signal.signalStrength,

      multiTimeframeConfirmation:
        "aligned",

      signalReason:
        `${signal.signalReason}; 1h EMA trend confirms ${hourlyTrend} direction`,
    };
  }

  return {
    ...signal,

    signalStrength: "low",

    multiTimeframeConfirmation:
      "conflict",

    signalReason:
      `${signal.signalReason}; 1h EMA trend conflicts (${hourlyTrend})`,
  };
}

async function fetchTechnical(
  symbol,
  interval,
  signal
) {
  try {
    const params =
      new URLSearchParams({
        symbol,
        interval,
        limit: String(
          KLINE_LIMIT
        ),
      });

    const response =
      await fetch(
        `https://data-api.binance.vision/api/v3/klines?${params.toString()}`,
        {
          method: "GET",

          headers: {
            Accept:
              "application/json",
          },

          signal,
        }
      );

    const data =
      await response.json();

    if (
      !response.ok ||
      !Array.isArray(data)
    ) {
      return {
        symbol,
        interval,

        rsi14: null,

        rsiState:
          "unavailable",

        ema20: null,
        ema50: null,

        emaTrend:
          "unavailable",

        technicalScore:
          null,

        technicalLevel:
          "unavailable",

        technicalError:
          data?.msg ||
          "Unable to fetch candle data",
      };
    }

    const closes =
      data.map(
        (candle) =>
          Number(candle[4])
      );

    const rsi14 =
      calculateRsi(
        closes,
        14
      );

    const ema20 =
      calculateEma(
        closes,
        20
      );

    const ema50 =
      calculateEma(
        closes,
        50
      );

    const emaTrend =
      getEmaTrend(
        ema20,
        ema50
      );

    const technical =
      calculateTechnicalScore(
        rsi14,
        ema20,
        ema50,
        emaTrend
      );

    return {
      symbol,
      interval,

      rsi14,

      rsiState:
        getRsiState(
          rsi14
        ),

      ema20,
      ema50,
      emaTrend,

      technicalScore:
        technical
          .technicalScore,

      technicalLevel:
        technical
          .technicalLevel,

      technicalError:
        null,
    };
  } catch (error) {
    return {
      symbol,
      interval,

      rsi14: null,

      rsiState:
        "unavailable",

      ema20: null,
      ema50: null,

      emaTrend:
        "unavailable",

      technicalScore:
        null,

      technicalLevel:
        "unavailable",

      technicalError:
        error?.name ===
        "AbortError"
          ? "Binance request timed out"
          : "Unable to calculate technical score",
    };
  }
}

async function fetchOrderBook(
  symbol,
  signal
) {
  try {
    const params =
      new URLSearchParams({
        symbol,

        limit: String(
          ORDER_BOOK_LIMIT
        ),
      });

    const response =
      await fetch(
        `https://data-api.binance.vision/api/v3/depth?${params.toString()}`,
        {
          method: "GET",

          headers: {
            Accept:
              "application/json",
          },

          signal,
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      return {
        symbol,

        imbalancePercent:
          null,

        orderBookBias:
          "unavailable",

        orderBookError:
          data?.msg ||
          "Unable to fetch order book",
      };
    }

    const bids =
      Array.isArray(
        data.bids
      )
        ? data.bids
        : [];

    const asks =
      Array.isArray(
        data.asks
      )
        ? data.asks
        : [];

    const bidNotional =
      summarizeOrderBookSide(
        bids
      );

    const askNotional =
      summarizeOrderBookSide(
        asks
      );

    const totalNotional =
      bidNotional +
      askNotional;

    const imbalancePercent =
      totalNotional > 0
        ? (
            (
              bidNotional -
              askNotional
            ) /
            totalNotional
          ) * 100
        : 0;

    return {
      symbol,

      imbalancePercent:
        round(
          imbalancePercent,
          2
        ),

      orderBookBias:
        getOrderBookBias(
          imbalancePercent
        ),

      orderBookError:
        null,
    };
  } catch (error) {
    return {
      symbol,

      imbalancePercent:
        null,

      orderBookBias:
        "unavailable",

      orderBookError:
        error?.name ===
        "AbortError"
          ? "Binance order book request timed out"
          : "Unable to calculate order book imbalance",
    };
  }
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

  const requestedSymbol =
    req.query.symbol
      ? String(
          req.query.symbol
        )
          .toUpperCase()
          .trim()
      : null;

  if (
    requestedSymbol &&
    !/^[A-Z0-9]{5,20}$/.test(
      requestedSymbol
    )
  ) {
    return res
      .status(400)
      .json({
        ok: false,

        error:
          "Invalid symbol format",
      });
  }

  const symbols =
    requestedSymbol
      ? [requestedSymbol]
      : DEFAULT_SYMBOLS;

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      15000
    );

  try {
    const tickerParams =
      new URLSearchParams();

    if (
      symbols.length === 1
    ) {
      tickerParams.set(
        "symbol",
        symbols[0]
      );
    } else {
      tickerParams.set(
        "symbols",
        JSON.stringify(
          symbols
        )
      );
    }

    const tickerResponse =
      await fetch(
        `https://data-api.binance.vision/api/v3/ticker/24hr?${tickerParams.toString()}`,
        {
          method: "GET",

          headers: {
            Accept:
              "application/json",
          },

          signal:
            controller.signal,
        }
      );

    const tickerData =
      await tickerResponse.json();

    if (
      !tickerResponse.ok
    ) {
      return res
        .status(
          tickerResponse.status
        )
        .json({
          ok: false,

          source:
            "Binance",

          error:
            tickerData?.msg ||
            "Binance ticker request failed",

          code:
            tickerData?.code ??
            null,
        });
    }

    const tickers =
      (
        Array.isArray(
          tickerData
        )
          ? tickerData
          : [tickerData]
      ).map(
        normalizeTicker
      );

    const [
      primaryTechnicalResults,
      hourlyTechnicalResults,
      orderBookResults,
    ] =
      await Promise.all([
        Promise.all(
          tickers.map(
            (ticker) =>
              fetchTechnical(
                ticker.symbol,
                PRIMARY_INTERVAL,
                controller.signal
              )
          )
        ),

        Promise.all(
          tickers.map(
            (ticker) =>
              fetchTechnical(
                ticker.symbol,
                CONFIRMATION_INTERVAL,
                controller.signal
              )
          )
        ),

        Promise.all(
          tickers.map(
            (ticker) =>
              fetchOrderBook(
                ticker.symbol,
                controller.signal
              )
          )
        ),
      ]);

    const primaryTechnicalBySymbol =
      new Map(
        primaryTechnicalResults.map(
          (item) => [
            item.symbol,
            item,
          ]
        )
      );

    const hourlyTechnicalBySymbol =
      new Map(
        hourlyTechnicalResults.map(
          (item) => [
            item.symbol,
            item,
          ]
        )
      );

    const orderBookBySymbol =
      new Map(
        orderBookResults.map(
          (item) => [
            item.symbol,
            item,
          ]
        )
      );

    const opportunities =
      tickers
        .map(
          (ticker) => {
            const primaryTechnical =
              primaryTechnicalBySymbol.get(
                ticker.symbol
              ) || {
                rsi14: null,

                rsiState:
                  "unavailable",

                ema20: null,
                ema50: null,

                emaTrend:
                  "unavailable",

                technicalScore:
                  null,

                technicalLevel:
                  "unavailable",

                technicalError:
                  "15m technical result unavailable",
              };

            const hourlyTechnical =
              hourlyTechnicalBySymbol.get(
                ticker.symbol
              ) || {
                rsi14: null,

                rsiState:
                  "unavailable",

                ema20: null,
                ema50: null,

                emaTrend:
                  "unavailable",

                technicalScore:
                  null,

                technicalLevel:
                  "unavailable",

                technicalError:
                  "1h technical result unavailable",
              };

            const orderBook =
              orderBookBySymbol.get(
                ticker.symbol
              ) || {
                imbalancePercent:
                  null,

                orderBookBias:
                  "unavailable",

                orderBookError:
                  "Order book result unavailable",
              };

            const finalScore =
              calculateFinalScore(
                ticker
                  .opportunityScore,

                primaryTechnical
                  .technicalScore
              );

            const baseSignal =
              calculatePaperSignal({
                trendBias:
                  ticker.trendBias,

                emaTrend:
                  primaryTechnical
                    .emaTrend,

                rsi14:
                  primaryTechnical
                    .rsi14,

                finalOpportunityScore:
                  finalScore
                    .finalOpportunityScore,
              });

            const orderBookSignal =
              applyOrderBookConfirmation(
                baseSignal,
                orderBook
              );

            const signal =
              applyMultiTimeframeConfirmation(
                orderBookSignal,
                hourlyTechnical
              );

            return {
              symbol:
                ticker.symbol,

              price:
                ticker.price,

              priceChangePercent:
                ticker
                  .priceChangePercent,

              quoteVolume:
                ticker.quoteVolume,

              tradeCount:
                ticker.tradeCount,

              opportunityScore:
                ticker
                  .opportunityScore,

              opportunityLevel:
                ticker
                  .opportunityLevel,

              trendBias:
                ticker.trendBias,

              rsi14:
                primaryTechnical
                  .rsi14,

              rsiState:
                primaryTechnical
                  .rsiState,

              ema20:
                primaryTechnical
                  .ema20,

              ema50:
                primaryTechnical
                  .ema50,

              emaTrend:
                primaryTechnical
                  .emaTrend,

              technicalScore:
                primaryTechnical
                  .technicalScore,

              technicalLevel:
                primaryTechnical
                  .technicalLevel,

              technicalError:
                primaryTechnical
                  .technicalError,

              rsi14_1h:
                hourlyTechnical
                  .rsi14,

              rsiState_1h:
                hourlyTechnical
                  .rsiState,

              ema20_1h:
                hourlyTechnical
                  .ema20,

              ema50_1h:
                hourlyTechnical
                  .ema50,

              emaTrend_1h:
                hourlyTechnical
                  .emaTrend,

              technicalScore_1h:
                hourlyTechnical
                  .technicalScore,

              technicalLevel_1h:
                hourlyTechnical
                  .technicalLevel,

              technicalError_1h:
                hourlyTechnical
                  .technicalError,

              imbalancePercent:
                orderBook
                  .imbalancePercent,

              orderBookBias:
                orderBook
                  .orderBookBias,

              orderBookError:
                orderBook
                  .orderBookError,

              ...finalScore,

              ...signal,
            };
          }
        )
        .sort(
          (a, b) => {
            const scoreA =
              a.finalOpportunityScore ??
              -1;

            const scoreB =
              b.finalOpportunityScore ??
              -1;

            return (
              scoreB -
              scoreA
            );
          }
        )
        .map(
          (
            item,
            index
          ) => ({
            rank:
              index + 1,

            ...item,
          })
        );

    res.setHeader(
      "Cache-Control",
      "s-maxage=5, stale-while-revalidate=10"
    );

    return res
      .status(200)
      .json({
        ok: true,

        source:
          "Binance",

        market:
          "spot",

        mode:
          "paper-trading",

        primaryInterval:
          PRIMARY_INTERVAL,

        confirmationInterval:
          CONFIRMATION_INTERVAL,

        orderBookDepth:
          ORDER_BOOK_LIMIT,

        count:
          opportunities.length,

        finalScoreModel:
          "opportunity-v1-50pct-technical15m-v1-50pct",

        signalModel:
          "trend-ema-rsi-finalscore-orderbook-mtf-v3",

        multiTimeframeModel:
          "15m-primary-1h-confirmation-v1",

        orderBookModel:
          "depth100-quote-notional-imbalance-v1",

        weights: {
          opportunityScore:
            0.5,

          technicalScore15m:
            0.5,
        },

        disclaimer:
          "LONG, SHORT and WAIT are paper-trading research signals only. The 1h timeframe and order book are confirmation factors. No real trades are executed and no profit is guaranteed.",

        opportunities,

        fetchedAt:
          new Date().toISOString(),
      });
  } catch (error) {
    const isTimeout =
      error?.name ===
      "AbortError";

    return res
      .status(502)
      .json({
        ok: false,

        source:
          "Binance",

        error:
          isTimeout
            ? "Binance requests timed out"
            : "Unable to build combined opportunity scores",
      });
  } finally {
    clearTimeout(
      timeout
    );
  }
}
