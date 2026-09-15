# =============================================================================
#  backend/jarvis_bridge.py — Bridge layer to existing Jarvis modules
#  Connects FastAPI / WebSockets to brain.py, memory.py, voice.py, pc_control.py
#  + Continuous Neural Learning & Fact Extraction Engine
#  + Dynamic Temporal Clock & Live Web Search Grounding (Web RAG)
# =============================================================================

import os
import sys
import re
import threading
import asyncio
from pathlib import Path
from typing import Dict, Any, List

# Ensure parent directory (root Jarvis workspace) is in Python path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Import existing Jarvis modules without modification
try:
    import config
    import brain
    import memory
except ImportError as e:
    raise ImportError(f"Failed to import core Jarvis modules from {ROOT_DIR}: {e}")

# Optional imports for voice and pc_control
try:
    import voice
except ImportError:
    voice = None

try:
    import pc_control
except ImportError:
    pc_control = None

# Import Neural Memory & Web Grounding Engines
try:
    from backend.neural_memory import neural_memory
    from backend.web_grounding import web_grounding
except ImportError:
    from neural_memory import neural_memory
    from web_grounding import web_grounding


def deduplicate_sentences(text: str) -> str:
    """Detect and remove duplicate or near-duplicate sentences in AI output."""
    if not text:
        return ""
    
    # Fix stuck sentence boundaries (e.g. 'leaks.You' -> 'leaks. You')
    fixed_text = re.sub(r'([.!?])([A-Z])', r'\1 \2', text)

    # Split sentences while preserving sentence boundaries
    sentences = re.split(r'(?<=[.!?])\s+|\n+', fixed_text)
    if len(sentences) <= 1:
        return fixed_text

    unique_sentences = []
    seen_normalized = []

    for s in sentences:
        s_clean = s.strip()
        if not s_clean:
            continue
        # Normalize for comparison: lowercase, strip punctuation
        norm = re.sub(r'[^\w\s]', '', s_clean.lower())
        words = set(norm.split())

        is_duplicate = False
        for prev_norm, prev_words in seen_normalized:
            if norm == prev_norm:
                is_duplicate = True
                break
            if len(words) >= 4 and len(prev_words) >= 4:
                overlap = len(words & prev_words) / max(len(words), len(prev_words))
                if overlap >= 0.60:
                    is_duplicate = True
                    break

        if not is_duplicate:
            unique_sentences.append(s_clean)
            seen_normalized.append((norm, words))

    return " ".join(unique_sentences)


def clean_spoken_symbols(text: str) -> str:
    """Clean markdown links, slashes, and symbols into pure spoken words for TTS engines."""
    if not text:
        return ""

    # Convert markdown links [title](url) directly to just the spoken title for speech
    clean = re.sub(r"\[([^\]]+)\]\((https?://[^\s\)]+)\)", r"\1", text)

    # Remove any standalone raw URLs
    clean = re.sub(r"https?://\S+|www\.\S+", "", clean)

    # 1. Common abbreviations with slashes -> clean natural spoken words
    slash_map = {
        r"\bAI/ML\b": "AI ML",
        r"\bai/ml\b": "AI ML",
        r"\bML/AI\b": "ML AI",
        r"\bUI/UX\b": "UI UX",
        r"\bCI/CD\b": "CI CD",
        r"\bI/O\b": "I O",
        r"\bi/o\b": "I O",
        r"\band/or\b": "and or",
        r"\beither/or\b": "either or",
        r"\bw/o\b": "without",
        r"\bw/\b": "with",
        r"\bc/o\b": "care of",
        r"\bkm/h\b": "kilometers per hour",
        r"\bkm/hr\b": "kilometers per hour",
        r"\bmph\b": "miles per hour",
    }
    for pattern, replacement in slash_map.items():
        clean = re.sub(pattern, replacement, clean, flags=re.IGNORECASE)

    # 2. Replace slashes and underscores between words (e.g. "python/javascript" -> "python javascript")
    clean = re.sub(r"(\b[A-Za-z0-9]+)\s*[\/\\]\s*([A-Za-z0-9]+\b)", r"\1 \2", clean)
    clean = re.sub(r"(\b[A-Za-z0-9]+)_([A-Za-z0-9]+\b)", r"\1 \2", clean)

    # 3. Replace ampersands with 'and'
    clean = re.sub(r"&", " and ", clean)

    # 4. Remove standalone slashes, backslashes, pipes, underscores, hashes, carets, tildes, brackets
    clean = re.sub(r"[\/\\|~^#*_+=<>{}\[\]]", " ", clean)

    # 5. Normalize whitespace
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def sanitize_ai_output(text: str) -> str:
    """
    Strips internal reasoning `<think>...</think>` tags produced by models like Qwen/DeepSeek,
    including truncated/unclosed think blocks if the model ran out of tokens,
    deduplicates repeated sentences, and normalizes prose while preserving clickable markdown links.
    """
    if not text:
        return ""

    # 1. Strip complete <think>...</think> blocks
    clean = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    # 2. Strip unclosed <think>... blocks if the model was cut off mid-thought
    if "<think>" in clean:
        parts = clean.split("<think>")
        clean = parts[0].strip()

    # 3. Strip stray markdown artifacts
    if clean.startswith("Here's a thinking process:"):
        clean = clean.replace("Here's a thinking process:", "").strip()

    # 4. If clean output was empty because of an unclosed <think> tag, extract the actual content
    if not clean and "<think>" in text:
        inner = re.sub(r"</?think>", "", text, flags=re.DOTALL).strip()
        clean = inner

    clean = clean.strip()

    # 5. Deduplicate identical or rephrased repeating sentences
    clean = deduplicate_sentences(clean)

    # 6. Normalize technical slashes in prose (e.g. AI/ML -> AI ML) outside of URLs
    clean = re.sub(r"\bAI/ML\b", "AI ML", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\bUI/UX\b", "UI UX", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\bCI/CD\b", "CI CD", clean, flags=re.IGNORECASE)

    return clean


class JarvisBridge:
    """
    Bridge wrapper that manages state and exposes clean interfaces
    to existing Jarvis AI and system modules.
    """

    def __init__(self):
        self._current_stop_event: threading.Event = None
        # Initialize memory persistence
        try:
            memory.load()
            saved_history = memory.get_history()
            if saved_history:
                brain.set_history(saved_history)
        except Exception as e:
            print(f"[JarvisBridge] Note on memory load: {e}")

    def ask(self, user_message: str, persona: str = "jarvis", language: str = "") -> str:
        """
        Send a user message to the AI brain, dynamically injecting:
        1. Real-time dynamic system clock & live web search facts (Web RAG with history awareness)
        2. Learned user profile & behavioral preferences (Neural Memory)
        3. Selected AI Agent Persona prompt & target language (Hindi / Gujarati / English)
        Persists conversation history and triggers background continuous self-learning.
        """
        try:
            # 1. Fetch Dynamic Temporal Clock & Live Web Search Context (with conversation history awareness)
            current_history = brain.get_history() if brain else []
            grounding_context = web_grounding.get_grounding_prompt(user_message, history=current_history)

            # 2. Fetch Learned User Knowledge (Name, Preferences, Rules)
            learned_context = neural_memory.get_memory_context_prompt()

            # Assemble complete context injection
            context_blocks = []
            if grounding_context:
                context_blocks.append(grounding_context)
            if learned_context:
                context_blocks.append(learned_context)

            enriched_prompt = user_message
            if context_blocks:
                combined_context = "\n\n".join(context_blocks)
                enriched_prompt = f"{user_message}\n\n[Real-time System & Environmental Context:\n{combined_context}]"

            # Query existing brain with persona & language
            raw_response = brain.ask(enriched_prompt, persona=persona, language=language)
            
            # Sanitize internal thought loops or <think> leaks
            response = sanitize_ai_output(raw_response)

            # Real-Time URL Validator & Auto-Healer: verifies all links, fixes 404s to working pages, strips dead URLs
            try:
                response = web_grounding.verify_and_heal_links(response)
            except Exception as e:
                print(f"[JarvisBridge] Link verification note: {e}")

            # Persist updated history
            try:
                current_history = brain.get_history()
                memory.update_history(current_history)
                memory.save()
            except Exception as e:
                print(f"[JarvisBridge] Warning: memory sync failed: {e}")

            # Trigger background continuous learning reflection (non-blocking thread)
            threading.Thread(
                target=neural_memory.extract_and_learn_sync,
                args=(user_message, response),
                daemon=True
            ).start()

            return response
        except Exception as e:
            error_msg = f"Error communicating with AI brain: {str(e)}"
            print(f"[JarvisBridge] {error_msg}")
            return error_msg

    def get_active_language(self) -> str:
        """Return the active session language from brain."""
        if brain and hasattr(brain, "get_active_language"):
            return brain.get_active_language()
        return "english"

    def ask_with_lang(self, user_message: str, persona: str = "jarvis", language: str = ""):
        """Ask AI and return tuple of (response_text, active_language)."""
        reply = self.ask(user_message, persona, language)
        active_lang = self.get_active_language()
        return reply, active_lang

    def speak(self, text: str, language: str = "english"):
        """
        Speak text out loud using existing voice.py engine with interrupt support.
        """
        if voice:
            try:
                self.stop_speech()
                self._current_stop_event = threading.Event()
                clean_text = sanitize_ai_output(text)
                voice.speak(clean_text, language=language, external_stop_event=self._current_stop_event)
            except Exception as e:
                print(f"[JarvisBridge] Voice output error: {e}")
            finally:
                self._current_stop_event = None

    def stop_speech(self):
        """
        Immediately interrupt and stop any active speech playback across all engines.
        """
        if self._current_stop_event:
            self._current_stop_event.set()

        if voice and hasattr(voice, "stop_speech"):
            try:
                voice.stop_speech()
            except Exception as e:
                print(f"[JarvisBridge] Note on voice.stop_speech: {e}")

        # Emergency Windows SAPI purge if running pyttsx3
        try:
            import win32com.client
            import pythoncom
            pythoncom.CoInitialize()
            speaker = win32com.client.Dispatch("SAPI.SpVoice")
            speaker.Speak("", 2)  # SVSFPurgeBeforeSpeak
            pythoncom.CoUninitialize()
        except Exception:
            pass

    def get_status(self) -> Dict[str, Any]:
        """
        Returns basic status information from config & memory.
        """
        return {
            "ai_provider": getattr(config, "AI_PROVIDER", "groq"),
            "groq_model": getattr(config, "GROQ_MODEL", "qwen-2.5-32b"),
            "history_count": len(brain.get_history()),
            "status": "online",
            "voice_available": voice is not None,
            "learned_facts_count": len(neural_memory.knowledge.get("user_profile", {})),
            "learned_rules_count": len(neural_memory.knowledge.get("learned_rules", []))
        }

    def get_neural_knowledge(self) -> Dict[str, Any]:
        """Return full neural memory knowledge base."""
        return neural_memory.knowledge

    def add_learned_fact(self, key: str, value: str):
        neural_memory.add_fact(key, value)

    def remove_learned_fact(self, key: str):
        neural_memory.remove_fact(key)

    def add_learned_rule(self, rule: str):
        neural_memory.add_rule(rule)

    def remove_learned_rule(self, rule: str):
        neural_memory.remove_rule(rule)

    def clear_conversation(self) -> bool:
        """
        Clear in-memory and persisted conversation history.
        """
        try:
            brain.clear_history()
            memory.update_history([])
            memory.save()
            return True
        except Exception as e:
            print(f"[JarvisBridge] Failed to clear history: {e}")
            return False

    def clear_neural_memory(self):
        """Clear all extracted knowledge."""
        neural_memory.clear_all()


# Global singleton bridge instance
bridge = JarvisBridge()
