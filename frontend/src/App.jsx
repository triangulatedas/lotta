import { useCallback, useEffect, useRef, useState } from "react";
import { health, respond, resetSession, startSession, undoTurn } from "./api.js";
import Header from "./components/Header.jsx";
import ConversationLog from "./components/ConversationLog.jsx";
import PushToTalkButton from "./components/PushToTalkButton.jsx";
import StatusIndicator from "./components/StatusIndicator.jsx";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition.js";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis.js";

// status: idle → listening → thinking → speaking → idle
export default function App() {
  const [status, setStatus] = useState("idle");
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [mode, setMode] = useState("conversation"); // "conversation" | "training"
  const [sttLang, setSttLang] = useState("de-DE");
  const [messages, setMessages] = useState([]);

  const sessionIdRef = useRef(null);
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const testModeRef = useRef(false);
  testModeRef.current = testMode;
  const modeRef = useRef("conversation");
  modeRef.current = mode;
  const sttLangRef = useRef("de-DE");
  sttLangRef.current = sttLang;

  const { speak, cancel } = useSpeechSynthesis();

  const beginSession = useCallback(async () => {
    const { session_id, reply } = await startSession();
    sessionIdRef.current = session_id;
    setMessages([{ role: "tutor", text: reply }]);
    if (!mutedRef.current) {
      // Occupy the speaking state during the greeting too, so the mic
      // can never open while the tutor's voice is (or should be) playing
      setStatus("speaking");
      speak([reply], () => setStatus("idle"));
    }
  }, [speak]);

  // Gate the UI on /health until the model is loaded (vLLM takes 30-60s).
  // startedRef guarantees exactly one session even if the effect re-runs
  // (StrictMode double-mount, dependency changes).
  const startedRef = useRef(false);
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const h = await health();
        if (h.model_loaded && !stopped) {
          setReady(true);
          if (!startedRef.current) {
            startedRef.current = true;
            await beginSession();
          }
          return;
        }
      } catch {
        /* backend not up yet — keep polling */
      }
      if (!stopped) setTimeout(poll, 2000);
    };
    poll();
    return () => {
      stopped = true;
    };
  }, [beginSession]);

  const handleTranscript = useCallback(
    async (text) => {
      if (!text.trim()) {
        setStatus("idle");
        return;
      }
      // STT test mode: render the raw transcript only — no tutor, no TTS
      if (testModeRef.current) {
        setMessages((m) => [...m, { role: "user", text, errors: [], local: true }]);
        setStatus("idle");
        return;
      }
      setStatus("thinking");
      try {
        const currentMode = modeRef.current;
        const inputLang = { "de-DE": "de", "nb-NO": "no", "en-US": "en" }[
          sttLangRef.current
        ] ?? "de";
        const res = await respond(sessionIdRef.current, text, currentMode, inputLang);
        setMessages((m) => [
          ...m,
          {
            role: "user",
            text,
            errors: res.errors,
            severity: res.severity,
            corrected: res.corrected,
          },
        ]);

        const tutorMsgs = [];
        if (res.severity === "severe" && res.spoken_correction) {
          tutorMsgs.push({ role: "correction", text: res.spoken_correction });
        }
        tutorMsgs.push({ role: "tutor", text: res.reply });
        setMessages((m) => [...m, ...tutorMsgs]);

        // Conversation: severe corrections are spoken first (SPEC order).
        // Training: hearing the right sentence is the point — always speak
        // the corrected sentence before the feedback, any severity.
        const toSpeak = tutorMsgs.map((t) => t.text);
        if (
          currentMode === "training" &&
          res.corrected &&
          !res.spoken_correction
        ) {
          toSpeak.unshift(res.corrected);
        }

        if (mutedRef.current) {
          setStatus("idle");
        } else {
          setStatus("speaking");
          speak(toSpeak, () => setStatus("idle"));
        }
      } catch (e) {
        setMessages((m) => [
          ...m,
          { role: "tutor", text: `⚠ Verbindungsfehler: ${e.message}` },
        ]);
        setStatus("idle");
      }
    },
    [speak]
  );

  const STT_ERRORS = {
    "not-allowed":
      "Mikrofonzugriff verweigert — bitte in Chrome erlauben (Schloss-Symbol in der Adressleiste).",
    network:
      "Spracherkennung nicht erreichbar. Web Speech STT braucht Google Chrome (nicht Chromium) und eine Internetverbindung.",
    "audio-capture": "Kein Mikrofon gefunden.",
    "service-not-allowed":
      "Spracherkennungsdienst nicht verfügbar — bitte Google Chrome verwenden.",
  };

  const { start, stop, supported } = useSpeechRecognition({
    onResult: handleTranscript,
    onNoResult: (errorCode) => {
      setStatus("idle");
      const hint =
        STT_ERRORS[errorCode] ||
        `Spracherkennung beendet ohne Ergebnis (Code: ${errorCode ?? "keiner"}).`;
      setMessages((m) => [...m, { role: "tutor", text: `⚠ ${hint}` }]);
    },
  });

  const handlePress = () => {
    if (status !== "idle" || !ready) return;
    if (start(sttLangRef.current)) setStatus("listening");
  };

  const handleModeChange = (newMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    if (newMode === "conversation") setSttLang("de-DE"); // convo is German-only
    setMessages((m) => [
      ...m,
      {
        role: "tutor",
        text:
          newMode === "training"
            ? "🎯 Trainingsmodus: Sag einen deutschen Satz zum Üben — oder frag mich nach einem Wort, z.B. »Hva heter løk på tysk?« (Mikrofonsprache unten wählbar)."
            : "💬 Zurück zum Gespräch! Worüber sprechen wir?",
      },
    ]);
  };

  const handleRelease = () => {
    if (status === "listening") stop(); // final result (or onend) follows
  };

  // Global push-to-talk: holding Space or the middle mouse button acts like
  // holding the mic button. Routed through a ref so the window listeners are
  // attached once but always call the current handlers (which close over
  // status/ready).
  const talkRef = useRef({ press: () => {}, release: () => {} });
  talkRef.current = { press: handlePress, release: handleRelease };
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault(); // no page scroll, no activating a focused button
      talkRef.current.press();
    };
    const onKeyUp = (e) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      talkRef.current.release();
    };
    const onPointerDown = (e) => {
      if (e.button !== 1) return;
      e.preventDefault(); // no middle-click autoscroll
      talkRef.current.press();
    };
    const onPointerUp = (e) => {
      if (e.button !== 1) return;
      talkRef.current.release();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const handleReset = async () => {
    cancel();
    setStatus("idle");
    await resetSession();
    await beginSession();
  };

  // Delete the latest exchange (mis-transcribed STT) so it can be retried.
  // Removes the user bubble + everything after it; backend forgets the turn.
  const handleRetry = async (index) => {
    if (status !== "idle") return;
    const wasLocal = messages[index]?.local;
    setMessages((m) => m.slice(0, index));
    if (!wasLocal) {
      try {
        await undoTurn(sessionIdRef.current);
      } catch (e) {
        console.warn("undo failed:", e);
      }
    }
  };

  const handleToggleMute = () => {
    if (!muted) {
      cancel();
      if (status === "speaking") setStatus("idle");
    }
    setMuted(!muted);
  };

  return (
    <div className="app">
      <Header
        muted={muted}
        onToggleMute={handleToggleMute}
        onReset={handleReset}
        resetDisabled={!ready || status === "thinking"}
        testMode={testMode}
        onToggleTestMode={() => setTestMode(!testMode)}
        mode={mode}
        onModeChange={handleModeChange}
      />
      <ConversationLog
        messages={messages}
        onRetry={status === "idle" ? handleRetry : null}
      />
      <footer className="footer">
        <StatusIndicator status={status} ready={ready} />
        {mode === "training" && (
          <div className="lang-picker">
            {[
              ["de-DE", "🇩🇪 Deutsch"],
              ["nb-NO", "🇳🇴 Norsk"],
              ["en-US", "🇬🇧 English"],
            ].map(([code, label]) => (
              <button
                key={code}
                className={`lang-chip ${sttLang === code ? "active" : ""}`}
                disabled={status !== "idle"}
                onClick={() => setSttLang(code)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {supported ? (
          <PushToTalkButton
            disabled={!ready || (status !== "idle" && status !== "listening")}
            listening={status === "listening"}
            onPress={handlePress}
            onRelease={handleRelease}
          />
        ) : (
          <p className="unsupported">
            Web Speech API nicht verfügbar — bitte Chrome verwenden.
          </p>
        )}
      </footer>
    </div>
  );
}
