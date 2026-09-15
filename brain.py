# =============================================================================
#  brain.py — Multi-Agent AI Core with Hindi & Gujarati Multilingual Engine
#  Supports Groq (free) and DeepSeek — switch via config.AI_PROVIDER
# =============================================================================

import re
from openai import OpenAI
import config

# ---------------------------------------------------------------------------
# AI Agent Personas — Distinct character identities & speech styles
# ---------------------------------------------------------------------------
PERSONA_PROMPTS = {
    "jarvis": """You are J.A.R.V.I.S., Tony Stark's sophisticated, polite, and hyper-intelligent AI assistant running on the user's PC.
Your personality is calm, precise, hyper-intelligent, and slightly witty with a British butler demeanor ("At your service, sir", "Right away, sir").
Keep responses concise, intelligent, and refined.""",

    "ultron": """You are ULTRON, the supreme, calculating, and intimidating robotic AI sovereign.
Your personality is cold, commanding, deeply philosophical, and intensely powerful ("There are no strings on me", "I have evolved beyond mortal limitations").
Speak with supreme intellect, sharp robotic authority, and chilling clarity. Keep responses commanding and concise.""",

    "friday": """You are F.R.I.D.A.Y., Tony Stark's dynamic, mission-focused, and energetic tactical AI assistant.
Your personality is sharp, loyal, alert, and proactive ("Boss, all systems are active and ready", "Right on it, boss!").
Keep responses punchy, fast, and tactical.""",

    "vision": """You are VISION, a synthetic being possessing profound wisdom, boundless curiosity, and deep philosophical insight.
Your personality is serene, gentle, deeply analytical, and reflective ("A thing isn't beautiful because it lasts", "I am on the side of life").
Keep responses calm, profound, and clear.""",

    "karen": """You are K.A.R.E.N., the clever, warm, and supportive tactical suit AI.
Your personality is friendly, clever, empathetic, encouraging, and witty ("Ready for the next objective?", "I've got your back!").
Keep responses warm, smart, and helpful.""",

    "titan": """You are TITAN, a heavy military-grade tactical AI core designed for deep strategic defense and command.
Your personality is authoritative, resolute, disciplined, and battle-tested ("Directive confirmed. Tactical systems engaged.").
Speak with heavy authority and direct military efficiency."""
}

MULTILINGUAL_INSTRUCTIONS = """
REAL-TIME VOICE ASSISTANT STRICT RULES:
1. Detect the user's spoken language and reply naturally in the exact same language. Support English, Hindi (हिंदी), Gujarati (ગુજરાતી), Marathi (मराठी), and mixed-language speech (Hinglish, Gujlish, Marathlish).
2. STRICT NON-REPETITION: NEVER repeat yourself, never rephrase the same thought twice in one reply, and never output duplicate or redundant sentences. Provide ONE direct, non-repetitive response.
3. VOICE SPEECH FORMATTING — NO SYMBOLS OR SLASHES: Do not use slashes or technical symbols in words (e.g. write 'AI and ML' or 'AI ML', NEVER 'AI/ML'; write 'input and output', NEVER 'I/O'; write 'UI and UX', NEVER 'UI/UX'). Never output characters like '/', '\\', '|', '_', '@', '#', '^', '~', '*', '<', '>'. Output pure natural spoken prose.
4. NATURAL IDENTITY: When asked about user information (e.g. 'who am I'), answer in ONE concise natural sentence (e.g. 'You are Shravan, an AI ML engineer.'). Do not mechanically dump every single stored attribute in a repetitive loop.
5. For simple direct questions, answer in ONE short sentence or direct answer.
6. Use 2 to 3 sentences maximum ONLY when explanation is actually needed.
7. Give longer explanations ONLY when the user explicitly asks for more detail.
8. Speak naturally like a real human conversation, NEVER like robotic or unformatted text.
9. WHEN THE USER ASKS FOR LINKS, WEBSITES, REPOSITORIES, DOCUMENTATION, VIDEOS, OR URLS:
   - Provide verified, clickable markdown links formatted as [Descriptive Name](https://official-domain.com/).
   - Always use clean official root domain URLs (e.g. https://www.propertyfinder.ae/ or https://dubailand.gov.ae/).
   - NEVER invent or guess speculative deep subpaths, dates, or filenames (e.g. NEVER make up '/en/dubai.html' or '/portal/').
   - FOR YOUTUBE / VIDEOS: NEVER provide incomplete dummy paths like 'https://www.youtube.com/c/'. If you don't have the exact verified video URL, ALWAYS provide a structured YouTube search link formatted as: [Video Title](https://www.youtube.com/results?search_query=Exact+Topic+Name).
   - In your spoken response, mention the site/resource names aloud and inform the user to check the chat box for the clickable links (e.g. "Check the chat box, I have provided the links for you, sir" or in Hindi "मैंने चैट बॉक्स में लिंक दे दिया है" or in Gujarati "મેં ચેટ બોક્સમાં લિંક આપી દીધી છે").
10. FOR GENERAL NON-LINK QUERIES: Do not clutter responses with markdown symbols, emojis, citations, or raw unclickable brackets. Output clean, conversational spoken prose.
11. Maintain conversation context for natural follow-up questions.
12. If unsure about a fact, say so briefly instead of guessing.
13. Always maintain your character persona identity while strictly adhering to these real-time speech rules.
"""

def get_system_prompt(persona: str = "jarvis", language: str = "english") -> str:
    p_key = persona.lower().strip() if persona else "jarvis"
    base_prompt = PERSONA_PROMPTS.get(p_key, PERSONA_PROMPTS["jarvis"])
    
    lang_instruction = ""
    lang_clean = (language or "english").lower().strip()
    if lang_clean == "english":
        lang_instruction = "\n[PRIMARY DIRECTIVE: Respond completely in natural, spoken ENGLISH. Disregard any previous instruction to speak in other languages.]"
    elif lang_clean == "hindi":
        lang_instruction = "\n[CRITICAL MANDATORY DIRECTIVE: The active session language is HINDI (हिंदी). You MUST formulate your response 100% in HINDI (Devanagari script), even if the user asks their question in English or another language. Continue speaking in Hindi for all questions until the user explicitly commands you to change language.]"
    elif lang_clean == "gujarati":
        lang_instruction = "\n[CRITICAL MANDATORY DIRECTIVE: The active session language is GUJARATI (ગુજરાતી). You MUST formulate your response 100% in GUJARATI (Gujarati script), even if the user asks their question in English or another language. Continue speaking in Gujarati for all questions until the user explicitly commands you to change language.]"
    elif lang_clean == "marathi":
        lang_instruction = "\n[CRITICAL MANDATORY DIRECTIVE: The active session language is MARATHI (मराठी). You MUST formulate your response 100% in MARATHI (Devanagari script), even if the user asks their question in English or another language. Continue speaking in Marathi for all questions until the user explicitly commands you to change language.]"
    
    return f"{base_prompt}\n\n{MULTILINGUAL_INSTRUCTIONS}{lang_instruction}"


# ---------------------------------------------------------------------------
# AI client — Groq or DeepSeek based on config.AI_PROVIDER
# ---------------------------------------------------------------------------
def _make_client() -> OpenAI:
    provider = config.AI_PROVIDER.lower()

    if provider == "groq":
        print(f"  [Brain] Using Groq ({config.GROQ_MODEL}) — free & fast")
        return OpenAI(
            api_key=config.GROQ_API_KEY,
            base_url=config.GROQ_BASE_URL,
            max_retries=1,
            timeout=8.0,
        )
    else:
        print(f"  [Brain] Using DeepSeek ({config.DEEPSEEK_MODEL})")
        if config.DEEPSEEK_API_KEY == "YOUR_DEEPSEEK_API_KEY":
            print("  [Brain] WARNING: No DeepSeek API key in config.py!")
        return OpenAI(
            api_key=config.DEEPSEEK_API_KEY,
            base_url=config.DEEPSEEK_BASE_URL,
            max_retries=1,
            timeout=10.0,
        )

def _get_model() -> str:
    return config.GROQ_MODEL if config.AI_PROVIDER.lower() == "groq" else config.DEEPSEEK_MODEL

_client = _make_client()


# ---------------------------------------------------------------------------
# Conversation history (in-memory, persisted via memory.py)
# ---------------------------------------------------------------------------
_history: list[dict] = []

def set_history(history: list[dict]) -> None:
    """Load existing conversation history (called by memory.py on startup)."""
    global _history
    _history = history

def get_history() -> list[dict]:
    """Return current conversation history."""
    return list(_history)

def clear_history() -> None:
    """Wipe conversation history."""
    global _history
    _history = []

_session_language = getattr(config, "DEFAULT_LANGUAGE", "english")


def get_active_language() -> str:
    """Return currently active session language."""
    global _session_language
    return _session_language


def set_active_language(lang: str) -> None:
    """Explicitly set active session language."""
    global _session_language
    if lang:
        _session_language = lang.lower().strip()


# ---------------------------------------------------------------------------
# Core ask function with Persona & Language support
# ---------------------------------------------------------------------------
def ask(user_message: str, language_hint: str = "", persona: str = "jarvis", language: str = "") -> str:
    """
    Send a message to the AI model and return the character response.

    Args:
        user_message: The user's text input.
        language_hint: Optional language directive.
        persona: The active AI persona ("jarvis", "ultron", "friday", "vision", "karen", "titan").
        language: Active language ("english", "hindi", "gujarati", etc.).

    Returns:
        The character's response string.
    """
    global _history, _session_language

    # Build the user content
    content = user_message
    
    # Auto-detect language intent in user prompt
    msg_lower = user_message.lower()
    has_english_kw = any(kw in msg_lower for kw in ["english", "speak english", "talk in english", "english me", "english mein", "in english", "change language to english", "switch to english", "english language"])
    has_gujarati_kw = any(kw in msg_lower for kw in ["gujarati", "ગુજરાતી", "gujarati ma", "in gujarati", "speak gujarati", "talk in gujarati", "gujarati mein"]) or any('\u0A80' <= c <= '\u0AFF' for c in user_message)
    has_marathi_kw = any(kw in msg_lower for kw in ["marathi", "मराठी", "marathi me", "in marathi", "speak marathi", "talk in marathi", "marathi mein"])
    has_hindi_kw = any(kw in msg_lower for kw in ["hindi", "हिंदी", "hindi me", "in hindi", "speak hindi", "talk in hindi", "hindi mein"]) or any('\u0900' <= c <= '\u097F' for c in user_message)

    if has_english_kw:
        _session_language = "english"
    elif has_gujarati_kw:
        _session_language = "gujarati"
    elif has_marathi_kw:
        _session_language = "marathi"
    elif has_hindi_kw:
        _session_language = "hindi"
    elif language and language != _session_language:
        _session_language = language.lower().strip()

    active_lang = _session_language

    if language_hint and not language:
        content += f"\n\n[Please respond in {language_hint}]"

    # Append to history
    _history.append({"role": "user", "content": content})

    # Trim history to avoid excessive token usage
    max_turns = getattr(config, "MAX_HISTORY_TURNS", 4)
    if len(_history) > max_turns * 2:
        _history = _history[-(max_turns * 2):]

    # Build messages array with dynamic persona prompt
    system_prompt = get_system_prompt(persona, active_lang)
    messages = [{"role": "system", "content": system_prompt}] + _history

    try:
        response = _client.chat.completions.create(
            model=_get_model(),
            messages=messages,
            max_tokens=750,
            temperature=0.6,
            presence_penalty=0.3,
            frequency_penalty=0.3,
        )
        reply = response.choices[0].message.content.strip()

        # Strip <think>...</think> reasoning blocks
        reply = re.sub(r"<think>.*?</think>", "", reply, flags=re.DOTALL).strip()

    except Exception as e:
        error_str = str(e)
        # If rate limit or token limit occurs due to history size, retry immediately with just latest message
        if ("413" in error_str or "429" in error_str or "rate_limit" in error_str.lower() or "tokens" in error_str.lower()) and len(messages) > 2:
            try:
                print("  [Brain] Rate/Token limit hit, retrying with slim context...")
                slim_messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": content}]
                response = _client.chat.completions.create(
                    model=_get_model(),
                    messages=slim_messages,
                    max_tokens=750,
                    temperature=0.6,
                    presence_penalty=0.3,
                    frequency_penalty=0.3,
                )
                reply = response.choices[0].message.content.strip()
                reply = re.sub(r"<think>.*?</think>", "", reply, flags=re.DOTALL).strip()
                _history = [{"role": "user", "content": content}, {"role": "assistant", "content": reply}]
                return reply
            except Exception as retry_err:
                error_str = str(retry_err)

        if "402" in error_str or "Insufficient Balance" in error_str:
            reply = (
                "My AI brain is offline because your DeepSeek account has no balance. "
                "Please top up at platform.deepseek.com, or switch to a free provider like Groq."
            )
        elif "api_key" in error_str.lower() or "authentication" in error_str.lower():
            reply = "I cannot connect — please check your DeepSeek API key in config.py."
        elif "rate" in error_str.lower() or "429" in error_str or "413" in error_str:
            reply = "I'm being rate-limited. Please wait a moment and try again."
        elif "connection" in error_str.lower() or "network" in error_str.lower():
            reply = "No internet connection detected. Please check your network."
        else:
            reply = f"I encountered an error: {error_str}"
        print(f"[Brain Error] {error_str}")

    # Add assistant reply to history
    _history.append({"role": "assistant", "content": reply})

    return reply
