export default function Header({
  muted,
  onToggleMute,
  onReset,
  resetDisabled,
  testMode,
  onToggleTestMode,
  mode,
  onModeChange,
}) {
  return (
    <header className="header">
      <h1>Lotta 🇩🇪</h1>
      <div className="header-actions">
        <div className="mode-toggle">
          <button
            className={mode === "conversation" ? "active" : ""}
            onClick={() => onModeChange("conversation")}
            title="Gesprächsmodus: freie Konversation zu einem Thema"
          >
            💬
          </button>
          <button
            className={mode === "training" ? "active" : ""}
            onClick={() => onModeChange("training")}
            title="Trainingsmodus: Sätze üben & Wörter nachschlagen"
          >
            🎯
          </button>
        </div>
        <button
          className={`test-btn ${testMode ? "active" : ""}`}
          onClick={onToggleTestMode}
          title="STT-Testmodus: zeigt nur die Transkription, keine Tutor-Antwort"
        >
          🧪 Test
        </button>
        <button
          className="icon-btn"
          onClick={onToggleMute}
          title={muted ? "Ton einschalten" : "Stummschalten"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button className="reset-btn" onClick={onReset} disabled={resetDisabled}>
          Neues Gespräch
        </button>
      </div>
    </header>
  );
}
