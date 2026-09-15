# =============================================================================
#  config.py — Jarvis AI Assistant Configuration
#  Edit this file to set your API keys and preferences.
# =============================================================================

# -----------------------------------------------------------------------------
# 🔑 API KEYS
# -----------------------------------------------------------------------------

# DeepSeek API Key — get yours free at https://platform.deepseek.com/
DEEPSEEK_API_KEY = "sk-8f67d4852e0f43b2a33f27fc2f31620a"

# Groq API Key — free at https://console.groq.com/
GROQ_API_KEY = "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"

# (Optional) Tavily API Key — for richer real-time search results
# Get one free at https://app.tavily.com/
# Leave as "" to use free DuckDuckGo search instead.
TAVILY_API_KEY = ""

# -----------------------------------------------------------------------------
# 🤖 AI MODEL SETTINGS
# -----------------------------------------------------------------------------

# Switch between "groq" (free) or "deepseek" (paid)
AI_PROVIDER = "groq"

# Groq settings — free, sub-second lightning fast responses
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_MODEL    = "openai/gpt-oss-120b"   # High intelligence & ultra-fast (sub-second) on Groq


# DeepSeek settings (used only if AI_PROVIDER = "deepseek")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL    = "deepseek-reasoner"

# Max conversation turns kept in memory (older turns are dropped to keep responses ultra-fast)
MAX_HISTORY_TURNS = 4

# -----------------------------------------------------------------------------
# 🗣️ VOICE SETTINGS
# -----------------------------------------------------------------------------

# Speech rate (words per minute). 150 = calm, 170 = normal, 200 = fast
SPEECH_RATE = 165

# Voice index: 0 = first system voice (usually male), 1 = second (usually female)
VOICE_INDEX = 0

# Microphone listen timeout in seconds (how long Jarvis waits for you to speak)
LISTEN_TIMEOUT = 8

# Energy threshold for microphone noise calibration
# Higher = less sensitive (better in noisy rooms), Lower = more sensitive
ENERGY_THRESHOLD = 300

# Microphone device index.
# Set to None to use the system default microphone.
# Run  python mic_test.py  to find the right index for your mic.
MIC_DEVICE_INDEX = 1



# -----------------------------------------------------------------------------
# 🌍 LANGUAGE SETTINGS
# -----------------------------------------------------------------------------

# Default language for responses
# Options: "english", "hindi", "gujarati", "marathi", "chinese", "russian", "japanese", "spanish"
DEFAULT_LANGUAGE = "english"

# Language codes for deep-translator / gTTS
LANGUAGE_CODES = {
    "english":   "en",
    "hindi":     "hi",
    "gujarati":  "gu",
    "marathi":   "mr",
    "chinese":   "zh-CN",
    "russian":   "ru",
    "japanese":  "ja",
    "spanish":   "es",
}

# Language keywords assistant listens for
LANGUAGE_KEYWORDS = {
    "hindi":     ["hindi", "हिंदी", "hindi me"],
    "gujarati":  ["gujarati", "ગુજરાતી", "gujarati ma"],
    "marathi":   ["marathi", "मराठी", "marathi me"],
    "chinese":   ["chinese", "mandarin", "中文"],
    "russian":   ["russian", "русский"],
    "japanese":  ["japanese", "日本語"],
    "spanish":   ["spanish", "español"],
    "english":   ["english"],
}

# -----------------------------------------------------------------------------
# 🤖 AI AGENT PERSONAS
# -----------------------------------------------------------------------------

# Supported Agent Personas: "jarvis", "ultron", "friday", "vision", "karen", "titan"
DEFAULT_PERSONA = "jarvis"

AGENT_PERSONAS = {
    "jarvis": {
        "name": "J.A.R.V.I.S.",
        "title": "Tactical British Assistant",
        "color": "#00f0ff",
        "pitch": 0.95,
        "rate": 1.05,
    },
    "ultron": {
        "name": "ULTRON",
        "title": "Robotic Sovereign AI",
        "color": "#ef4444",
        "pitch": 0.65,
        "rate": 0.92,
    },
    "friday": {
        "name": "F.R.I.D.A.Y.",
        "title": "Tactical Operations Assistant",
        "color": "#10b981",
        "pitch": 1.15,
        "rate": 1.08,
    },
    "vision": {
        "name": "VISION",
        "title": "Philosophical Synthetic Mind",
        "color": "#f59e0b",
        "pitch": 0.90,
        "rate": 0.96,
    },
    "karen": {
        "name": "K.A.R.E.N.",
        "title": "Clever Combat & Suit AI",
        "color": "#a855f7",
        "pitch": 1.10,
        "rate": 1.04,
    },
    "titan": {
        "name": "TITAN",
        "title": "Heavy Military Baritone AI",
        "color": "#f8fafc",
        "pitch": 0.75,
        "rate": 1.00,
    },
}

# -----------------------------------------------------------------------------
# 💻 PC CONTROL — APPLICATION PATHS
# -----------------------------------------------------------------------------
# Jarvis will try these paths in order. Adjust if your apps are installed elsewhere.

APP_PATHS = {
    "chrome":        [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ],
    "firefox":       [
        r"C:\Program Files\Mozilla Firefox\firefox.exe",
        r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe",
    ],
    "edge":          [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    ],
    "vscode":        [
        r"C:\Users\{username}\AppData\Local\Programs\Microsoft VS Code\Code.exe",
    ],
    "notepad":       [r"C:\Windows\System32\notepad.exe"],
    "calculator":    [r"C:\Windows\System32\calc.exe"],
    "paint":         [r"C:\Windows\System32\mspaint.exe"],
    "wordpad":       [r"C:\Program Files\Windows NT\Accessories\wordpad.exe"],
    "task manager":  [r"C:\Windows\System32\taskmgr.exe"],
    "file explorer": [r"C:\Windows\explorer.exe"],
    "cmd":           [r"C:\Windows\System32\cmd.exe"],
    "powershell":    [r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"],
    "spotify":       [
        r"C:\Users\{username}\AppData\Roaming\Spotify\Spotify.exe",
    ],
    "discord":       [
        r"C:\Users\{username}\AppData\Local\Discord\Update.exe",
    ],
    "vlc":           [
        r"C:\Program Files\VideoLAN\VLC\vlc.exe",
        r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
    ],
    "word":          [
        r"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE",
        r"C:\Program Files (x86)\Microsoft Office\root\Office16\WINWORD.EXE",
    ],
    "excel":         [
        r"C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE",
        r"C:\Program Files (x86)\Microsoft Office\root\Office16\EXCEL.EXE",
    ],
    "powerpoint":    [
        r"C:\Program Files\Microsoft Office\root\Office16\POWERPNT.EXE",
        r"C:\Program Files (x86)\Microsoft Office\root\Office16\POWERPNT.EXE",
    ],
}

# -----------------------------------------------------------------------------
# 📁 MEMORY FILE
# -----------------------------------------------------------------------------

MEMORY_FILE = "jarvis_memory.json"

# -----------------------------------------------------------------------------
# 🌐 WEBSITE SHORTCUTS
# -----------------------------------------------------------------------------

WEBSITES = {
    "youtube":    "https://www.youtube.com",
    "google":     "https://www.google.com",
    "gmail":      "https://mail.google.com",
    "github":     "https://www.github.com",
    "netflix":    "https://www.netflix.com",
    "twitter":    "https://www.twitter.com",
    "instagram":  "https://www.instagram.com",
    "facebook":   "https://www.facebook.com",
    "reddit":     "https://www.reddit.com",
    "wikipedia":  "https://www.wikipedia.org",
    "amazon":     "https://www.amazon.com",
    "whatsapp":   "https://web.whatsapp.com",
    "linkedin":   "https://www.linkedin.com",
    "stackoverflow": "https://stackoverflow.com",
    "chatgpt":    "https://chat.openai.com",
    "deepseek":   "https://chat.deepseek.com",
}
