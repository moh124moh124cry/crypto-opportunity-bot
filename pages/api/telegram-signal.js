import { buildPaperTrade } from "../../lib/paperTrade";

const TAKE_PROFIT_PERCENT = 2;
const STOP_LOSS_PERCENT = 1;
const MIN_FINAL_SCORE = 65;

function getBaseUrl(req) {
  const forwardedProto =
    req.headers["x-forwarded-proto"];

  const forwardedHost =
    req.headers["x-forwarded-host"];

  const host =
    forwardedHost ||
    req.headers.host;

  const proto =
    forwardedProto || "https";

  if (!host) {
    return null;
  }

  return `${proto}://${host}`;
}

function getProvidedSecret(req) {
  const headerSecret =
    req.headers["x-signal-secret"];

  if (
    typeof headerSecret === "string" &&
    headerSecret
  ) {
    return headerSecret;
  }

  const authorization =
    req.headers.authorization;

  if (
    typeof authorization === "string" &&
    authorization.startsWith("Bearer ")
  ) {
    return authorization
      .slice(7)
      .trim();
  }

  return "";
}

function isStrongOpportunity(item) {
  if (!item) {
    return false;
  }

  if (
    item.paperSignal !== "LONG" &&
    item.paperSignal !== "SHORT"
  ) {
    return false;
  }

  if (
    !Number.isFinite(
      Number(
        item.finalOpportunityScore
      )
    ) ||
    Number(
      item.finalOpportunityScore
    ) < MIN_FINAL_SCORE
  ) {
    return false;
  }

  if (
    item.multiTimeframeConfirmation !==
      "aligned" ||
    item.exchangeConfirmation !==
      "aligned"
  ) {
    return false;
  }

  if (
    item.orderBookConfirmation ===
    "conflict"
  ) {
    return false;
  }

  return (
    item.signalStrength ===
      "medium" ||
    item.signalStrength ===
      "high"
  );
}

function formatNumber(value) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return "N/A";
  }

  if (
    Math.abs(number) >= 1000
  ) {
    return number.toLocaleString(
      "en-US",
      {
        maximumFractionDigits: 4,
      }
    );
  }

  return String(number);
}

function buildTelegramMessage(
  opportunity,
  trade
) {
  const sideEmoji =
    opportunity.paperSignal ===
    "LONG"
      ? "🟢"
      : "🔴";

  return [
    "📡 Crypto Opportunity Bot",
    "",
    `${sideEmoji} PAPER SIGNAL: ${opportunity.paperSignal}`,
    `Pair: ${opportunity.symbol}`,
    `Entry: ${formatNumber(trade.entryPrice)} USDT`,
    `Take Profit: ${formatNumber(trade.takeProfitPrice)} USDT (+${TAKE_PROFIT_PERCENT}%)`,
    `Stop Loss: ${formatNumber(trade.stopLossPrice)} USDT (-${STOP_LOSS_PERCENT}%)`,
    "",
    `Opportunity Score: ${formatNumber(opportunity.finalOpportunityScore)}/100`,
    `Signal Strength: ${opportunity.signalStrength}`,
    `15m EMA Trend: ${opportunity.emaTrend}`,
    `1h EMA Trend: ${opportunity.emaTrend_1h}`,
    `Order Book: ${opportunity.orderBookBias} (${formatNumber(opportunity.imbalancePercent)}%)`,
    `Exchange Consensus: ${opportunity.exchangeConsensus}`,
    `Multi-Timeframe: ${opportunity.multiTimeframeConfirmation}`,
    `Exchange Confirmation: ${opportunity.exchangeConfirmation}`,
    "",
    "⚠️ Paper-trading research signal only.",
    "No real trade is executed and no profit is guaranteed.",
  ].join("\n");
}

async function fetchTopStrongOpportunity(
  req
) {
  const baseUrl =
    getBaseUrl(req);

  if (!baseUrl) {
    throw new Error(
      "Unable to resolve application URL"
    );
  }

  const response =
    await fetch(
      `${baseUrl}/api/opportunities`,
      {
        method: "GET",

        headers: {
          Accept:
            "application/json",
        },
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data?.ok
  ) {
    throw new Error(
      data?.error ||
      "Unable to fetch opportunities"
    );
  }

  const opportunities =
    Array.isArray(
      data.opportunities
    )
      ? data.opportunities
      : [];

  const candidate =
    opportunities.find(
      isStrongOpportunity
    ) || null;

  return {
    candidate,

    scannedCount:
      opportunities.length,

    opportunitiesFetchedAt:
      data.fetchedAt ?? null,
  };
}

async function sendTelegramMessage(
  message
) {
  const botToken =
    process.env
      .TELEGRAM_BOT_TOKEN;

  const chatId =
    process.env
      .TELEGRAM_CHAT_ID;

  if (
    !botToken ||
    !chatId
  ) {
    throw new Error(
      "Telegram environment variables are not configured"
    );
  }

  const response =
    await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            chat_id:
              chatId,

            text:
              message,

            disable_web_page_preview:
              true,
          }),
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data?.ok
  ) {
    throw new Error(
      data?.description ||
      "Telegram sendMessage failed"
    );
  }

  return {
    ok: true,

    messageId:
      data?.result
        ?.message_id ??
      null,

    chatId:
      data?.result
        ?.chat?.id ??
      null,

    sentAt:
      new Date()
        .toISOString(),
  };
}

export default async function handler(
  req,
  res
) {
  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {
    res.setHeader(
      "Allow",
      [
        "GET",
        "POST",
      ]
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
    const {
      candidate,
      scannedCount,
      opportunitiesFetchedAt,
    } =
      await fetchTopStrongOpportunity(
        req
      );

    if (!candidate) {
      return res
        .status(200)
        .json({
          ok: true,

          mode:
            "paper-trading",

          action:
            "no-signal",

          sent: false,

          scannedCount,

          criteria: {
            minimumFinalOpportunityScore:
              MIN_FINAL_SCORE,

            requiredMultiTimeframeConfirmation:
              "aligned",

            requiredExchangeConfirmation:
              "aligned",

            disallowedOrderBookConfirmation:
              "conflict",

            requiredSignalStrength:
              [
                "medium",
                "high",
              ],
          },

          note:
            "No opportunity currently meets all strong-signal confirmation rules.",

          opportunitiesFetchedAt,

          checkedAt:
            new Date()
              .toISOString(),
        });
    }

    const trade =
      buildPaperTrade({
        symbol:
          candidate.symbol,

        side:
          candidate.paperSignal,

        entryPrice:
          candidate.price,

        finalOpportunityScore:
          candidate
            .finalOpportunityScore,

        signalStrength:
          candidate
            .signalStrength,

        signalReason:
          candidate
            .signalReason,

        takeProfitPercent:
          TAKE_PROFIT_PERCENT,

        stopLossPercent:
          STOP_LOSS_PERCENT,
      });

    const message =
      buildTelegramMessage(
        candidate,
        trade
      );

    if (
      req.method === "GET"
    ) {
      return res
        .status(200)
        .json({
          ok: true,

          mode:
            "paper-trading",

          action:
            "preview",

          sent: false,

          candidate,

          trade,

          telegramPreview:
            message,

          security:
            "GET never sends a Telegram message. POST requires TELEGRAM_SIGNAL_SECRET.",

          opportunitiesFetchedAt,

          checkedAt:
            new Date()
              .toISOString(),
        });
    }

    const configuredSecret =
      process.env
        .TELEGRAM_SIGNAL_SECRET;

    if (
      !configuredSecret
    ) {
      return res
        .status(503)
        .json({
          ok: false,

          sent: false,

          error:
            "TELEGRAM_SIGNAL_SECRET is not configured on the server",
        });
    }

    const providedSecret =
      getProvidedSecret(req);

    if (
      providedSecret !==
      configuredSecret
    ) {
      return res
        .status(401)
        .json({
          ok: false,

          sent: false,

          error:
            "Unauthorized",
        });
    }

    const telegram =
      await sendTelegramMessage(
        message
      );

    return res
      .status(200)
      .json({
        ok: true,

        mode:
          "paper-trading",

        action:
          "sent",

        sent: true,

        candidate: {
          symbol:
            candidate.symbol,

          paperSignal:
            candidate.paperSignal,

          finalOpportunityScore:
            candidate
              .finalOpportunityScore,

          signalStrength:
            candidate
              .signalStrength,
        },

        trade,

        telegram,

        note:
          "Telegram notification sent. No real exchange order was executed.",
      });
  } catch (error) {
    return res
      .status(502)
      .json({
        ok: false,

        sent: false,

        error:
          error?.message ||
          "Unable to prepare Telegram signal",
      });
  }
}
