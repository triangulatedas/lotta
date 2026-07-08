// Backend runs on the fixed LAN address of the RTX 3090 host. The frontend
// may be opened from any device (laptop, phone) on the network, so it always
// talks to this absolute address rather than the page's own origin.
const BASE = "http://192.168.3.225:8000";

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`${path} failed (${res.status})`);
    err.status = res.status; // let callers recover from a stale session (404)
    throw err;
  }
  return res.json();
}

export const health = () => fetch(BASE + "/health").then((r) => r.json());
export const startSession = () => post("/session/start");
export const respond = (session_id, user_text, mode = "conversation", input_lang = "de") =>
  post("/session/respond", { session_id, user_text, mode, input_lang });
export const vision = (session_id, image, user_text = "", input_lang = "de") =>
  post("/session/vision", { session_id, image, user_text, input_lang });
export const resetSession = () => post("/session/reset");
export const undoTurn = (session_id) => post("/session/undo", { session_id });
