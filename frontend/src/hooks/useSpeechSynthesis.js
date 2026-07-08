import { useCallback, useEffect, useRef } from "react";

export function useSpeechSynthesis() {
  const voiceRef = useRef(null);

  useEffect(() => {
    // getVoices() returns [] until voiceschanged fires (SPEC: Known Gotchas)
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      voiceRef.current =
        voices.find((v) => v.name.includes("Google Deutsch")) ||
        voices.find((v) => v.lang.startsWith("de")) ||
        null;
      console.log(
        `[tts] ${voices.length} voices, picked:`,
        voiceRef.current?.name ?? "none"
      );
    };
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pick);
  }, []);

  // Queue one utterance per text (severe: [spoken_correction, reply]).
  // onAllDone fires exactly once after the last utterance ends OR errors —
  // a TTS failure must not wedge the state machine in "speaking".
  // Stable identities — App builds callbacks (and an effect chain) on top
  // of these; fresh functions every render caused a session-restart loop.
  const speak = useCallback((texts, onAllDone) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    // Chrome drops utterances when speak() races a cancel() — queue next tick
    setTimeout(() => {
      let remaining = texts.length;
      if (remaining === 0) return onAllDone();
      let finished = false;
      const finishAll = () => {
        if (finished) return;
        finished = true;
        onAllDone();
      };
      // Linux Chrome with no working speech engine never starts an
      // utterance and leaves synth.speaking stuck true — without this
      // watchdog the app would wedge in "speaking" forever.
      let anyStarted = false;
      const watchdog = setTimeout(() => {
        if (!anyStarted) {
          console.warn("[tts] nothing started within 2.5s — TTS unavailable, continuing silently");
          synth.cancel();
          finishAll();
        }
      }, 2500);
      texts.forEach((text) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "de-DE";
        if (voiceRef.current) u.voice = voiceRef.current;
        u.onstart = () => {
          anyStarted = true;
        };
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          if (--remaining === 0) {
            clearTimeout(watchdog);
            finishAll();
          }
        };
        u.onend = settle;
        u.onerror = settle;
        synth.speak(u);
      });
    }, 0);
  }, []);

  const cancel = useCallback(() => window.speechSynthesis.cancel(), []);

  return { speak, cancel };
}
