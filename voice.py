import os
import tempfile
import threading
import time
import re
import speech_recognition as sr
import pyttsx3
import config

# gTTS language code map — matches config.LANGUAGE_CODES
_GTTS_LANG = {
    "english":   "en",
    "hindi":     "hi",
    "gujarati":  "gu",
    "marathi":   "mr",
    "chinese":   "zh",
    "russian":   "ru",
    "japanese":  "ja",
    "spanish":   "es",
}

# ---------------------------------------------------------------------------
# Background Interrupt Listeners (Voice "stop" and Keyboard)
# ---------------------------------------------------------------------------
def _listen_for_stop(stop_event: threading.Event):
    """Background ultra-fast listener to catch spoken 'stop' / 'ruko' or barge-in speech while AI is speaking."""
    if not _mic_available:
        return
    try:
        r = sr.Recognizer()
        r.energy_threshold = min(180, getattr(config, "ENERGY_THRESHOLD", 220))
        r.dynamic_energy_threshold = True
        r.pause_threshold = 0.15
        r.phrase_threshold = 0.1
        r.non_speaking_duration = 0.15
        with _get_microphone() as source:
            while not stop_event.is_set():
                try:
                    # Snappy 1.0-second limit for sub-second word detection
                    audio = r.listen(source, timeout=0.3, phrase_time_limit=1.2)
                    text = r.recognize_google(audio).lower().strip()
                    stop_keywords = [
                        "stop", "ruko", "roko", "thamba", "bas", "chup", "thobho", "ruk",
                        "quiet", "cancel", "stop talking", "shut up", "pause", "enough",
                        "bas karo", "ruk jao", "wait", "hold on", "shh", "listen", "no", "nahi",
                        "jarvis stop", "stop jarvis", "stop speaking", "rukja"
                    ]
                    is_stop = any(kw in text for kw in stop_keywords)
                    is_new_speech = len(text.split()) >= 1

                    if is_stop or is_new_speech:
                        print(f"\n  [Voice] Spoken STOP / barge-in detected ('{text}'). Stopping speech immediately...")
                        stop_event.set()
                        stop_speech()
                        break
                except (sr.WaitTimeoutError, sr.UnknownValueError):
                    continue
                except Exception:
                    break
    except Exception:
        pass


def _listen_keyboard_stop(stop_event: threading.Event):
    """Background listener to catch keypresses (Space, Esc, Enter, s, q) to stop speech instantly."""
    try:
        import msvcrt
        while msvcrt.kbhit():
            msvcrt.getch()

        while not stop_event.is_set():
            if msvcrt.kbhit():
                key = msvcrt.getch()
                if key in [b's', b'S', b'q', b'Q', b' ', b'\x1b', b'\r', b'\n']:
                    print("\n  [Keyboard] Stop key pressed. Interrupting speech...")
                    stop_event.set()
                    stop_speech()
                    break
            time.sleep(0.02)
    except Exception:
        pass


def clean_text_for_speech(text: str) -> str:
    """Clean markdown, bullets, numbered lists, URLs, emojis, slashes, and symbols into pure spoken prose."""
    if not text:
        return ""

    # Remove internal reasoning blocks
    clean = re.sub(r"<think>[\s\S]*?<\/think>", "", text, flags=re.IGNORECASE)
    clean = re.sub(r"<think>[\s\S]*", "", clean, flags=re.IGNORECASE)
    
    # Remove code blocks and inline code
    clean = re.sub(r"```[\s\S]*?```", "", clean)
    clean = re.sub(r"`+([^`]+)`+", r"\1", clean)

    # Convert markdown links [text](url) -> text for natural speech
    clean = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", clean)

    # Remove any standalone raw URLs
    clean = re.sub(r"https?://\S+|www\.\S+", "", clean)

    # Remove bracketed citations like [1], [2], [citation]
    clean = re.sub(r"\[\d+\]", "", clean)

    # Remove markdown bold/italic (**text**, *text*, __text__, _text_)
    clean = re.sub(r"\*+([^*]+)\*+", r"\1", clean)
    clean = re.sub(r"_+([^_]+)_+", r"\1", clean)

    # Remove headers (# Header -> Header)
    clean = re.sub(r"^#+\s*", "", clean, flags=re.MULTILINE)

    # Remove list bullets (* item, - item, 1. item)
    clean = re.sub(r"^\s*[\*\-\•]\s+", "", clean, flags=re.MULTILINE)
    clean = re.sub(r"^\s*\d+[\.\)]\s+", "", clean, flags=re.MULTILINE)

    # Remove emojis and non-standard symbols
    clean = re.sub(r"[\U00010000-\U0010ffff\u2600-\u26FF\u2700-\u27BF]", "", clean)

    # Convert slashes in common abbreviations to natural spoken prose
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

    # Replace slashes and underscores between words (e.g. "client/server" -> "client server", "user_id" -> "user id")
    clean = re.sub(r"(\b[A-Za-z0-9]+)\s*[\/\\]\s*([A-Za-z0-9]+\b)", r"\1 \2", clean)
    clean = re.sub(r"(\b[A-Za-z0-9]+)_([A-Za-z0-9]+\b)", r"\1 \2", clean)

    # Replace special punctuation (em-dashes, en-dashes, smart quotes, bullets)
    replacements = {
        "—": ", ",
        "–": ", ",
        "…": "... ",
        "’": "'",
        "‘": "'",
        "“": '"',
        "”": '"',
        "•": "",
        "−": "-",
        "™": "",
        "®": "",
        "©": "",
        "*": "",
        "#": "",
        "`": "",
        "/": " ",
        "\\": " ",
        "|": " ",
        "~": " ",
        "^": " ",
        "&": " and ",
        "@": " ",
        "<": " ",
        ">": " ",
        "{": " ",
        "}": " ",
        "[": " ",
        "]": " ",
    }
    for old, new in replacements.items():
        clean = clean.replace(old, new)

    # Sentence deduplication
    clean = re.sub(r'([.!?])([A-Z])', r'\1 \2', clean)
    sentences = re.split(r'(?<=[.!?])\s+|\n+', clean)
    if len(sentences) > 1:
        unique_sentences = []
        seen_normalized = []
        for s in sentences:
            s_clean = s.strip()
            if not s_clean:
                continue
            norm = re.sub(r'[^\w\s]', '', s_clean.lower())
            words = set(norm.split())
            is_dup = False
            for prev_norm, prev_words in seen_normalized:
                if norm == prev_norm:
                    is_dup = True
                    break
                if len(words) >= 4 and len(prev_words) >= 4:
                    if (len(words & prev_words) / max(len(words), len(prev_words))) >= 0.60:
                        is_dup = True
                        break
            if not is_dup:
                unique_sentences.append(s_clean)
                seen_normalized.append((norm, words))
        clean = " ".join(unique_sentences)

    # Collapse multiple whitespace
    clean = re.sub(r"\s+", " ", clean)

    return clean.strip()


_active_stop_event = None


def stop_speech():
    """Immediately halt any active pyttsx3, SAPI5, or pygame speech playback."""
    global _active_stop_event
    if _active_stop_event is not None:
        _active_stop_event.set()
    
    # Halt pygame mixer
    try:
        import pygame
        if pygame.mixer.get_init():
            pygame.mixer.music.stop()
            pygame.mixer.quit()
    except Exception:
        pass

    # Emergency SAPI purge
    try:
        import win32com.client
        import pythoncom
        pythoncom.CoInitialize()
        speaker = win32com.client.Dispatch("SAPI.SpVoice")
        speaker.Speak("", 2)  # SVSFPurgeBeforeSpeak
        pythoncom.CoUninitialize()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Speak — English via pyttsx3, Hindi/Gujarati/Others via gTTS
# ---------------------------------------------------------------------------
def speak(text: str, language: str = "english", external_stop_event: threading.Event = None) -> bool:
    """
    Convert text to speech and print to console.
    Returns True if user stopped speech mid-way, False otherwise.
    """
    global _active_stop_event
    print(f"\n  Jarvis: {text}\n")

    lang = language.lower().strip()
    has_devanagari = any('\u0900' <= char <= '\u097F' for char in text)
    has_gujarati   = any('\u0A80' <= char <= '\u0AFF' for char in text)

    # Sanitize text for speech engine (strip markdown and normalize em-dashes / unicode symbols)
    speech_text = clean_text_for_speech(text)

    stop_event = external_stop_event if external_stop_event is not None else threading.Event()
    _active_stop_event = stop_event

    kb_thread = threading.Thread(target=_listen_keyboard_stop, args=(stop_event,), daemon=True)
    kb_thread.start()

    mic_thread = threading.Thread(target=_listen_for_stop, args=(stop_event,), daemon=True)
    mic_thread.start()

    try:
        if lang == "english" and not has_devanagari and not has_gujarati:
            _speak_pyttsx3(speech_text, stop_event)
        else:
            if has_gujarati or lang == "gujarati":
                gtts_lang = "gujarati"
            elif has_devanagari or lang == "hindi":
                gtts_lang = "hindi"
            else:
                gtts_lang = lang
            _speak_gtts(speech_text, gtts_lang, stop_event)
    finally:
        was_stopped = stop_event.is_set()
        stop_event.set()
        _active_stop_event = None

    return was_stopped


def _speak_pyttsx3(text: str, stop_event: threading.Event = None) -> None:
    """Use Windows SAPI5 / pyttsx3 for English — asynchronous with instant interrupt support."""
    try:
        import win32com.client
        import pythoncom

        pythoncom.CoInitialize()
        speaker = win32com.client.Dispatch("SAPI.SpVoice")

        # Set voice index
        voices = speaker.GetVoices()
        if config.VOICE_INDEX < voices.Count:
            speaker.Voice = voices.Item(config.VOICE_INDEX)

        # Set speech rate (-10 to +10)
        rate_val = int((config.SPEECH_RATE - 165) / 15)
        speaker.Rate = max(-10, min(10, rate_val))

        # Flag 1 = SVSFlagsAsync (play asynchronously so background listeners can stop it)
        speaker.Speak(text, 1)

        # Monitor playback and check stop_event
        while not speaker.WaitUntilDone(100):
            if stop_event is not None and stop_event.is_set():
                # Flag 2 = SVSFPurgeBeforeSpeak (immediately halts and purges speech)
                speaker.Speak("", 2)
                break

        pythoncom.CoUninitialize()

    except Exception:
        # Fallback to standard pyttsx3
        try:
            _tts = pyttsx3.init()
            _tts.setProperty("rate", config.SPEECH_RATE)
            _voices = _tts.getProperty("voices")
            if _voices and config.VOICE_INDEX < len(_voices):
                _tts.setProperty("voice", _voices[config.VOICE_INDEX].id)

            _tts.say(text)
            _tts.runAndWait()
            _tts.stop()
        except Exception as e:
            print(f"  [Voice] TTS error: {e}")


def _speak_gtts(text: str, language: str, stop_event: threading.Event = None) -> None:
    """Use Google TTS for non-English languages — supports Hindi, Chinese, etc."""
    try:
        from gtts import gTTS
        import pygame

        lang_code = _GTTS_LANG.get(language, "en")

        # Save speech to a temp mp3 file
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name

        gTTS(text=text, lang=lang_code, slow=False).save(tmp_path)

        # Play using pygame
        pygame.mixer.init()
        pygame.mixer.music.load(tmp_path)
        pygame.mixer.music.play()

        # Wait for playback to finish or stop event
        while pygame.mixer.music.get_busy():
            if stop_event is not None and stop_event.is_set():
                pygame.mixer.music.stop()
                break
            pygame.time.Clock().tick(10)

        pygame.mixer.music.stop()
        pygame.mixer.quit()

        # Clean up temp file
        try:
            os.remove(tmp_path)
        except Exception:
            pass

    except ImportError:
        print("  [Voice] gTTS/pygame not installed. Run: pip install gTTS pygame")
        _speak_pyttsx3(text, stop_event)
    except Exception as e:
        print(f"  [Voice] gTTS error: {e}")
        _speak_pyttsx3(text, stop_event)


# ---------------------------------------------------------------------------
# Microphone helper
# ---------------------------------------------------------------------------
def _get_microphone(index_override=...):
    idx = config.MIC_DEVICE_INDEX if index_override is ... else index_override
    if idx is None:
        return sr.Microphone()
    try:
        return sr.Microphone(device_index=idx)
    except Exception:
        return sr.Microphone()

# ---------------------------------------------------------------------------
# Recognizer setup
# ---------------------------------------------------------------------------
_recognizer = sr.Recognizer()
_recognizer.energy_threshold      = config.ENERGY_THRESHOLD
_recognizer.dynamic_energy_threshold = True
_recognizer.pause_threshold       = 0.8
_recognizer.phrase_threshold      = 0.3
_recognizer.non_speaking_duration = 0.5

_mic_available = True

# ---------------------------------------------------------------------------
# Calibrate microphone
# ---------------------------------------------------------------------------
def calibrate_microphone() -> None:
    global _mic_available
    mics_to_try = [config.MIC_DEVICE_INDEX, None] if config.MIC_DEVICE_INDEX is not None else [None]
    
    for idx in mics_to_try:
        try:
            with _get_microphone(idx) as source:
                print("  [Voice] Calibrating microphone... (1 second, please be quiet)")
                _recognizer.adjust_for_ambient_noise(source, duration=1)
                print(f"  [Voice] Microphone ready. Energy threshold: {_recognizer.energy_threshold:.0f}")
                _mic_available = True
                return
        except Exception:
            continue
            
    print("  [Voice] No microphone detected or accessible. Switching to TEXT mode.")
    _mic_available = False

def is_mic_available() -> bool:
    return _mic_available

# ---------------------------------------------------------------------------
# Listen
# ---------------------------------------------------------------------------
def listen(prompt: str = "Say a command...") -> str:
    global _mic_available
    if not _mic_available:
        return listen_text()

    mics_to_try = [config.MIC_DEVICE_INDEX, None] if config.MIC_DEVICE_INDEX is not None else [None]
    audio = None
    mic_success = False

    for idx in mics_to_try:
        try:
            with _get_microphone(idx) as source:
                print(f"\n  {prompt}")
                audio = _recognizer.listen(
                    source,
                    timeout=config.LISTEN_TIMEOUT,
                    phrase_time_limit=15,
                )
                mic_success = True
                break
        except sr.WaitTimeoutError:
            return ""
        except (AttributeError, OSError, Exception) as e:
            # PyAudio or device error on this index, try next index in list
            continue

    if not mic_success or audio is None:
        print("  [Voice] Microphone unavailable. Switching to text input.")
        return listen_text()

    try:
        print("  [Voice] Processing speech...")
        command = _recognizer.recognize_google(audio)
        print(f"  You (voice): {command}")
        return command.lower().strip()
    except sr.UnknownValueError:
        print("  [Voice] Couldn't understand — please speak clearly.")
        return ""
    except sr.RequestError as e:
        print(f"  [Voice] Google STT unavailable: {e}")
        return ""

# ---------------------------------------------------------------------------
# Keyboard fallback
# ---------------------------------------------------------------------------
def listen_text(prompt: str = "  You (type): ") -> str:
    try:
        return input(prompt).lower().strip()
    except (EOFError, KeyboardInterrupt):
        return "exit"

# ---------------------------------------------------------------------------
# Combined input
# ---------------------------------------------------------------------------
def get_input(use_voice: bool = True, prompt: str = "Say a command...") -> str:
    if use_voice and _mic_available:
        return listen(prompt)
    return ""
