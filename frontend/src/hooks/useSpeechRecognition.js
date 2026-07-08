import { useRef } from "react";

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

// Push-to-talk STT (SPEC): starts on button press, stops on release/result.
// No continuous listening. onResult fires with the final transcript;
// onNoResult fires when recognition ends without one (no-speech, denied mic,
// released without speaking) so the state machine can return to idle.
export function useSpeechRecognition({ onResult, onNoResult }) {
  const recRef = useRef(null);

  const start = (lang = "de-DE") => {
    if (!SR) return false;

    // App-level state (button disabled while speaking/thinking) is the
    // authoritative mutual exclusion. If speechSynthesis still claims to be
    // speaking here, it's either wedged (Linux Chrome with no working TTS
    // voices never clears the flag) or leftover queue — clear it.
    if (window.speechSynthesis?.speaking) {
      console.warn("[stt] speechSynthesis wedged in speaking state — cancelling");
      window.speechSynthesis.cancel();
    }

    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    // continuous: don't finalize-and-stop at the first speech pause —
    // beginners pause mid-sentence. Segments accumulate until the button
    // is released (still push-to-talk, NOT hands-free listening).
    rec.continuous = true;

    let finalText = "";
    let errorCode = null;
    const t0 = performance.now();
    const log = (label) =>
      console.log(`[stt +${Math.round(performance.now() - t0)}ms]`, label);
    rec.onstart = () => log("onstart");
    rec.onspeechstart = () => log("onspeechstart");
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      }
      log(`onresult (buffer: ${JSON.stringify(finalText)})`);
    };
    rec.onerror = (e) => {
      errorCode = e.error;
      log(`onerror: ${e.error} ${e.message || ""}`);
    };
    // The complete transcript is delivered here — after release/stop(),
    // once pending audio has finalized.
    rec.onend = () => {
      log(`onend (buffer=${JSON.stringify(finalText)}, error=${errorCode})`);
      recRef.current = null;
      const text = finalText.trim();
      if (text) onResult(text);
      else onNoResult(errorCode);
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
      return false;
    }
    return true;
  };

  const stop = () => recRef.current?.stop();

  return { start, stop, supported: Boolean(SR) };
}
