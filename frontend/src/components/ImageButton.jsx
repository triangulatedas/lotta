import { useRef } from "react";

const MAX_EDGE = 896; // Gemma-3 processes ~896² — no point sending more pixels

// Downscale to a JPEG data URL so the payload stays ~50-150 KB instead of the
// multi-MB original a phone camera produces.
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht gelesen werden."));
    };
    img.src = url;
  });
}

// A 📷 button backed by a hidden file input. `capture="environment"` makes
// mobile open the rear camera directly; on desktop it's a normal file picker.
export default function ImageButton({ disabled, onImage }) {
  const inputRef = useRef(null);

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      onImage(dataUrl);
    } catch (err) {
      onImage(null, err.message);
    }
  };

  return (
    <>
      <button
        className="image-btn"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        title="Foto aufnehmen oder hochladen — Lotta beschreibt, was sie sieht"
      >
        📷
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleChange}
      />
    </>
  );
}
