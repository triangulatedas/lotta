const BASE = "http://localhost:8000";

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}

export const health = () => fetch(BASE + "/health").then((r) => r.json());
export const startSession = () => post("/session/start");
export const respond = (session_id, user_text, mode = "conversation", input_lang = "de") =>
  post("/session/respond", { session_id, user_text, mode, input_lang });
export const resetSession = () => post("/session/reset");
export const undoTurn = (session_id) => post("/session/undo", { session_id });
