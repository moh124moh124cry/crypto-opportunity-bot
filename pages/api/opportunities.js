const DEFAULT_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
];

const INTERVAL = "15m";
const KLINE_LIMIT = 100;

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
    priceChangePercent: Number(data.priceChangePercent),
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

    averageGain =
      ((averageGain * (period - 1)) + gain) / period;

    averageLoss =
      ((averageLoss * (period - 1)) + loss) / period;
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

  return round(
    100 - (100 / (1 + relativeStrength))
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
  if (!Array.isArray(values) || values.length < period) {
    return null;
  }

  let ema =
    values
      .slice(0, period)
      .reduce((sum, value) => sum + value, 0) /
    period;

  const multiplier = 2 / (period + 1);

  for (let i = period; i < values.length; i += 1) {
    ema =
      ((values[i] - ema) * multiplier) + ema;
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
      ((ema20 - ema50) / ema50) * 100
    );

  if (differencePercent < 0.05) {
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
      technicalLevel: "unavailable",
    };
  }

  const emaSeparationPercent =
    Math.abs(
      ((ema20 - ema50) / ema50) * 100
    );

  const emaScore =
    emaTrend === "neutral"
      ? 10
      : clamp(
          20 +
          (emaSeparationPercent / 0.5) * 40,
          20,
          60
        );

  let rsiScore = 0;

  if (emaTrend === "bullish") {
    rsiScore = clamp(
      40 - Math.abs(rsi14 - 60) * 2,
      0,
      40
    );
  } else if (emaTrend === "bearish") {
    rsiScore = clamp(
      40 - Math.abs(rsi14 - 40) * 2,
      0,
      40
    );
  } else {
    rsiScore = clamp(
      20 - Math.abs(rsi14 - 50),
      0,
      20
    );
  }

  const technicalScore = round(
    clamp(
      emaScore + rsiScore,
      0,
      100
    )
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

function calculateFinalScore(
  opportunityScore,
  technicalScore
) {
  if (technicalScore === null) {
    return {
      finalOpportunityScore: null,
      finalOpportunityLevel: "unavailable",
    };
  }

  const finalOpportunityScore = round(
    clamp(
      (opportunityScore * 0.5) +
      (technicalScore * 0.5),
      0,
      100
    )
  );

  let finalOpportunityLevel = "low";

  if (finalOpportunityScore >= 70) {
    finalOpportunityLevel = "high";
  } else if (finalOpportunityScore >= 50) {
    finalOpportunityLevel = "medium";
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
      signalStrength: "unavailable",
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
    finalOpportunityScore >= 60 &&
    bullishAlignment &&
    longRsiHealthy
  ) {
    paperSignal = "LONG";

    signalReason =
      "24h trend and EMA trend are bullish with supportive RSI";
  } else if (
    finalOpportunityScore >= 60 &&
    bearishAlignment &&
    shortRsiHealthy
  ) {
    paperSignal = "SHORT";

    signalReason =
      "24h trend and EMA trend are bearish with supportive RSI";
  }

  let signalStrength = "low";

  if (paperSignal === "WAIT") {
    signalStrength = "none";
  } else if (finalOpportunityScore >= 75) {
    signalStrength = "high";
  } else if (finalOpportunityScore >= 65) {
    signalStrength = "medium";
  }

  return {
    paperSignal,
    signalStrength,
    signalReason,
  };
}

async function fetchTechnical(symbol, signal) {
  try {
    const params = new URLSearchParams({
      symbol,
      interval: INTERVAL,
      limit: String(KLINE_LIMIT),
    });

    const response = await fetch(
      `https://data-api.binance.vision/api/v3/klines?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal,
      }
    );

    const data = await response.json();

    if (
      !response.ok ||
      !Array.isArray(data)
    ) {
      return {
        symbol,
        technicalScore: null,
        technicalLevel: "unavailable",
        technicalError:
          data?.msg ||
          "Unable to fetch candle data",
      };
    }

    const closes = data.map(
      (candle) => Number(candle[4])
    );

    const rsi14 =
      calculateRsi(closes, 14);

    const ema20 =
      calculateEma(closes, 20);

    const ema50 =
      calculateEma(closes, 50);

    const emaTrend =
      getEmaTrend(ema20, ema50);

    const technical =
      calculateTechnicalScore(
        rsi14,
        ema20,
        ema50,
        emaTrend
      );

    return {
      symbol,
      rsi14,
      rsiState: getRsiState(rsi14),
      ema20,
      ema50,
      emaTrend,
      technicalScore:
        technical.technicalScore,
      technicalLevel:
        technical.technicalLevel,
    };
  } catch (error) {
    return {
      symbol,
      technicalScore: null,
      technicalLevel: "unavailable",
      technicalError:
        error?.name === "AbortError"
          ? "Binance request timed out"
          : "Unable to calculate technical score",
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader(
      "Allow",
      ["GET"]
    );

    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  const requestedSymbol =
    req.query.symbol
      ? String(req.query.symbol)
          .toUpperCase()
          .trim()
      : null;

  if (
    requestedSymbol &&
    !/^[A-Z0-9]{5,20}$/.test(
      requestedSymbol
    )
  ) {
    return res.status(400).json({
      ok: false,
      error: "Invalid symbol format",
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
      () => controller.abort(),
      10000
    );

  try {
    const tickerParams =
      new URLSearchParams();

    if (symbols.length === 1) {
      tickerParams.set(
        "symbol",
        symbols[0]
      );
    } else {
      tickerParams.set(
        "symbols",
        JSON.stringify(symbols)
      );
    }

    const tickerResponse =
      await fetch(
        `https://data-api.binance.vision/api/v3/ticker/24hr?${tickerParams.toString()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        }
      );

    const tickerData =
      await tickerResponse.json();

    if (!tickerResponse.ok) {
      return res
        .status(tickerResponse.status)
        .json({
          ok: false,
          source: "Binance",
          error:
            tickerData?.msg ||
            "Binance ticker request failed",
          code:
            tickerData?.code ?? null,
        });
    }

    const tickers =
      (
        Array.isArray(tickerData)
          ? tickerData
          : [tickerData]
      ).map(normalizeTicker);

    const technicalResults =
      await Promise.all(
        tickers.map(
          (ticker) =>
            fetchTechnical(
              ticker.symbol,
              controller.signal
            )
        )
      );

    const technicalBySymbol =
      new Map(
        technicalResults.map(
          (item) => [
            item.symbol,
            item,
          ]
        )
      );

    const opportunities =
      tickers
        .map((ticker) => {
          const technical =
            technicalBySymbol.get(
              ticker.symbol
            ) || {
              technicalScore: null,
              technicalLevel:
                "unavailable",
            };

          const finalScore =
            calculateFinalScore(
              ticker.opportunityScore,
              technical.technicalScore
            );

          const signal =
            calculatePaperSignal({
              trendBias:
                ticker.trendBias,

              emaTrend:
                technical.emaTrend ??
                "neutral",

              rsi14:
                technical.rsi14 ??
                null,

              finalOpportunityScore:
                finalScore
                  .finalOpportunityScore,
            });

          return {
            symbol: ticker.symbol,
            price: ticker.price,

            priceChangePercent:
              ticker.priceChangePercent,

            quoteVolume:
              ticker.quoteVolume,

            tradeCount:
              ticker.tradeCount,

            opportunityScore:
              ticker.opportunityScore,

            opportunityLevel:
              ticker.opportunityLevel,

            trendBias:
              ticker.trendBias,

            rsi14:
              technical.rsi14 ??
              null,

            rsiState:
              technical.rsiState ??
              "unavailable",

            ema20:
              technical.ema20 ??
              null,

            ema50:
              technical.ema50 ??
              null,

            emaTrend:
              technical.emaTrend ??
              "neutral",

            technicalScore:
              technical.technicalScore,

            technicalLevel:
              technical.technicalLevel,

            technicalError:
              technical.technicalError ??
              null,

            ...finalScore,
            ...signal,
          };
        })
        .sort((a, b) => {
          const scoreA =
            a.finalOpportunityScore ??
            -1;

          const scoreB =
            b.finalOpportunityScore ??
            -1;

          return scoreB - scoreA;
        })
        .map((item, index) => ({
          rank: index + 1,
          ...item,
        }));

    res.setHeader(
      "Cache-Control",
      "s-maxage=10, stale-while-revalidate=20"
    );

    return res.status(200).json({
      ok: true,
      source: "Binance",
      market: "spot",
      mode: "paper-trading",
      interval: INTERVAL,
      count: opportunities.length,

      finalScoreModel:
        "opportunity-v1-50pct-technical-v1-50pct",

      signalModel:
        "trend-ema-rsi-finalscore-v1",

      weights: {
        opportunityScore: 0.5,
        technicalScore: 0.5,
      },

      disclaimer:
        "LONG, SHORT and WAIT are paper-trading research signals only. They do not execute trades and are not trading recommendations or profit guarantees.",

      opportunities,

      fetchedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    const isTimeout =
      error?.name === "AbortError";

    return res.status(502).json({
      ok: false,
      source: "Binance",

      error: isTimeout
        ? "Binance requests timed out"
        : "Unable to build combined opportunity scores",
    });
  } finally {
    clearTimeout(timeout);
  }
}
