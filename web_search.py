# =============================================================================
#  web_search.py — Real-time Web Information
#  Free sources (no API key needed) + optional Tavily for richer results.
# =============================================================================

import requests
import wikipedia
import config

# Suppress wikipedia disambiguation noise
wikipedia.set_lang("en")

# ---------------------------------------------------------------------------
# Weather — wttr.in (free, no key)
# ---------------------------------------------------------------------------
def get_weather(city: str = "") -> str:
    """
    Get current weather for a city.
    If no city given, uses the user's IP-detected location.
    """
    try:
        location = city.strip() if city.strip() else ""
        url = f"https://wttr.in/{location}?format=3"
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200:
            return resp.text.strip()
        return "Could not retrieve weather information right now."
    except requests.RequestException:
        return "Weather service is unavailable — check your internet connection."

# ---------------------------------------------------------------------------
# DuckDuckGo Instant Answer (free, no key)
# ---------------------------------------------------------------------------
def duckduckgo_instant(query: str) -> str:
    """
    Fetch a DuckDuckGo instant answer for a query.
    Returns abstract text if available, otherwise a fallback message.
    """
    try:
        url = "https://api.duckduckgo.com/"
        params = {
            "q":      query,
            "format": "json",
            "no_redirect": 1,
            "no_html": 1,
            "skip_disambig": 1,
        }
        resp = requests.get(url, params=params, timeout=5)
        data = resp.json()

        # Try different answer fields in order of richness
        for field in ("Answer", "AbstractText", "Definition"):
            if data.get(field):
                return data[field]

        # Try related topics
        related = data.get("RelatedTopics", [])
        snippets = []
        for item in related[:3]:
            if isinstance(item, dict) and item.get("Text"):
                snippets.append(item["Text"])
        if snippets:
            return " | ".join(snippets)

        return ""
    except Exception:
        return ""

# ---------------------------------------------------------------------------
# Wikipedia summary (free, no key)
# ---------------------------------------------------------------------------
def wiki_summary(query: str, sentences: int = 3) -> str:
    """
    Fetch a Wikipedia summary for a query.
    """
    try:
        summary = wikipedia.summary(query, sentences=sentences, auto_suggest=True)
        return summary
    except wikipedia.exceptions.DisambiguationError as e:
        # Return the first option
        try:
            summary = wikipedia.summary(e.options[0], sentences=sentences)
            return summary
        except Exception:
            return ""
    except wikipedia.exceptions.PageError:
        return ""
    except Exception:
        return ""

# ---------------------------------------------------------------------------
# Tavily search (optional, richer results)
# ---------------------------------------------------------------------------
def tavily_search(query: str) -> str:
    """
    Use Tavily API for real-time search results.
    Only called if TAVILY_API_KEY is configured.
    """
    if not config.TAVILY_API_KEY:
        return ""
    try:
        resp = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": config.TAVILY_API_KEY,
                "query":   query,
                "search_depth": "basic",
                "max_results": 3,
            },
            timeout=8,
        )
        data = resp.json()
        results = data.get("results", [])
        if not results:
            return ""
        snippets = [r.get("content", "") for r in results[:3] if r.get("content")]
        return " ".join(snippets)[:800]
    except Exception:
        return ""

# ---------------------------------------------------------------------------
# Main search dispatcher — called by jarvis.py
# ---------------------------------------------------------------------------
def search(query: str, search_type: str = "general") -> str:
    """
    Run a web search and return a result string.

    search_type options:
        "weather"   — weather query
        "wiki"      — Wikipedia lookup
        "general"   — DuckDuckGo → Wikipedia → Tavily fallback chain
    """
    query = query.strip()

    if search_type == "weather":
        # Extract city from query like "weather in Delhi"
        city = (query
                .lower()
                .replace("weather", "")
                .replace("what's the", "")
                .replace("what is the", "")
                .replace("in", "")
                .replace("for", "")
                .strip())
        return get_weather(city)

    if search_type == "wiki":
        result = wiki_summary(query)
        return result if result else f"No Wikipedia article found for '{query}'."

    # General: try Tavily first (if key available), then DuckDuckGo, then Wikipedia
    if config.TAVILY_API_KEY:
        result = tavily_search(query)
        if result:
            return result

    result = duckduckgo_instant(query)
    if result:
        return result

    result = wiki_summary(query)
    if result:
        return result

    return ""  # Let AI answer from training data

# ---------------------------------------------------------------------------
# Keyword-based dispatcher — called from jarvis.py command routing
# ---------------------------------------------------------------------------
def handle(command: str) -> str | None:
    """
    Check if the command is a web-search request.
    Returns result string if handled, or None if not a search command.
    """
    cmd = command.lower().strip()

    # Weather
    if "weather" in cmd:
        return search(command, search_type="weather")

    # News (just open Google News)
    if any(w in cmd for w in ["news", "headlines", "latest news"]):
        import webbrowser
        webbrowser.open("https://news.google.com")
        return "Opening Google News for the latest headlines."

    # Wikipedia
    if "wikipedia" in cmd or "wiki" in cmd:
        query = cmd.replace("wikipedia", "").replace("wiki", "").replace("search", "").strip()
        return search(query, search_type="wiki") if query else None

    # "Search the web for X" / "look up X" / "find information about X"
    if any(w in cmd for w in ["search the web", "look up", "find information", "find info"]):
        query = (cmd
                 .replace("search the web for", "")
                 .replace("search the web", "")
                 .replace("look up", "")
                 .replace("find information about", "")
                 .replace("find info about", "")
                 .strip())
        return search(query) if query else None

    return None
