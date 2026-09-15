# =============================================================================
#  backend/server.py — FastAPI + WebSocket server for Jarvis Web HUD
#  + Neural Knowledge & Self-Learning REST Endpoints
#  + Voice Audio Recording Archive & Stream Storage
# =============================================================================

import os
import sys
import json
import logging
import datetime
import asyncio
from pathlib import Path
from typing import Set, Dict, Any, List

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

try:
    from backend.jarvis_bridge import bridge
except ImportError:
    from jarvis_bridge import bridge

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("JarvisServer")

ROOT_DIR = Path(__file__).resolve().parent.parent
RECORDINGS_DIR = ROOT_DIR / "recordings"
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Jarvis AI Assistant API",
    description="Real-time WebSocket & REST bridge for Jarvis with Continuous Self-Learning and Audio Storage",
    version="1.2.0"
)

# CORS middleware for React Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MessageRequest(BaseModel):
    text: str
    persona: str = "jarvis"
    language: str = ""


class FactRequest(BaseModel):
    key: str
    value: str


class RuleRequest(BaseModel):
    rule: str


class ConnectionManager:
    """Manages active WebSocket client connections."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Client connected. Active clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"Client disconnected. Active clients: {len(self.active_connections)}")

    async def send_json(self, websocket: WebSocket, data: dict):
        try:
            await websocket.send_json(data)
        except Exception as e:
            logger.error(f"Error sending message to client: {e}")


manager = ConnectionManager()


@app.get("/")
async def root():
    return {
        "status": "Jarvis Backend is online",
        "endpoints": {
            "websocket": "/ws",
            "status": "/api/status",
            "chat": "/api/message",
            "stop": "/api/stop",
            "knowledge": "/api/memory/knowledge",
            "recordings": "/api/recordings"
        }
    }


@app.get("/api/status")
async def get_status():
    """Returns AI brain provider, model, neural knowledge counts, and system status."""
    return bridge.get_status()


# ---------------------------------------------------------------------------
# Voice Recordings Archive Endpoints (100% Free & Unlimited Audio Storage)
# ---------------------------------------------------------------------------

RECORDINGS_META_FILE = RECORDINGS_DIR / "recordings_metadata.json"


def _load_recordings_meta() -> Dict[str, Any]:
    if RECORDINGS_META_FILE.exists():
        try:
            with open(RECORDINGS_META_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Could not load recordings metadata: {e}")
            return {}
    return {}


def _save_recordings_meta(meta: Dict[str, Any]) -> None:
    try:
        with open(RECORDINGS_META_FILE, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"Could not save recordings metadata: {e}")


@app.post("/api/recordings/upload")
async def upload_voice_recording(
    file: UploadFile = File(...),
    transcript: str = Form("")
):
    """
    Saves a live microphone recording from the browser/user to the recordings/ directory.
    """
    try:
        now_dt = datetime.datetime.now()
        now_str = now_dt.strftime("%Y-%m-%d_%H-%M-%S")
        file_ext = Path(file.filename).suffix if file.filename else ".webm"
        if not file_ext:
            file_ext = ".webm"

        saved_filename = f"user_voice_{now_str}{file_ext}"
        saved_path = RECORDINGS_DIR / saved_filename

        content = await file.read()
        with open(saved_path, "wb") as f:
            f.write(content)

        # Update metadata archive with transcript
        meta = _load_recordings_meta()
        meta[saved_filename] = {
            "transcript": transcript.strip(),
            "created_at": now_dt.strftime("%Y-%m-%d %I:%M:%S %p"),
            "size_bytes": len(content)
        }
        _save_recordings_meta(meta)

        logger.info(f"[AudioArchive] Saved voice recording: {saved_filename} ({len(content)} bytes) | Transcript: '{transcript.strip()}'")

        return {
            "status": "success",
            "filename": saved_filename,
            "size_bytes": len(content),
            "transcript": transcript.strip(),
            "url": f"/api/recordings/file/{saved_filename}"
        }
    except Exception as e:
        logger.error(f"Error saving voice recording: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/recordings")
async def list_voice_recordings():
    """
    Returns list of all saved user voice recordings with transcript metadata.
    """
    try:
        meta = _load_recordings_meta()
        recordings: List[Dict[str, Any]] = []
        for file_path in sorted(RECORDINGS_DIR.glob("user_voice_*"), key=os.path.getmtime, reverse=True):
            if file_path.is_file():
                stat = file_path.stat()
                created_dt = datetime.datetime.fromtimestamp(stat.st_mtime)
                file_meta = meta.get(file_path.name, {})
                recordings.append({
                    "filename": file_path.name,
                    "size_bytes": stat.st_size,
                    "formatted_size": f"{stat.st_size / 1024:.1f} KB",
                    "created_at": file_meta.get("created_at", created_dt.strftime("%Y-%m-%d %I:%M:%S %p")),
                    "transcript": file_meta.get("transcript", ""),
                    "url": f"/api/recordings/file/{file_path.name}"
                })
        return {"total_count": len(recordings), "recordings": recordings}
    except Exception as e:
        logger.error(f"Error listing recordings: {e}")
        return {"total_count": 0, "recordings": []}


@app.get("/api/recordings/file/{filename}")
async def get_recording_file(filename: str):
    """
    Stream/play or download a saved voice recording file.
    """
    file_path = RECORDINGS_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Recording not found")

    suffix = file_path.suffix.lower()
    media_type_map = {
        ".wav": "audio/wav",
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
        ".mp4": "audio/mp4",
        ".mp3": "audio/mpeg",
    }
    media_type = media_type_map.get(suffix, "audio/webm")
    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=filename,
        headers={"Accept-Ranges": "bytes", "Cache-Control": "no-cache"}
    )


@app.delete("/api/recordings/file/{filename}")
async def delete_recording_file(filename: str):
    """
    Delete a specific recording file and its metadata.
    """
    file_path = RECORDINGS_DIR / filename
    if file_path.exists():
        file_path.unlink()
        meta = _load_recordings_meta()
        if filename in meta:
            del meta[filename]
            _save_recordings_meta(meta)
        return {"status": "deleted", "filename": filename}
    raise HTTPException(status_code=404, detail="Recording not found")


# ---------------------------------------------------------------------------
# Neural Memory & Knowledge Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/memory/knowledge")
async def get_neural_knowledge():
    """Returns the learned user facts and behavioral rules."""
    return bridge.get_neural_knowledge()


@app.post("/api/memory/fact")
async def add_learned_fact(req: FactRequest):
    """Manually add or update a learned fact."""
    bridge.add_learned_fact(req.key, req.value)
    return {"status": "success", "knowledge": bridge.get_neural_knowledge()}


@app.delete("/api/memory/fact/{key}")
async def delete_learned_fact(key: str):
    """Delete a learned fact."""
    bridge.remove_learned_fact(key)
    return {"status": "success", "knowledge": bridge.get_neural_knowledge()}


@app.post("/api/memory/rule")
async def add_learned_rule(req: RuleRequest):
    """Add a behavioral rule."""
    bridge.add_learned_rule(req.rule)
    return {"status": "success", "knowledge": bridge.get_neural_knowledge()}


@app.delete("/api/memory/rule")
async def delete_learned_rule(req: RuleRequest):
    """Remove a behavioral rule."""
    bridge.remove_learned_rule(req.rule)
    return {"status": "success", "knowledge": bridge.get_neural_knowledge()}


@app.post("/api/memory/clear-knowledge")
async def clear_neural_memory():
    """Reset all learned facts and rules."""
    bridge.clear_neural_memory()
    return {"status": "success"}


@app.post("/api/message")
async def post_message(req: MessageRequest):
    """HTTP fallback endpoint for querying Jarvis."""
    response_text = await asyncio.to_thread(bridge.ask, req.text, req.persona, req.language)
    return {"response": response_text}


@app.post("/api/stop")
async def stop_speech():
    """Immediately stop active speech synthesis."""
    bridge.stop_speech()
    return {"status": "stopped"}


@app.post("/api/clear")
async def clear_history():
    """Clear conversation history."""
    success = bridge.clear_conversation()
    return {"success": success}


@app.get("/api/tts")
async def get_tts_audio(text: str, lang: str = "gu"):
    """
    Generate and stream high-fidelity gTTS audio for Gujarati, Hindi, or any language.
    Guarantees 100% crystal-clear native speech output in browser without spoken symbols.
    """
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text parameter required")
    
    try:
        from gtts import gTTS
        import tempfile
        try:
            from backend.jarvis_bridge import clean_spoken_symbols
        except ImportError:
            from jarvis_bridge import clean_spoken_symbols

        lang_map = {"gujarati": "gu", "hindi": "hi", "english": "en", "spanish": "es", "japanese": "ja", "chinese": "zh-CN", "russian": "ru"}
        target_lang = lang_map.get(lang.lower().strip(), lang.lower().strip())

        if any('\u0A80' <= c <= '\u0AFF' for c in text):
            target_lang = "gu"
        elif any('\u0900' <= c <= '\u097F' for c in text):
            target_lang = "hi"

        clean_text = clean_spoken_symbols(text)

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name

        tts = gTTS(text=clean_text, lang=target_lang, slow=False)
        tts.save(tmp_path)

        return FileResponse(
            path=tmp_path,
            media_type="audio/mpeg",
            headers={"Accept-Ranges": "bytes", "Cache-Control": "no-cache"}
        )
    except Exception as e:
        logger.error(f"TTS generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# WebSocket Endpoint
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Real-time bidirectional WebSocket handler.

    Client events:
      - {"type": "message", "text": "hello jarvis", "speak_server": false}
      - {"type": "stop_speaking"}
      - {"type": "speak", "text": "speech text"}
      - {"type": "ping"}
      - {"type": "clear"}

    Server events:
      - {"type": "status", "value": "thinking"}
      - {"type": "response", "text": "Hello sir"}
      - {"type": "status", "value": "speaking"}
      - {"type": "status", "value": "idle"}
    """
    await manager.connect(websocket)

    # Send initial connection acknowledgment with system status
    await manager.send_json(websocket, {
        "type": "status",
        "value": "idle"
    })
    await manager.send_json(websocket, {
        "type": "system",
        "message": "Connected to Jarvis Core // Neural Memory & Audio Archive Active",
        "details": bridge.get_status()
    })

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON received: {raw_data}")
                await manager.send_json(websocket, {
                    "type": "error",
                    "message": "Invalid JSON format"
                })
                continue

            event_type = data.get("type", "")

            # 1. Chat Message Event
            if event_type == "message":
                user_text = data.get("text", "").strip()
                persona = data.get("persona", "jarvis")
                language = data.get("language", "")
                speak_server = data.get("speak_server", False)
                if not user_text:
                    continue

                # Interrupt any active speech before starting new query
                bridge.stop_speech()

                logger.info(f"User Message: {user_text} [Persona: {persona}, Lang: {language}]")

                # Send 'thinking' status to UI
                await manager.send_json(websocket, {
                    "type": "status",
                    "value": "thinking"
                })

                try:
                    # Process AI query in background thread (injects learned memory, live search RAG, persona, language)
                    reply_text, active_lang = await asyncio.to_thread(bridge.ask_with_lang, user_text, persona, language)
                    logger.info(f"[{persona.upper()}] Reply ({active_lang}): {reply_text[:60]}...")

                    # Send AI response to UI with confirmed active language
                    await manager.send_json(websocket, {
                        "type": "response",
                        "text": reply_text,
                        "persona": persona,
                        "language": active_lang
                    })

                    # If server-side TTS requested (pyttsx3/gTTS)
                    if speak_server:
                        await manager.send_json(websocket, {
                            "type": "status",
                            "value": "speaking"
                        })
                        await asyncio.to_thread(bridge.speak, reply_text, active_lang)
                        await manager.send_json(websocket, {
                            "type": "status",
                            "value": "idle"
                        })
                    else:
                        await manager.send_json(websocket, {
                            "type": "status",
                            "value": "idle"
                        })
                except Exception as query_err:
                    logger.error(f"Error executing AI query: {query_err}")
                    await manager.send_json(websocket, {
                        "type": "response",
                        "text": f"Error processing query: {query_err}",
                        "persona": persona,
                        "language": language or "english"
                    })
                    await manager.send_json(websocket, {
                        "type": "status",
                        "value": "idle"
                    })

            # 2. Stop Speaking Event
            elif event_type == "stop_speaking":
                logger.info("Interrupt received: Stopping speech")
                bridge.stop_speech()
                await manager.send_json(websocket, {
                    "type": "status",
                    "value": "idle"
                })

            # 3. Direct TTS Command Event
            elif event_type == "speak":
                speech_text = data.get("text", "").strip()
                if speech_text:
                    await manager.send_json(websocket, {
                        "type": "status",
                        "value": "speaking"
                    })
                    await asyncio.to_thread(bridge.speak, speech_text)
                    await manager.send_json(websocket, {
                        "type": "status",
                        "value": "idle"
                    })

            # 4. Ping / Heartbeat Event
            elif event_type == "ping":
                await manager.send_json(websocket, {
                    "type": "pong"
                })

            # 5. Clear History Event
            elif event_type == "clear":
                bridge.stop_speech()
                bridge.clear_conversation()
                await manager.send_json(websocket, {
                    "type": "status",
                    "value": "idle"
                })
                await manager.send_json(websocket, {
                    "type": "system",
                    "message": "Memory cleared"
                })

            else:
                logger.warning(f"Unknown event type: {event_type}")

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
