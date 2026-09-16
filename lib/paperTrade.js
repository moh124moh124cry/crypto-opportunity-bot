import { randomUUID } from "crypto";

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeSide(side) {
  const normalized = String(side || "")
    .toUpperCase()
    .trim();

  if (
    normalized !== "LONG" &&
    normalized !== "SHORT"
  ) {
    throw new Error(
      "Paper trade side must be LONG or SHORT"
    );
  }

  return normalized;
}

function validatePositiveNumber(
  value,
  fieldName
) {
  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    throw new Error(
      `${fieldName} must be a positive number`
    );
  }

  return number;
}

export function buildPaperTrade({
  symbol,
  side,
  entryPrice,
  finalOpportunityScore = null,
  signalStrength = null,
  signalReason = null,
  takeProfitPercent = null,
  stopLossPercent = null,
  openedAt = new Date().toISOString(),
}) {
  const normalizedSymbol =
    String(symbol || "")
      .toUpperCase()
      .trim();

  if (
    !/^[A-Z0-9]{5,20}$/.test(
      normalizedSymbol
    )
  ) {
    throw new Error(
      "Invalid symbol format"
    );
  }

  const normalizedSide =
    normalizeSide(side);

  const normalizedEntryPrice =
    validatePositiveNumber(
      entryPrice,
      "entryPrice"
    );

  const tpPercent =
    takeProfitPercent === null
      ? null
      : validatePositiveNumber(
          takeProfitPercent,
          "takeProfitPercent"
        );

  const slPercent =
    stopLossPercent === null
      ? null
      : validatePositiveNumber(
          stopLossPercent,
          "stopLossPercent"
        );

  let takeProfitPrice = null;
  let stopLossPrice = null;

  if (tpPercent !== null) {
    takeProfitPrice =
      normalizedSide === "LONG"
        ? normalizedEntryPrice *
          (1 + tpPercent / 100)
        : normalizedEntryPrice *
          (1 - tpPercent / 100);
  }

  if (slPercent !== null) {
    stopLossPrice =
      normalizedSide === "LONG"
        ? normalizedEntryPrice *
          (1 - slPercent / 100)
        : normalizedEntryPrice *
          (1 + slPercent / 100);
  }

  return {
    id: randomUUID(),

    mode: "paper-trading",

    status: "OPEN",

    symbol: normalizedSymbol,

    side: normalizedSide,

    entryPrice:
      round(normalizedEntryPrice),

    currentPrice:
      round(normalizedEntryPrice),

    takeProfitPercent: tpPercent,

    stopLossPercent: slPercent,

    takeProfitPrice:
      takeProfitPrice === null
        ? null
        : round(takeProfitPrice),

    stopLossPrice:
      stopLossPrice === null
        ? null
        : round(stopLossPrice),

    finalOpportunityScore:
      finalOpportunityScore === null
        ? null
        : Number(
            finalOpportunityScore
          ),

    signalStrength,

    signalReason,

    pnlPercent: 0,

    result: null,

    openedAt,

    closedAt: null,
  };
}

export function calculatePaperPnlPercent(
  trade,
  currentPrice
) {
  const price =
    validatePositiveNumber(
      currentPrice,
      "currentPrice"
    );

  const entryPrice =
    validatePositiveNumber(
      trade.entryPrice,
      "trade.entryPrice"
    );

  const side =
    normalizeSide(trade.side);

  const rawPercent =
    side === "LONG"
      ? (
          (price - entryPrice) /
          entryPrice
        ) * 100
      : (
          (entryPrice - price) /
          entryPrice
        ) * 100;

  return round(rawPercent);
}

export function evaluatePaperTrade(
  trade,
  currentPrice,
  evaluatedAt =
    new Date().toISOString()
) {
  if (
    !trade ||
    trade.status !== "OPEN"
  ) {
    return trade;
  }

  const price =
    validatePositiveNumber(
      currentPrice,
      "currentPrice"
    );

  const side =
    normalizeSide(trade.side);

  const pnlPercent =
    calculatePaperPnlPercent(
      trade,
      price
    );

  const takeProfitPrice =
    trade.takeProfitPrice === null
      ? null
      : Number(
          trade.takeProfitPrice
        );

  const stopLossPrice =
    trade.stopLossPrice === null
      ? null
      : Number(
          trade.stopLossPrice
        );

  let status = "OPEN";
  let result = null;

  if (side === "LONG") {
    if (
      takeProfitPrice !== null &&
      price >= takeProfitPrice
    ) {
      status = "CLOSED";
      result = "WIN";
    } else if (
      stopLossPrice !== null &&
      price <= stopLossPrice
    ) {
      status = "CLOSED";
      result = "LOSS";
    }
  } else {
    if (
      takeProfitPrice !== null &&
      price <= takeProfitPrice
    ) {
      status = "CLOSED";
      result = "WIN";
    } else if (
      stopLossPrice !== null &&
      price >= stopLossPrice
    ) {
      status = "CLOSED";
      result = "LOSS";
    }
  }

  return {
    ...trade,

    status,

    currentPrice:
      round(price),

    pnlPercent,

    result,

    closedAt:
      status === "CLOSED"
        ? evaluatedAt
        : null,

    lastEvaluatedAt:
      evaluatedAt,
  };
}
