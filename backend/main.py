"""German tutor backend — FastAPI + vLLM. Run single-worker, no --reload:

    uvicorn main:app --host 127.0.0.1 --port 8000
"""

import asyncio
import base64
import io
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

import llm
import state
from parsing import parse_llm_response
from prompts import (
    build_prompt,
    build_training_prompt,
    build_translation_prompt,
    build_vision_prompt,
)

GREETING = "Hallo! Worüber möchtest du heute sprechen?"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Engine loads in the background so /health answers immediately with
    # model_loaded=false while the ~30-60s load runs (SPEC: Known Gotchas).
    load_task = asyncio.create_task(llm.init_engine())
    yield
    load_task.cancel()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # The frontend may be served from any device/IP on the LAN (laptop, phone
    # for the camera feature), so the request Origin varies. This is a
    # single-user tool on a trusted local network; no credentials are sent, so
    # a wildcard is fine and avoids maintaining an origin list.
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)


class RespondRequest(BaseModel):
    session_id: str
    user_text: str
    mode: str = "conversation"  # "conversation" | "training"
    input_lang: str = "de"  # mic language: "de" | "no" | "en"


class VisionRequest(BaseModel):
    session_id: str
    image: str  # base64 data URL of the photo
    user_text: str = ""  # optional spoken/typed note to accompany the image
    input_lang: str = "de"


def _decode_data_url(data_url: str) -> Image.Image:
    """Decode a base64 (data:) URL into an RGB PIL image. .convert('RGB')
    avoids RGBA/palette-mode surprises in the SigLIP preprocessor."""
    b64 = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")


class UndoRequest(BaseModel):
    session_id: str


class ErrorItem(BaseModel):
    wrong: str
    right: str
    note: str


class TutorResponse(BaseModel):
    severity: str
    corrected: str | None
    errors: list[ErrorItem]
    spoken_correction: str | None
    reply: str


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": llm.is_loaded(),
        "load_error": llm.load_error(),
    }


@app.post("/session/start")
async def session_start():
    state.reset_all()
    session_id = state.create_session()
    return {"session_id": session_id, "reply": GREETING}


@app.post("/session/respond", response_model=TutorResponse)
async def session_respond(req: RespondRequest):
    if not llm.is_loaded():
        raise HTTPException(status_code=503, detail="model still loading")

    session = state.get_session(req.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="unknown session_id")

    user_text = req.user_text.strip()
    if not user_text:
        raise HTTPException(status_code=422, detail="empty user_text")

    if req.mode == "training" and req.input_lang in ("no", "en"):
        # Mic was set to Norwegian/English → by definition a translation
        # ask. Deterministic routing: the 7B model misclassifies fluent
        # Norwegian as a good German sentence ("Sehr gut!").
        prompt = build_translation_prompt(user_text, req.input_lang)
    elif req.mode == "training":
        # standalone drill turns: no topic, no conversation steering
        prompt = build_training_prompt(session.history, user_text)
    else:
        if session.topic is None:
            session.topic = user_text  # first turn after greeting establishes the topic
        prompt = build_prompt(session.history, session.topic, user_text)
    raw = await llm.generate(prompt)
    result = parse_llm_response(raw, user_text)

    session.history.append({"user": user_text, "tutor": result["reply"]})
    return result


@app.post("/session/vision", response_model=TutorResponse)
async def session_vision(req: VisionRequest):
    """Lotta 'sees' a photo: describes the scene and names objects in German
    (with articles), still correcting any German the student wrote. Reuses the
    same TutorResponse schema so the frontend render + TTS path is unchanged."""
    if not llm.is_loaded():
        raise HTTPException(status_code=503, detail="model still loading")

    session = state.get_session(req.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="unknown session_id")

    try:
        pil = _decode_data_url(req.image)
    except Exception:
        raise HTTPException(status_code=422, detail="invalid image")

    user_text = req.user_text.strip()
    prompt = build_vision_prompt(session.history, user_text)
    raw = await llm.generate(prompt, image=pil)
    result = parse_llm_response(raw, user_text or "[Bild]")

    # History stays text-only (cheap): record a [Bild] marker, not the bytes,
    # so subsequent voice/text turns can discuss the image via Lotta's reply.
    marker = f"[Bild] {user_text}".strip()
    session.history.append({"user": marker, "tutor": result["reply"]})
    return result


@app.post("/session/undo")
async def session_undo(req: UndoRequest):
    """Drop the last exchange (e.g. STT transcribed garbage) so the user
    can retry it without the mangled turn polluting the tutor's context."""
    session = state.get_session(req.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="unknown session_id")
    if session.history:
        session.history.pop()
        if not session.history:
            session.topic = None  # undid the topic-establishing first turn
    return {"ok": True}


@app.post("/session/reset")
async def session_reset():
    state.reset_all()
    return {"ok": True}
