import {
  buildPaperTrade,
  evaluatePaperTrade,
} from "../../lib/paperTrade";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);

    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    const side = String(req.query.side || "LONG")
      .toUpperCase()
      .trim();

    const entryPrice = Number(
      req.query.entryPrice || 100
    );

    const currentPrice = Number(
      req.query.currentPrice || 102
    );

    const takeProfitPercent = Number(
      req.query.takeProfitPercent || 2
    );

    const stopLossPercent = Number(
      req.query.stopLossPercent || 1
    );

    const trade = buildPaperTrade({
      symbol: "BTCUSDT",
      side,
      entryPrice,
      finalOpportunityScore: 70,
      signalStrength: "test",
      signalReason:
        "Paper trade helper validation",
      takeProfitPercent,
      stopLossPercent,
    });

    const evaluatedTrade =
      evaluatePaperTrade(
        trade,
        currentPrice
      );

    return res.status(200).json({
      ok: true,
      test: "paper-trade-helper",

      input: {
        side,
        entryPrice,
        currentPrice,
        takeProfitPercent,
        stopLossPercent,
      },

      trade,

      evaluatedTrade,
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error:
        error?.message ||
        "Paper trade test failed",
    });
  }
}
