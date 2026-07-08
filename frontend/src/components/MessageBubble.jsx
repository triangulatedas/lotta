// Wraps each errors[].wrong substring in a highlighted span (orange minor,
// red severe). If a substring isn't found verbatim (model paraphrased —
// SPEC: Known Gotchas), the highlight is skipped but the note still shows.
function renderHighlighted(text, errors, severity) {
  const matches = [];
  for (const err of errors) {
    if (!err.wrong) continue;
    const start = text.indexOf(err.wrong);
    if (start === -1) continue;
    const end = start + err.wrong.length;
    if (matches.some((m) => start < m.end && end > m.start)) continue;
    matches.push({ start, end });
  }
  matches.sort((a, b) => a.start - b.start);

  const parts = [];
  let pos = 0;
  matches.forEach((m, i) => {
    if (m.start > pos) parts.push(text.slice(pos, m.start));
    parts.push(
      <span key={i} className={`err ${severity}`}>
        {text.slice(m.start, m.end)}
      </span>
    );
    pos = m.end;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return parts;
}

export default function MessageBubble({ message, onRetry }) {
  const { role, text, errors = [], severity, corrected, image } = message;

  if (role === "correction") {
    return <div className="bubble correction">🔊 {text}</div>;
  }

  if (role === "tutor") {
    return <div className="bubble tutor">{text}</div>;
  }

  return (
    <div className="user-turn">
      <div className="user-row">
        {onRetry && (
          <button
            className="retry-btn"
            onClick={onRetry}
            title="Löschen und noch einmal versuchen (z.B. falsch verstanden)"
          >
            ♻
          </button>
        )}
        <div className="bubble user">
          {image && <img className="user-image" src={image} alt="Hochgeladenes Bild" />}
          {text && renderHighlighted(text, errors, severity)}
        </div>
      </div>
      {corrected && (
        <div className="corrected-note">✓ {corrected}</div>
      )}
      {errors.map((e, i) => (
        <div key={i} className="error-note">
          ✏ {e.right} — {e.note}
        </div>
      ))}
    </div>
  );
}
