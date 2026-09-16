export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b0f14",
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Arial, sans-serif",
        padding: "24px",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "700px" }}>
        <h1 style={{ fontSize: "42px", marginBottom: "16px" }}>
          Crypto Opportunity Bot
        </h1>

        <p style={{ fontSize: "18px", color: "#aab4c3" }}>
          Multi-exchange crypto market scanner.
        </p>

        <p style={{ marginTop: "30px", color: "#4ade80" }}>
          System initialization successful ✅
        </p>
      </div>
    </main>
  );
}
