import { useState } from "react";

// Typed input for practising when speaking aloud isn't possible (commuting,
// quiet rooms). Submitting drives the exact same pipeline as the mic.
export default function TextInput({ disabled, onSubmit }) {
  const [value, setValue] = useState("");

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSubmit(text);
    setValue("");
  };

  return (
    <form
      className="text-input"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder="… oder tippen"
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        Senden
      </button>
    </form>
  );
}
