import { buildPaperTrade } from "../../lib/paperTrade";

function positiveNumberOrDefault(value, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }

  return number;
}

function buildBaseUrl(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];

  const protocol = forwardedProto
    ? String(forwardedProto).split(",")[0].trim()
    : "https";

  const host = req.headers.host;

  if (!host) {
    throw new Error(
      "Unable to determine deployment host"
    );
  }

  return `${protocol}://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);

    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
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

    const takeProfitPercent =
      positiveNumberOrDefault(
        req.query.takeProfitPercent,
        2
      );

    const stopLossPercent =
      positiveNumberOrDefault(
        req.query.stopLossPercent,
        1
      );

    const baseUrl = buildBaseUrl(req);

    const opportunitiesUrl =
      requestedSymbol
        ? `${baseUrl}/api/opportunities?symbol=${encodeURIComponent(
            requestedSymbol
          )}`
        : `${baseUrl}/api/opportunities`;

    const response =
      await fetch(opportunitiesUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

    const data = await response.json();

    if (!response.ok || !data?.ok) {
      return res.status(502).json({
        ok: false,
        error:
          data?.error ||
          "Unable to fetch current opportunities",
      });
    }

    const opportunities =
      Array.isArray(data.opportunities)
        ? data.opportunities
        : [];

    const selected =
      requestedSymbol
        ? opportunities.find(
            (item) =>
              item.symbol ===
              requestedSymbol
          )
        : opportunities.find(
            (item) =>
              item.paperSignal === "LONG" ||
              item.paperSignal === "SHORT"
          );

    if (!selected) {
      return res.status(404).json({
        ok: false,
        error: requestedSymbol
          ? "Requested symbol was not found"
          : "No LONG or SHORT paper signal is available right now",
      });
    }

    if (
      selected.paperSignal !== "LONG" &&
      selected.paperSignal !== "SHORT"
    ) {
      return res.status(409).json({
        ok: false,
        symbol: selected.symbol,
        paperSignal:
          selected.paperSignal,
        error:
          "Selected opportunity is currently WAIT, so no paper trade was created",
      });
    }

    const trade = buildPaperTrade({
      symbol: selected.symbol,
      side: selected.paperSignal,
      entryPrice: selected.price,
      finalOpportunityScore:
        selected.finalOpportunityScore,
      signalStrength:
        selected.signalStrength,
      signalReason:
        selected.signalReason,
      takeProfitPercent,
      stopLossPercent,
    });

    return res.status(200).json({
      ok: true,

      mode: "paper-trading",

      source:
        "opportunity-signal",

      note:
        "This creates an in-memory response only. The trade is not persisted yet and no real order is executed.",

      selectedOpportunity: {
        rank: selected.rank,
        symbol: selected.symbol,
        price: selected.price,
        paperSignal:
          selected.paperSignal,
        signalStrength:
          selected.signalStrength,
        signalReason:
          selected.signalReason,
        finalOpportunityScore:
          selected.finalOpportunityScore,
      },

      riskModel: {
        takeProfitPercent,
        stopLossPercent,
      },

      trade,

      createdAt:
        new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "Unable to create paper trade from opportunity",
    });
  }
}
