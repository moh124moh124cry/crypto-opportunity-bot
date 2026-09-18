import { useCallback, useEffect, useMemo, useState } from "react";

const REFRESH_MS = 30000;

function formatPrice(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "N/A";
  }

  if (number >= 1000) {
    return number.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (number >= 1) {
    return number.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 8,
  });
}

function formatPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "N/A";
  }

  return `${number.toFixed(2)}%`;
}

function getSignalColor(signal) {
  if (signal === "LONG") {
    return "#22c55e";
  }

  if (signal === "SHORT") {
    return "#ef4444";
  }

  return "#94a3b8";
}

function getSignalBackground(signal) {
  if (signal === "LONG") {
    return "rgba(34, 197, 94, 0.12)";
  }

  if (signal === "SHORT") {
    return "rgba(239, 68, 68, 0.12)";
  }

  return "rgba(148, 163, 184, 0.10)";
}

function getPaperLevels(item) {
  const price = Number(item?.price);

  if (!Number.isFinite(price)) {
    return {
      takeProfit: null,
      stopLoss: null,
    };
  }

  if (item.paperSignal === "LONG") {
    return {
      takeProfit: price * 1.02,
      stopLoss: price * 0.99,
    };
  }

  if (item.paperSignal === "SHORT") {
    return {
      takeProfit: price * 0.98,
      stopLoss: price * 1.01,
    };
  }

  return {
    takeProfit: null,
    stopLoss: null,
  };
}

function StatusPill({ label, value, tone = "neutral" }) {
  const colors = {
    good: {
      color: "#4ade80",
      background: "rgba(74, 222, 128, 0.10)",
      border: "rgba(74, 222, 128, 0.25)",
    },

    bad: {
      color: "#f87171",
      background: "rgba(248, 113, 113, 0.10)",
      border: "rgba(248, 113, 113, 0.25)",
    },

    neutral: {
      color: "#cbd5e1",
      background: "rgba(148, 163, 184, 0.10)",
      border: "rgba(148, 163, 184, 0.22)",
    },
  };

  const selected = colors[tone] || colors.neutral;

  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: "12px",
        background: selected.background,
        border: `1px solid ${selected.border}`,
      }}
    >
      <div
        style={{
          color: "#7f8da3",
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: "5px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: selected.color,
          fontSize: "14px",
          fontWeight: 700,
          textTransform: "capitalize",
        }}
      >
        {value ?? "N/A"}
      </div>
    </div>
  );
}

function OpportunityCard({ item }) {
  const signalColor = getSignalColor(item.paperSignal);

  const levels = getPaperLevels(item);

  return (
    <article
      style={{
        background: "#111827",
        border: "1px solid #1f2937",
        borderRadius: "18px",
        padding: "18px",
        boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "14px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              color: "#64748b",
              fontSize: "12px",
              marginBottom: "5px",
            }}
          >
            Rank #{item.rank}
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: "23px",
            }}
          >
            {item.symbol}
          </h2>

          <div
            style={{
              color: "#94a3b8",
              marginTop: "6px",
              fontSize: "14px",
            }}
          >
            Price:{" "}
            <strong
              style={{
                color: "#f8fafc",
              }}
            >
              {formatPrice(item.price)} USDT
            </strong>
          </div>
        </div>

        <div
          style={{
            minWidth: "110px",
            textAlign: "center",
            padding: "12px 16px",
            borderRadius: "14px",
            color: signalColor,
            background: getSignalBackground(item.paperSignal),
            border: `1px solid ${signalColor}44`,
          }}
        >
          <div
            style={{
              fontSize: "20px",
              fontWeight: 800,
            }}
          >
            {item.paperSignal}
          </div>

          <div
            style={{
              fontSize: "11px",
              marginTop: "3px",
              textTransform: "uppercase",
              opacity: 0.8,
            }}
          >
            {item.signalStrength || "none"}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(135px, 1fr))",
          gap: "10px",
          marginTop: "18px",
        }}
      >
        <StatusPill
          label="Final Score"
          value={
            Number.isFinite(
              Number(item.finalOpportunityScore)
            )
              ? `${Number(
                  item.finalOpportunityScore
                ).toFixed(2)}/100`
              : "N/A"
          }
          tone={
            Number(item.finalOpportunityScore) >= 70
              ? "good"
              : "neutral"
          }
        />

        <StatusP
