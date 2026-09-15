# =============================================================================
#  memory.py — Conversation History & Preferences Persistence
#  Saves and loads Jarvis's memory to/from a JSON file.
# =============================================================================

import json
import os
import datetime
import config

# ---------------------------------------------------------------------------
# Internal state
# ---------------------------------------------------------------------------
_memory: dict = {
    "preferences": {},
    "history":     [],
    "sessions":    [],
}

# ---------------------------------------------------------------------------
# Load from disk
# ---------------------------------------------------------------------------
def load() -> None:
    """Load memory from MEMORY_FILE. Silent if file doesn't exist yet."""
    global _memory
    if os.path.exists(config.MEMORY_FILE):
        try:
            with open(config.MEMORY_FILE, "r", encoding="utf-8") as f:
                _memory = json.load(f)
            print(f"  [Memory] Loaded memory from {config.MEMORY_FILE}")
        except (json.JSONDecodeError, IOError) as e:
            print(f"  [Memory] Could not load memory: {e} — starting fresh.")
            _memory = {"preferences": {}, "history": [], "sessions": []}
    else:
        print("  [Memory] No previous memory found — starting fresh.")

# ---------------------------------------------------------------------------
# Save to disk
# ---------------------------------------------------------------------------
def save() -> None:
    """Persist current memory to MEMORY_FILE."""
    try:
        with open(config.MEMORY_FILE, "w", encoding="utf-8") as f:
            json.dump(_memory, f, ensure_ascii=False, indent=2)
    except IOError as e:
        print(f"  [Memory] Could not save memory: {e}")

# ---------------------------------------------------------------------------
# Conversation history
# ---------------------------------------------------------------------------
def get_history() -> list[dict]:
    """Return saved conversation history."""
    return _memory.get("history", [])

def update_history(history: list[dict]) -> None:
    """Update the in-memory history (called periodically from main loop)."""
    _memory["history"] = history

# ---------------------------------------------------------------------------
# Preferences
# ---------------------------------------------------------------------------
def set_preference(key: str, value) -> None:
    _memory.setdefault("preferences", {})[key] = value
    save()

def get_preference(key: str, default=None):
    return _memory.get("preferences", {}).get(key, default)

# ---------------------------------------------------------------------------
# Session log
# ---------------------------------------------------------------------------
def log_session_start() -> None:
    """Record the start of a new Jarvis session."""
    session = {
        "start": datetime.datetime.now().isoformat(),
        "end":   None,
    }
    _memory.setdefault("sessions", []).append(session)
    save()

def log_session_end() -> None:
    """Mark the last session as ended and save."""
    sessions = _memory.get("sessions", [])
    if sessions and sessions[-1]["end"] is None:
        sessions[-1]["end"] = datetime.datetime.now().isoformat()
    save()

def get_session_count() -> int:
    return len(_memory.get("sessions", []))

# ---------------------------------------------------------------------------
# Summary helper
# ---------------------------------------------------------------------------
def get_summary() -> str:
    """Return a human-readable memory summary for startup greeting."""
    count = get_session_count()
    lang  = get_preference("language", config.DEFAULT_LANGUAGE)
    if count > 1:
        return f"Welcome back. This is session number {count}. Your preferred language is {lang.title()}."
    return "Hello! This appears to be our first session."
