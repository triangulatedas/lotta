const LABELS = {
  loading: "Modell lädt …",
  idle: "Bereit",
  listening: "Ich höre zu",
  thinking: "Denke nach …",
  speaking: "Ich spreche",
};

export default function StatusIndicator({ status, ready }) {
  const key = ready ? status : "loading";
  return (
    <div className={`status status-${key}`}>
      <span className="dot" />
      {LABELS[key]}
    </div>
  );
}
