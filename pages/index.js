import { useEffect, useState } from "react";

const REFRESH_MS = 30000;

function price(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) return "N/A";

  return n.toLocaleString("en-US", {
    minimumFractionDigits: n >= 1 ? 2 : 4,
    maximumFractionDigits: n >= 1000 ? 2 : n >= 1 ? 4 : 8,
  });
}

function signalColor(signal) {
  if (signal === "LONG") return "#22c55e";
  if (signal === "SHORT") return "#ef4444";
  return "#94a3b8";
}

function Card({ item }) {
  const color = signalColor(item.paperSignal);
  const currentPrice = Number(item.price);

  let takeProfit = null;
  let stopLoss = null;

  if (item.paperSignal === "LONG") {
    takeProfit = currentPrice * 1.02;
    stopLoss = currentPrice * 0.99;
  }

  if (item.paperSignal === "SHORT") {
    takeProfit = currentPrice * 0.98;
    stopLoss = currentPrice * 1.01;
  }

  return (
    <div
      style={{
        background: "#111827",
        border: "1px solid #1f2937",
        borderRadius: "18px",
        padding: "18px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div>
          <div
            style={{
              color: "#64748b",
              fontSize: "12px",
            }}
          >
            Rank #{item.rank}
          </div>

          <h2
            style={{
              margin: "5px 0",
              fontSize: "22px",
            }}
          >
            {item.symbol}
          </h2>

          <div
            style={{
              color: "#94a3b8",
              fontSize: "14px",
            }}
          >
            {price(item.price)} USDT
          </div>
        </div>

        <div
          style={{
            color,
            border: `1px solid ${color}`,
            borderRadius: "12px",
            padding: "10px 14px",
            fontWeight: 800,
            textAlign: "center",
          }}
        >
          <div>{item.paperSignal}</div>

          <div
            style={{
              fontSize: "10px",
              marginTop: "4px",
              textTransform: "uppercase",
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
            "repeat(2, minmax(0, 1fr))",
          gap: "9px",
          marginTop: "16px",
        }}
      >
        <Info
          label="Final Score"
          value={`${Number(
            item.finalOpportunityScore || 0
          ).toFixed(2)}/100`}
        />

        <Info
          label="RSI 15m"
          value={
            item.rsi14 !== null &&
            item.rsi14 !== undefined
              ? Number(item.rsi14).toFixed(2)
              : "N/A"
          }
        />

        <Info
          label="EMA 15m"
          value={item.emaTrend || "N/A"}
        />

        <Info
          label="EMA 1h"
          value={item.emaTrend_1h || "N/A"}
        />

        <Info
          label="Order Book"
          value={item.orderBookBias || "N/A"}
        />

        <Info
          label="Exchanges"
          value={item.exchangeConsensus || "N/A"}
        />
      </div>

      {item.paperSignal !== "WAIT" &&
        takeProfit &&
        stopLoss && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "9px",
              marginTop: "12px",
            }}
          >
            <div
              style={{
                background:
                  "rgba(34,197,94,0.08)",
                border:
                  "1px solid rgba(34,197,94,0.25)",
                borderRadius: "12px",
                padding: "11px",
              }}
            >
              <div
                style={{
                  color: "#64748b",
                  fontSize: "10px",
                }}
              >
                TAKE PROFIT +2%
              </div>

              <strong
                style={{
                  color: "#4ade80",
                  display: "block",
                  marginTop: "5px",
                }}
              >
                {price(takeProfit)}
              </strong>
            </div>

            <div
              style={{
                background:
                  "rgba(239,68,68,0.08)",
                border:
                  "1px solid rgba(239,68,68,0.25)",
                borderRadius: "12px",
                padding: "11px",
              }}
            >
              <div
                style={{
                  color: "#64748b",
                  fontSize: "10px",
                }}
              >
                STOP LOSS -1%
              </div>

              <strong
                style={{
                  color: "#f87171",
                  display: "block",
                  marginTop: "5px",
                }}
              >
                {price(stopLoss)}
              </strong>
            </div>
          </div>
        )}

      <div
        style={{
          marginTop: "12px",
          background: "#0b1220",
          borderRadius: "12px",
          padding: "12px",
          color: "#94a3b8",
          fontSize: "12px",
          lineHeight: 1.5,
        }}
      >
        {item.signalReason ||
          "No active signal reason."}
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div
      style={{
        background: "#0b1220",
        border: "1px solid #1e293b",
        borderRadius: "11px",
        padding: "10px",
      }}
    >
      <div
        style={{
          color: "#64748b",
          fontSize: "10px",
          marginBottom: "4px",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: "#e2e8f0",
          fontSize: "13px",
          fontWeight: 700,
          textTransform: "capitalize",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] =
    useState(false);

  async function load(manual = false) {
    if (manual) {
      setRefreshing(true);
    }

    try {
      const response = await fetch(
        "/api/opportunities",
        {
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.error ||
            "Unable to load opportunities"
        );
      }

      setData(result);
      setError("");
    } catch (err) {
      setError(
        err?.message ||
          "Unable to load opportunities"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();

    const timer = setInterval(() => {
      load();
    }, REFRESH_MS);

    return () => clearInterval(timer);
  }, []);

  const opportunities =
    Array.isArray(data?.opportunities)
      ? data.opportunities
      : [];

  const activeSignals =
    opportunities.filter(
      (item) =>
        item.paperSignal === "LONG" ||
        item.paperSignal === "SHORT"
    );

  const topSignal =
    activeSignals[0] || null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg,#0c1424,#05070b)",
        color: "#fff",
        fontFamily:
          "Arial, Helvetica, sans-serif",
        padding: "20px 14px 40px",
      }}
    >
      <div
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            color: "#4ade80",
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          ● LIVE MARKET SCANNER
        </div>

        <h1
          style={{
            margin: "8px 0 4px",
            fontSize: "32px",
          }}
        >
          Crypto Opportunity Bot
        </h1>

        <p
          style={{
            color: "#94a3b8",
            marginTop: "0",
          }}
        >
          Multi-exchange paper signal dashboard
        </p>

        <button
          onClick={() => load(true)}
          disabled={refreshing}
          style={{
            background: "#172033",
            color: "#fff",
            border: "1px solid #334155",
            borderRadius: "11px",
            padding: "11px 15px",
            fontWeight: 700,
            marginBottom: "16px",
          }}
        >
          {refreshing
            ? "Refreshing..."
            : "Refresh Market"}
        </button>

        {error && (
          <div
            style={{
              color: "#fca5a5",
              background:
                "rgba(239,68,68,0.10)",
              padding: "12px",
              borderRadius: "12px",
              marginBottom: "15px",
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div
            style={{
              color: "#94a3b8",
              padding: "20px 0",
            }}
          >
            Scanning Binance, Bybit, OKX and
            Bitget...
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "9px",
                marginBottom: "16px",
              }}
            >
              <Info
                label="Pairs Scanned"
                value={opportunities.length}
              />

              <Info
                label="Active Signals"
                value={activeSignals.length}
              />

              <Info
                label="Top Signal"
                value={
                  topSignal
                    ? `${topSignal.symbol} ${topSignal.paperSignal}`
                    : "WAIT"
                }
              />

              <Info
                label="Auto Refresh"
                value="30 seconds"
              />
            </div>

            {topSignal && (
              <div
                style={{
                  border: `1px solid ${signalColor(
                    topSignal.paperSignal
                  )}`,
                  borderRadius: "15px",
                  padding: "15px",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    color: "#94a3b8",
                    fontSize: "11px",
                  }}
                >
                  TOP ACTIVE PAPER SIGNAL
                </div>

                <strong
                  style={{
                    display: "block",
                    marginTop: "7px",
                    fontSize: "22px",
                    color: signalColor(
                      topSignal.paperSignal
                    ),
                  }}
                >
                  {topSignal.symbol} —{" "}
                  {topSignal.paperSignal}
                </strong>
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "13px",
              }}
            >
              {opportunities.map((item) => (
                <Card
                  key={item.symbol}
                  item={item}
                />
              ))}
            </div>
          </>
        )}

        <div
          style={{
            color: "#64748b",
            fontSize: "11px",
            lineHeight: 1.6,
            textAlign: "center",
            marginTop: "22px",
          }}
        >
          Paper-trading research only. No real
          exchange order is executed and no profit
          is guaranteed.
        </div>
      </div>
    </main>
  );
}
