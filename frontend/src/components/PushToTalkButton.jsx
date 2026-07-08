// Pointer capture keeps pointerup delivered to the button even when the
// cursor slides off while held — no stuck-listening state.
export default function PushToTalkButton({ disabled, listening, onPress, onRelease }) {
  return (
    <button
      className={`talk ${listening ? "listening" : ""}`}
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onPress();
      }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
    >
      🎤 {listening ? "Ich höre zu …" : "Halten zum Sprechen"}
    </button>
  );
}
