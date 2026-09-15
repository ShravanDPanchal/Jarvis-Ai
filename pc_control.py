# =============================================================================
#  pc_control.py — PC Automation
#  Opens apps, websites, takes screenshots, retrieves system info.
# =============================================================================

import os
import subprocess
import datetime
import webbrowser
import getpass

import psutil
import pyautogui

import config

# Suppress pyautogui failsafe in case of accidental mouse-to-corner
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.1

# ---------------------------------------------------------------------------
# Internal helper — resolve {username} in paths
# ---------------------------------------------------------------------------
_USERNAME = getpass.getuser()

def _resolve(path: str) -> str:
    return path.replace("{username}", _USERNAME)

# ---------------------------------------------------------------------------
# App opener
# ---------------------------------------------------------------------------
def open_app(app_name: str) -> str:
    """
    Try to open an application by name using the paths in config.APP_PATHS.
    Returns a status message.
    """
    key = app_name.lower().strip()

    # Direct match
    paths = config.APP_PATHS.get(key)

    # Fuzzy match — check if key is a substring of any app name
    if not paths:
        for app_key, app_paths in config.APP_PATHS.items():
            if key in app_key or app_key in key:
                paths = app_paths
                key = app_key
                break

    if paths:
        for path in paths:
            resolved = _resolve(path)
            if os.path.exists(resolved):
                try:
                    os.startfile(resolved)
                    return f"Opening {key.title()}."
                except Exception as e:
                    return f"Found {key} but couldn't open it: {e}"
        return f"I know {key.title()}, but couldn't find its install path. You can add it in config.py."

    # Fallback: try running as a system command
    try:
        subprocess.Popen(app_name, shell=True)
        return f"Trying to open {app_name}."
    except Exception:
        return f"I couldn't find an app called '{app_name}'. Check the APP_PATHS in config.py."

# ---------------------------------------------------------------------------
# Website opener
# ---------------------------------------------------------------------------
def open_website(site_name: str, search_query: str = "") -> str:
    """
    Open a website by name or open a Google search.
    """
    site_name = site_name.lower().strip()

    # Check shortcut list
    for key, url in config.WEBSITES.items():
        if key in site_name or site_name in key:
            webbrowser.open(url)
            return f"Opening {key.title()}."

    # If it looks like a URL
    if "." in site_name and " " not in site_name:
        url = site_name if site_name.startswith("http") else f"https://{site_name}"
        webbrowser.open(url)
        return f"Opening {site_name}."

    # Google search fallback
    if search_query:
        webbrowser.open(f"https://www.google.com/search?q={search_query.replace(' ', '+')}")
        return f"Searching Google for: {search_query}"

    webbrowser.open(f"https://www.google.com/search?q={site_name.replace(' ', '+')}")
    return f"Searching Google for: {site_name}"

def google_search(query: str) -> str:
    """Open a Google search for query."""
    webbrowser.open(f"https://www.google.com/search?q={query.replace(' ', '+')}")
    return f"Opened Google search for: {query}"

def youtube_search(query: str) -> str:
    """Open a YouTube search for query."""
    webbrowser.open(f"https://www.youtube.com/results?search_query={query.replace(' ', '+')}")
    return f"Searching YouTube for: {query}"

# ---------------------------------------------------------------------------
# System info
# ---------------------------------------------------------------------------
def get_time() -> str:
    now = datetime.datetime.now()
    return f"It is {now.strftime('%I:%M %p')} on {now.strftime('%A, %B %d, %Y')}."

def get_battery() -> str:
    try:
        battery = psutil.sensors_battery()
        if battery is None:
            return "No battery detected — this appears to be a desktop PC."
        plugged = "plugged in" if battery.power_plugged else "on battery"
        return f"Battery is at {battery.percent:.0f}%, {plugged}."
    except Exception:
        return "Could not retrieve battery information."

def get_system_info() -> str:
    cpu = psutil.cpu_percent(interval=1)
    ram = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    return (
        f"CPU usage: {cpu}%  |  "
        f"RAM: {ram.percent}% used ({ram.used // (1024**3):.1f} GB of {ram.total // (1024**3):.1f} GB)  |  "
        f"Disk: {disk.percent}% used."
    )

def get_ip() -> str:
    try:
        import socket
        hostname = socket.gethostname()
        ip = socket.gethostbyname(hostname)
        return f"Your local IP address is {ip}."
    except Exception:
        return "Could not determine IP address."

# ---------------------------------------------------------------------------
# Screenshot
# ---------------------------------------------------------------------------
def take_screenshot() -> str:
    try:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"screenshot_{timestamp}.png"
        image = pyautogui.screenshot()
        image.save(filename)
        return f"Screenshot saved as {filename}."
    except Exception as e:
        return f"Screenshot failed: {e}"

# ---------------------------------------------------------------------------
# Keyboard / Mouse helpers
# ---------------------------------------------------------------------------
def type_text(text: str) -> str:
    """Type text at the current cursor position."""
    pyautogui.typewrite(text, interval=0.05)
    return f"Typed: {text}"

def press_key(key: str) -> str:
    """Press a keyboard key (e.g. 'enter', 'ctrl+c')."""
    try:
        if "+" in key:
            parts = key.split("+")
            pyautogui.hotkey(*parts)
        else:
            pyautogui.press(key)
        return f"Pressed {key}."
    except Exception as e:
        return f"Key press failed: {e}"

def volume_up() -> str:
    pyautogui.press("volumeup")
    return "Volume increased."

def volume_down() -> str:
    pyautogui.press("volumedown")
    return "Volume decreased."

def volume_mute() -> str:
    pyautogui.press("volumemute")
    return "Volume muted."

# ---------------------------------------------------------------------------
# File operations
# ---------------------------------------------------------------------------
def list_files(folder: str = ".") -> str:
    """List files in a folder."""
    try:
        entries = os.listdir(folder)
        if not entries:
            return f"The folder '{folder}' is empty."
        files = [e for e in entries if os.path.isfile(os.path.join(folder, e))]
        dirs = [e for e in entries if os.path.isdir(os.path.join(folder, e))]
        result = []
        if dirs:
            result.append(f"Folders: {', '.join(dirs[:10])}")
        if files:
            result.append(f"Files: {', '.join(files[:10])}")
        if len(entries) > 20:
            result.append(f"... and {len(entries) - 20} more items.")
        return "  ".join(result)
    except FileNotFoundError:
        return f"Folder not found: {folder}"
    except PermissionError:
        return f"Permission denied to read: {folder}"

# ---------------------------------------------------------------------------
# Main command dispatcher — called by jarvis.py
# ---------------------------------------------------------------------------
def handle(command: str) -> str | None:
    """
    Parse a PC-control command and execute it.
    Returns a response string if handled, or None if this is not a PC command.
    """
    cmd = command.lower().strip()

    # ---- Time / Date ----
    if any(w in cmd for w in ["what time", "current time", "what's the time", "tell me the time"]):
        return get_time()
    if any(w in cmd for w in ["what day", "what date", "today's date", "what's the date"]):
        return get_time()

    # ---- Battery ----
    if "battery" in cmd:
        return get_battery()

    # ---- System info ----
    if any(w in cmd for w in ["system info", "cpu usage", "ram usage", "memory usage", "disk usage"]):
        return get_system_info()

    # ---- IP address ----
    if "ip address" in cmd or "my ip" in cmd:
        return get_ip()

    # ---- Screenshot ----
    if "screenshot" in cmd or "capture screen" in cmd:
        return take_screenshot()

    # ---- Volume ----
    if "volume up" in cmd or "increase volume" in cmd or "louder" in cmd:
        return volume_up()
    if "volume down" in cmd or "decrease volume" in cmd or "quieter" in cmd:
        return volume_down()
    if "mute" in cmd:
        return volume_mute()

    # ---- YouTube search ----
    if "search youtube" in cmd or "youtube search" in cmd:
        query = cmd.replace("search youtube for", "").replace("search youtube", "").replace("youtube search", "").replace("youtube for", "").strip()
        if query:
            return youtube_search(query)

    # ---- Open YouTube (no search) ----
    if "open youtube" in cmd or ("youtube" in cmd and "search" not in cmd):
        webbrowser.open("https://www.youtube.com")
        return "Opening YouTube."

    # ---- Google search ----
    if "search google" in cmd or "google search" in cmd or "search for" in cmd:
        query = (cmd
                 .replace("search google for", "")
                 .replace("search google", "")
                 .replace("google search for", "")
                 .replace("google search", "")
                 .replace("search for", "")
                 .strip())
        if query:
            return google_search(query)

    # ---- Open website ----
    if "open" in cmd:
        remainder = cmd.replace("open", "").strip()
        # Try websites first
        for site_key in config.WEBSITES:
            if site_key in remainder:
                webbrowser.open(config.WEBSITES[site_key])
                return f"Opening {site_key.title()}."
        # Try apps
        if remainder:
            result = open_app(remainder)
            if "couldn't find" not in result:
                return result
        return None  # Let AI handle "open [something abstract]"

    # ---- Direct app names (without "open") ----
    for app_key in config.APP_PATHS:
        if app_key in cmd:
            return open_app(app_key)

    # ---- Type text ----
    if cmd.startswith("type "):
        return type_text(cmd[5:])

    # ---- Press key ----
    if cmd.startswith("press "):
        return press_key(cmd[6:])

    # ---- List files ----
    if "list files" in cmd or "show files" in cmd:
        folder = cmd.replace("list files", "").replace("show files", "").replace("in", "").strip()
        return list_files(folder if folder else ".")

    # Not a PC command — return None so AI handles it
    return None
