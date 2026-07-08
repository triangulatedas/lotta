"""In-memory session state. Single user — no DB, no persistence (SPEC v1)."""

import uuid
from dataclasses import dataclass, field


@dataclass
class Session:
    history: list[dict] = field(default_factory=list)  # {"user": str, "tutor": str}
    topic: str | None = None


sessions: dict[str, Session] = {}


def create_session() -> str:
    session_id = str(uuid.uuid4())
    sessions[session_id] = Session()
    return session_id


def get_session(session_id: str) -> Session | None:
    return sessions.get(session_id)


def reset_all() -> None:
    sessions.clear()
