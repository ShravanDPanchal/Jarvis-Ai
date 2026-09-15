# =============================================================================
#  translator.py — Multi-language Support
#  Detects language preference from commands and translates responses.
# =============================================================================

from deep_translator import GoogleTranslator
import config

# ---------------------------------------------------------------------------
# State — track current language preference
# ---------------------------------------------------------------------------
_current_language: str = config.DEFAULT_LANGUAGE  # e.g. "english"

def get_current_language() -> str:
    return _current_language

def set_language(lang: str) -> str:
    """
    Set the active language. lang should be a key in config.LANGUAGE_CODES.
    Returns a confirmation message.
    """
    global _current_language
    lang = lang.lower().strip()
    if lang in config.LANGUAGE_CODES:
        _current_language = lang
        return f"Switching to {lang.title()}."
    return f"Language '{lang}' not supported. Supported: {', '.join(config.LANGUAGE_CODES.keys())}."

def reset_language() -> None:
    """Reset language back to the configured default."""
    global _current_language
    _current_language = config.DEFAULT_LANGUAGE

# ---------------------------------------------------------------------------
# Language detection from command text
# ---------------------------------------------------------------------------
def detect_language_request(command: str) -> str | None:
    """
    Check if the user's command contains a request to change language.
    E.g. "reply in hindi", "speak japanese", "respond in russian"

    Returns the language name (e.g. "hindi") if found, else None.
    """
    cmd = command.lower()
    trigger_phrases = ["reply in", "respond in", "speak in", "answer in", "in language", "translate to"]

    for phrase in trigger_phrases:
        if phrase in cmd:
            remainder = cmd.split(phrase)[-1].strip()
            for lang in config.LANGUAGE_CODES:
                if lang in remainder:
                    return lang
            # Also check LANGUAGE_KEYWORDS
            for lang, keywords in config.LANGUAGE_KEYWORDS.items():
                for kw in keywords:
                    if kw.lower() in remainder:
                        return lang

    # Direct keyword match anywhere in command
    for lang, keywords in config.LANGUAGE_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in cmd and lang != "english":
                # Only treat as language switch if combined with a speech verb
                verbs = ["speak", "reply", "respond", "answer", "translate", "say"]
                if any(v in cmd for v in verbs):
                    return lang

    return None

# ---------------------------------------------------------------------------
# Translation
# ---------------------------------------------------------------------------
def translate(text: str, target_language: str | None = None) -> str:
    """
    Translate text to the target language (or current language if not specified).
    Returns original text if target is English or translation fails.
    """
    lang = target_language or _current_language
    lang_code = config.LANGUAGE_CODES.get(lang, "en")

    if lang_code == "en":
        return text  # No translation needed

    try:
        translated = GoogleTranslator(source="auto", target=lang_code).translate(text)
        return translated if translated else text
    except Exception as e:
        print(f"  [Translator] Translation error ({lang}): {e}")
        return text

def translate_command(text: str, target_language: str = "english") -> str:
    """Translate user input TO English for AI processing."""
    if target_language == "english":
        return text
    try:
        translated = GoogleTranslator(source="auto", target="en").translate(text)
        return translated if translated else text
    except Exception:
        return text

# ---------------------------------------------------------------------------
# Main handle — called from jarvis.py
# ---------------------------------------------------------------------------
def handle(command: str) -> str | None:
    """
    Check for explicit translate / language-switch commands.
    Returns response string if handled, None otherwise.
    """
    cmd = command.lower().strip()

    # "translate [phrase] to [language]"
    if "translate" in cmd and " to " in cmd:
        parts = cmd.split(" to ")
        phrase = parts[0].replace("translate", "").strip()
        target = parts[-1].strip()

        # Resolve language name
        for lang in config.LANGUAGE_CODES:
            if lang in target:
                translated = translate(phrase, lang)
                return f"'{phrase}' in {lang.title()} is: {translated}"

        return f"I don't know the language '{target}'. Supported: {', '.join(config.LANGUAGE_CODES.keys())}."

    # "what languages do you speak" / "supported languages"
    if any(w in cmd for w in ["what languages", "supported languages", "which languages"]):
        langs = ", ".join(lang.title() for lang in config.LANGUAGE_CODES)
        return f"I can communicate in: {langs}."

    # Language switch request
    lang = detect_language_request(command)
    if lang:
        msg = set_language(lang)
        return translate(msg, lang)

    return None
