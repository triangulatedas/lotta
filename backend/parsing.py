"""JSON parse-fallback chain for the LLM output (SPEC: JSON Reliability).

Never raises — on total failure the raw model text becomes the reply and
the response degrades to severity "none". Parse failures are printed to
stdout for prompt tuning.
"""

import json
import re

SEVERITIES = {"severe", "minor", "none"}


def _fallback(raw: str) -> dict:
    # Salvage the reply string even from JSON truncated mid-string by
    # max_tokens — the tutor must never read raw JSON aloud.
    reply = raw.strip()
    match = re.search(r'"reply"\s*:\s*"((?:[^"\\]|\\.)*)', raw, re.DOTALL)
    if match and match.group(1).strip():
        try:
            reply = json.loads(f'"{match.group(1)}"')
        except json.JSONDecodeError:
            reply = match.group(1)
    elif reply.startswith("{"):
        reply = "Entschuldigung, ich bin durcheinandergekommen. Kannst du das noch einmal sagen?"
    return {
        "severity": "none",
        "corrected": None,
        "errors": [],
        "spoken_correction": None,
        "reply": reply,
    }


def _try_load(text: str) -> dict | None:
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, ValueError):
        return None


def _normalize(data: dict, user_text: str) -> dict:
    severity = data.get("severity")
    if severity not in SEVERITIES:
        severity = "none"

    corrected = data.get("corrected")
    if not isinstance(corrected, str) or not corrected.strip():
        corrected = None

    errors = []
    raw_errors = data.get("errors")
    if isinstance(raw_errors, list):
        for e in raw_errors:
            if not isinstance(e, dict):
                continue
            wrong, right, note = e.get("wrong"), e.get("right"), e.get("note")
            if not isinstance(wrong, str) or not isinstance(right, str):
                continue
            # drop hallucinated non-corrections ("wohnen" -> "wohnen")
            if wrong.strip().lower() == right.strip().lower():
                continue
            errors.append({
                "wrong": wrong,
                "right": right,
                "note": note if isinstance(note, str) else "",
            })

    # The model often leaves `corrected` null on minor errors — synthesize
    # it from the replacements so the frontend can always show the full
    # corrected sentence.
    if corrected is None and errors:
        corrected = user_text
        for e in errors:
            corrected = corrected.replace(e["wrong"], e["right"], 1)
        if corrected == user_text:
            corrected = None  # no replacement applied (paraphrased "wrong")

    spoken = data.get("spoken_correction")
    if severity != "severe" or not isinstance(spoken, str) or not spoken.strip():
        spoken = None

    reply = data.get("reply")
    if not isinstance(reply, str) or not reply.strip():
        reply = "Entschuldigung, kannst du das bitte wiederholen?"
    # the model sometimes prefixes its own name (transcript style leak)
    reply = re.sub(r"^\s*Lotta\s*:\s*", "", reply)

    return {
        "severity": severity,
        "corrected": corrected,
        "errors": errors,
        "spoken_correction": spoken,
        "reply": reply.strip(),
    }


def parse_llm_response(raw: str, user_text: str) -> dict:
    # 1. Raw output as-is
    data = _try_load(raw.strip())

    # 2. Strip markdown fences / extract first {...} block
    if data is None:
        stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
        data = _try_load(stripped)
    if data is None:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            data = _try_load(match.group(0))

    # 3. Total failure: degrade gracefully, never 500
    if data is None:
        print(f"[parse-failure] user_text={user_text!r} raw={raw!r}", flush=True)
        return _fallback(raw)

    return _normalize(data, user_text)
