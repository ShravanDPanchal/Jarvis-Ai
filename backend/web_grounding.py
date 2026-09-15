# =============================================================================
#  backend/web_grounding.py — Real-Time Live Web Search & Deep Article Grounding
#  Dynamically fetches live 2026 internet data, breaking news & exact webpage answers
# =============================================================================

import datetime
import json
import logging
import re
import ssl
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
from typing import Optional, List, Dict, Tuple

logger = logging.getLogger("WebGrounding")

# Keywords that indicate user wants real-world events, news, factual lookups, links or websites
LIVE_TRIGGERS = [
    "today", "yesterday", "tomorrow", "this week", "this month", "this year",
    "current", "currently", "latest", "recent", "recently", "news", "headline", "headlines",
    "weather", "score", "match", "stock", "price", "election", "who is",
    "what happened", "what happend", "who won", "2024", "2025", "2026", "2027", "search", "look up",
    "released", "release date", "champion", "president", "prime minister",
    "crash", "crashed", "plane", "flight", "aeroplane", "airplane", "accident",
    "incident", "disaster", "earthquake", "cyclone", "flood", "floods", "war", "died", "death",
    "killed", "scandal", "launch", "event", "happened", "happend", "occurred", "air india",
    "indian airlines", "is it true", "did you hear", "tell me about the", "know about",
    "going on", "what's going on", "whats going on", "what is happening", "what's happening",
    "update", "situation", "protest", "protests", "crisis", "minister",
    "answer", "today answer", "todays answer", "the answer", "solution", "result", "winner",
    "wordle", "wordle answer", "word",
    "link", "links", "url", "urls", "website", "websites", "site", "portal",
    "docs", "documentation", "download", "download link", "github", "repo",
    "repository", "source code", "official site", "official page", "webpage",
    "web page", "login page", "where to find", "link of", "link for", "link provide",
    "provide link", "give me link", "send link", "find link"
]


class WebGroundingEngine:
    """
    Provides real-time system clock anchors, automatic live web search, and deep article inspection (Web RAG).
    Combines Bing News RSS, Google News RSS, deep article content fetching, and DuckDuckGo text search.
    """

    def get_temporal_context(self) -> str:
        """
        Dynamically generates current date/time context based on system clock.
        Ensures Jarvis always knows the exact year, month, date, and day of the week.
        """
        now = datetime.datetime.now()
        date_str = now.strftime("%A, %B %d, %Y")
        time_str = now.strftime("%I:%M %p")
        return (
            f"[TEMPORAL ANCHOR - REAL-TIME CLOCK]\n"
            f"- Today's Date: {date_str}\n"
            f"- Current Year: {now.year}\n"
            f"- Exact Time: {time_str}\n"
            f"You are operating live in {date_str}. All references to 'now', 'today', 'this year', or 'recently' refer to the current date in {now.year}."
        )

    def should_search_web(self, query: str, history: list = None) -> bool:
        """
        Detects if query requires real-time live web facts, event lookup, or URL lookup.
        """
        q = query.lower().strip()

        # Skip personal questions, trivial greetings or conversational prompts
        personal_patterns = [
            "hi", "hello", "hey", "who are you", "who am i", "tell me a joke", "what is your name",
            "about myself", "about me", "my name", "who i am", "my role", "my preferences",
            "what do you know about me", "my profile"
        ]
        if len(q) < 4 or any(p in q for p in personal_patterns):
            return False

        # If asking about real-world events, facts, flights, crashes, news, or links/URLs
        if any(trigger in q for trigger in LIVE_TRIGGERS):
            return True

        if (
            q.startswith("do you know")
            or q.startswith("what happened")
            or q.startswith("what happend")
            or q.startswith("what is happening")
            or q.startswith("tell me what")
            or q.startswith("provide me")
            or q.startswith("so provide")
            or q.startswith("give me")
            or q.startswith("just tell")
            or "in 2026" in q
            or "in 2025" in q
            or "in 2024" in q
        ):
            return True

        return False

    def extract_search_topic(self, query: str, history: list = None) -> str:
        """
        Extracts clean core subject from conversational sentences, taking recent history into account.
        Example: "DO U KNOW ABOUT REEVA DIGITAL , IF YES THEN GIVE ME LINK OF THEIR WEBSITE" -> "REEVA DIGITAL"
        """
        q = query.strip()
        q = re.sub(r"\bhappend\b", "happened", q, flags=re.IGNORECASE)

        # 1. Strip conversational leading phrases (including 'do u know about', 'tell me about', etc.)
        cleaned = re.sub(
            r"^(do\s+(you|u)\s+know\s+(about\s+)?|can\s+(you|u)\s+tell\s+me\s+(about\s+)?|tell\s+me\s+(what\s+happened\s+in|what\s+is\s+happening\s+in|what\s+happened\s+with|about\s+the|about\s+|a\s+|the\s+)?|so\s+provide\s+me\s+(with\s+)?|provide\s+me\s+(with\s+)?|give\s+me\s+(the\s+)?|just\s+tell\s+me\s+(a\s+|the\s+)?|what\s+(is\s+the\s+news\s+in|is\s+the\s+news\s+about|happened\s+in|happened\s+with|is\s+happening\s+in|is\s+the\s+|is\s+|about\s+)|where\s+(is\s+the\s+link\s+for|is\s+the\s+|can\s+i\s+find\s+|to\s+find\s+)|search\s+(for\s+)?|look\s+up\s+|find\s+(information\s+about\s+|details\s+about\s+|me\s+)?|is\s+it\s+true\s+that\s+)\s*",
            "",
            q,
            flags=re.IGNORECASE,
        ).strip()

        # 2. Strip conditional and trailing link-request clauses
        # e.g. ", IF YES THEN GIVE ME LINK OF THEIR WEBSITE" or "and give me link of website"
        cleaned = re.sub(
            r"[,;]?\s*(if\s+(yes|so|possible|you\s+do)\s*,?\s*then\s+)?(give\s+me|provide\s+me|send\s+me|share\s+with\s+me|share\s+me|find\s+me)?\s*(the\s+)?(link|url|website|site|portal|details|info|address)\s*(of|for|to)?\s*(their|its|the|official)?\s*(website|site|portal|page|channel)?\s*$",
            "",
            cleaned,
            flags=re.IGNORECASE,
        ).strip()

        # Check if query is a context-dependent pronoun/short reference
        followup_phrases = ["today answer", "todays answer", "the answer", "what is the answer", "answer", "who won", "winner", "result", "the link", "solution", "it", "this", "word"]
        is_followup = len(cleaned.split()) <= 3 or any(p in cleaned.lower() for p in followup_phrases)

        if is_followup and history:
            # Look back in previous user messages in conversation history to find the subject entity
            subject = ""
            user_messages = [m for m in history if m.get("role") == "user"]
            for msg in reversed(user_messages):
                content = msg.get("content", "")
                content = content.split("\n\n[")[0].strip()
                clean_prev = re.sub(
                    r"\b(u|you|do|can|tell|me|about|know|the|a|an|game|what|is|are|how|why|please|hi|hello|hey|so|provide|give|today|todays|answer|news|in|just|word)\b|[^\w\s]",
                    " ",
                    content,
                    flags=re.IGNORECASE
                ).strip()
                clean_prev = re.sub(r"\s+", " ", clean_prev).strip()
                if clean_prev and len(clean_prev) > 2:
                    subject = clean_prev
                    break

            if subject and subject.lower() not in cleaned.lower():
                cleaned = f"{subject} {cleaned}".strip()

        if not cleaned:
            cleaned = q

        return cleaned

    def unquote_bing_url(self, raw_url: str) -> str:
        """
        Extracts the destination article URL from Bing News RSS redirect URLs.
        """
        if "url=" in raw_url:
            try:
                parsed = urllib.parse.parse_qs(urllib.parse.urlparse(raw_url).query)
                if "url" in parsed and parsed["url"]:
                    return parsed["url"][0]
            except Exception:
                pass
        return raw_url

    def fetch_deep_article_snippet(self, target_url: str) -> str:
        """
        Fetches the actual text from a news/gaming article webpage to unmask spoiler answers.
        """
        try:
            actual_url = self.unquote_bing_url(target_url)
            if not actual_url.startswith("http"):
                return ""

            req = urllib.request.Request(
                actual_url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
            )
            with urllib.request.urlopen(req, timeout=3.5) as response:
                html = response.read().decode("utf-8", errors="ignore")

            soup = BeautifulSoup(html, "html.parser")
            for s in soup(["script", "style", "nav", "header", "footer", "aside"]):
                s.decompose()

            text = " ".join(soup.stripped_strings)

            # Search specifically for answer patterns
            answer_matches = []
            for match in re.finditer(
                r"(?:Wordle\s*(?:#?\d+)?\s*(?:answer|solution|word)|the\s*answer\s*is|today\'s\s*(?:Wordle\s*)?answer\s*is|today\'s\s*word\s*is|the\s*word\s*is)[^\.]{0,100}",
                text,
                re.IGNORECASE
            ):
                answer_matches.append(match.group(0).strip())

            if answer_matches:
                return " | [Article Content Extraction: " + " ".join(answer_matches[:2]) + "]"
        except Exception as e:
            logger.debug(f"[WebGrounding] Deep article fetch note: {e}")

        return ""

    def fetch_bing_news_rss(self, query: str, max_results: int = 3) -> List[str]:
        """
        Fetches breaking real-time news and full snippet descriptions via Bing News RSS.
        """
        snippets: List[str] = []
        try:
            url = f"https://www.bing.com/news/search?q={urllib.parse.quote(query)}&format=rss"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            with urllib.request.urlopen(req, timeout=4.5) as response:
                xml_data = response.read()

            root = ET.fromstring(xml_data)
            items = root.findall(".//item")
            for item in items[:max_results]:
                title_elem = item.find("title")
                desc_elem = item.find("description")
                link_elem = item.find("link")
                pub_elem = item.find("pubDate")

                title = title_elem.text.strip() if title_elem is not None and title_elem.text else ""
                desc = desc_elem.text.strip() if desc_elem is not None and desc_elem.text else ""
                link = link_elem.text.strip() if link_elem is not None and link_elem.text else ""
                pub_date = pub_elem.text.strip() if pub_elem is not None and pub_elem.text else ""

                if title or desc:
                    date_pfx = f"[{pub_date}] " if pub_date else ""
                    clean_desc = re.sub(r"<[^>]+>", " ", desc).strip()
                    deep_extract = ""
                    # If this is an answer or game query and description was truncated, fetch article text
                    if any(k in query.lower() for k in ["wordle", "answer", "solution", "who won", "score"]) and link:
                        deep_extract = self.fetch_deep_article_snippet(link)

                    combined_desc = f"{clean_desc}{deep_extract}"
                    if combined_desc and link:
                        snippets.append(f"• [{date_pfx}{title}] (URL: {link}): {combined_desc}")
                    elif combined_desc:
                        snippets.append(f"• [{date_pfx}{title}]: {combined_desc}")
                    elif link:
                        snippets.append(f"• [{date_pfx}{title}] (URL: {link})")
        except Exception as e:
            logger.debug(f"[WebGrounding] Bing News RSS note: {e}")

        return snippets

    def fetch_google_news_rss(self, topic: str, max_results: int = 3) -> List[str]:
        """
        Fetches breaking real-time news via Google News RSS without rate limits.
        """
        snippets: List[str] = []
        try:
            encoded_topic = urllib.parse.quote(topic)
            url = f"https://news.google.com/rss/search?q={encoded_topic}&hl=en-US&gl=US&ceid=US:en"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            
            with urllib.request.urlopen(req, timeout=4.5) as response:
                xml_data = response.read()

            root = ET.fromstring(xml_data)
            items = root.findall(".//item")

            for item in items[:max_results]:
                title_elem = item.find("title")
                pub_elem = item.find("pubDate")
                link_elem = item.find("link")
                
                title = title_elem.text.strip() if title_elem is not None and title_elem.text else ""
                pub_date = pub_elem.text.strip() if pub_elem is not None and pub_elem.text else ""
                link = link_elem.text.strip() if link_elem is not None and link_elem.text else ""

                if title:
                    date_prefix = f"[{pub_date}] " if pub_date else ""
                    if link:
                        snippets.append(f"• [BREAKING NEWS: {date_prefix}{title}] (URL: {link})")
                    else:
                        snippets.append(f"• [BREAKING NEWS: {date_prefix}{title}]")
        except Exception as e:
            logger.debug(f"[WebGrounding] Google News RSS note: {e}")

        return snippets

    def fetch_ddg_html(self, query: str, max_results: int = 4) -> List[str]:
        """
        Fetches live web search results (websites, official domains, companies, services) via DuckDuckGo HTML search.
        """
        snippets: List[str] = []
        try:
            url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            }

            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=4.0) as resp:
                html = resp.read().decode("utf-8", errors="ignore")

            soup = BeautifulSoup(html, "html.parser")
            for r in soup.find_all("div", class_="result"):
                title_el = r.find("a", class_="result__a")
                if not title_el:
                    continue
                href = title_el.get("href", "")
                if "uddg=" in href:
                    parsed = urllib.parse.parse_qs(urllib.parse.urlparse(href).query)
                    if "uddg" in parsed:
                        href = parsed["uddg"][0]

                title = title_el.get_text().strip()
                snippet_el = r.find("a", class_="result__snippet")
                snippet = snippet_el.get_text().strip() if snippet_el else ""

                if href and title:
                    if snippet:
                        snippets.append(f"• [{title}] (URL: {href}): {snippet}")
                    else:
                        snippets.append(f"• [{title}] (URL: {href})")

                if len(snippets) >= max_results:
                    break
        except Exception as e:
            logger.debug(f"[WebGrounding] DDG HTML search note: {e}")

        return snippets

    def search_live(self, query: str, history: list = None, max_results: int = 4) -> str:
        """
        Orchestrates multi-source real-time search:
        - Full Web Search (DuckDuckGo HTML) for websites, companies, services, portals, and facts.
        - Bing News RSS & Google News RSS for breaking news events and live game answers.
        """
        topic = self.extract_search_topic(query, history=history)
        all_snippets: List[str] = []

        # 1. Full Web Search (highest priority for website, portal, company, and fact lookups)
        if topic:
            web_items = self.fetch_ddg_html(topic, max_results=max_results)
            all_snippets.extend(web_items)

        # 2. Query Bing News RSS (for breaking news and games like Wordle)
        if len(all_snippets) < 3 and topic:
            bing_items = self.fetch_bing_news_rss(topic, max_results=max_results)
            all_snippets.extend(bing_items)

        # 3. Query Google News RSS
        if len(all_snippets) < 2 and topic:
            google_items = self.fetch_google_news_rss(topic, max_results=max_results)
            all_snippets.extend(google_items)

        # 4. Fallback DDGS API
        if len(all_snippets) < 2 and topic:
            ddg_items = self.fetch_ddg_search(topic, max_results=max_results)
            all_snippets.extend(ddg_items)

        if all_snippets:
            seen = set()
            unique = []
            for s in all_snippets:
                if s not in seen:
                    seen.add(s)
                    unique.append(s)
            return "\n".join(unique[:max_results])

        return ""

    def verify_single_url(self, url: str, timeout: float = 2.5) -> Tuple[bool, str]:
        """
        Tests if a URL is active (status < 400 or auth-restricted 401/403).
        Tries HEAD first, falling back to GET. Follows redirects.
        """
        if not url.startswith(("http://", "https://")):
            return False, url

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }

        for method in ["HEAD", "GET"]:
            try:
                req = urllib.request.Request(url, headers=headers, method=method)
                with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
                    status = getattr(resp, "status", 200)
                    if status < 400:
                        return True, resp.geturl()
            except urllib.error.HTTPError as e:
                # 401 Unauthorized or 403 Forbidden means the site/page exists behind protection/Cloudflare
                if e.code in [401, 403]:
                    return True, url
                # Method Not Allowed for HEAD -> retry with GET
                if method == "HEAD" and e.code in [405, 501]:
                    continue
                return False, url
            except Exception:
                if method == "HEAD":
                    continue
                return False, url

        return False, url

    def get_direct_youtube_video(self, query: str) -> Optional[Tuple[str, str]]:
        """
        Fetches the top verified, 100% active, directly playable YouTube video URL (watch?v=...)
        for any search topic or video request.
        """
        try:
            clean_q = re.sub(r"[\–\—\-\:\(\)\[\]\|\_]", " ", query)
            clean_q = re.sub(r"\b(youtube search|youtube|video|channel|link|direct)\b", " ", clean_q, flags=re.IGNORECASE)
            clean_q = re.sub(r"\s+", " ", clean_q).strip()
            if not clean_q:
                clean_q = "Python tutorial"

            encoded = urllib.parse.quote_plus(clean_q)
            search_url = f"https://www.youtube.com/results?search_query={encoded}"

            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            }

            req = urllib.request.Request(search_url, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=3.5) as resp:
                html = resp.read().decode("utf-8", errors="ignore")

            video_ids = re.findall(r'\"videoId\":\"([a-zA-Z0-9_-]{11})\"', html)
            if not video_ids:
                video_ids = re.findall(r'/watch\?v=([a-zA-Z0-9_-]{11})', html)

            seen = set()
            for vid in video_ids:
                if vid in seen:
                    continue
                seen.add(vid)
                video_url = f"https://www.youtube.com/watch?v={vid}"

                # Verify with oEmbed
                try:
                    oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json"
                    oreq = urllib.request.Request(oembed_url, headers=headers)
                    with urllib.request.urlopen(oreq, context=ctx, timeout=2.0) as oresp:
                        if oresp.status == 200:
                            data = json.loads(oresp.read().decode("utf-8"))
                            title = data.get("title", query)
                            return video_url, title
                except Exception:
                    continue
        except Exception as e:
            logger.debug(f"[WebGrounding] Direct YouTube video fetch note: {e}")

        return None

    def is_incomplete_or_fake_platform_url(self, raw_url: str, anchor: str = "") -> Tuple[bool, Optional[str]]:
        """
        Detects incomplete, generic, or hallucinated platform links (e.g. youtube.com/c/,
        youtube.com/@, fake video IDs, empty github.com root, empty reddit) and converts them into
        high-precision structured query URLs or direct playable video links.
        """
        try:
            clean_url = raw_url.rstrip(".,;:!?)*_~#>")
            parsed = urllib.parse.urlparse(clean_url)
            netloc = parsed.netloc.lower()
            path = parsed.path.rstrip("/")
            query_params = urllib.parse.parse_qs(parsed.query)

            # Extract clean search query from anchor or path
            clean_anchor = anchor
            if not clean_anchor or clean_anchor.startswith(("http://", "https://", "www.")):
                path_name = path.split("/")[-1] if path else "Dubai real estate"
                path_name = re.sub(r"([A-Z])", r" \1", path_name).strip()
                clean_anchor = path_name

            clean_anchor = re.sub(r"[\–\—\-\:\(\)\[\]\|]", " ", clean_anchor)
            clean_anchor = re.sub(r"\s+", " ", clean_anchor).strip()
            encoded_query = urllib.parse.quote_plus(clean_anchor or "Dubai real estate")

            # 1. YouTube link validation & direct video resolution
            if "youtube.com" in netloc or "youtu.be" in netloc:
                # Check if it's already a specific valid video link (watch?v=...)
                video_id = query_params.get("v", [None])[0] if "v" in query_params else (path.lstrip("/") if "youtu.be" in netloc and len(path) > 3 and not path.startswith(("/c", "/@", "/channel", "/user")) else None)
                if video_id and not any(path.startswith(p) for p in ["/c", "/channel", "/user", "/@"]):
                    try:
                        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
                        req = urllib.request.Request(oembed_url, headers={"User-Agent": "Mozilla/5.0"})
                        with urllib.request.urlopen(req, timeout=2.0) as resp:
                            if resp.status == 200:
                                return False, clean_url
                    except Exception:
                        pass

                # Resolve top 1st direct playable video URL on YouTube
                direct_video = self.get_direct_youtube_video(clean_anchor or "Python tutorial")
                if direct_video:
                    return True, direct_video[0]

                # Fallback to search query
                return True, f"https://www.youtube.com/results?search_query={encoded_query}"

            # 2. GitHub incomplete repository link
            if "github.com" in netloc:
                if path in ["", "/search"] and clean_anchor:
                    return True, f"https://github.com/search?q={encoded_query}"

            # 3. Reddit incomplete link
            if "reddit.com" in netloc:
                if path in ["", "/search", "/r"] and clean_anchor:
                    return True, f"https://www.reddit.com/search/?q={encoded_query}"

            # 4. Wikipedia incomplete link
            if "wikipedia.org" in netloc:
                if path in ["", "/wiki"] and clean_anchor:
                    return True, f"https://en.wikipedia.org/wiki/Special:Search?search={encoded_query}"

            # 5. Twitter / X incomplete link
            if "twitter.com" in netloc or "x.com" in netloc:
                if path in ["", "/search"] and clean_anchor:
                    return True, f"https://x.com/search?q={encoded_query}"

            # 6. Google Maps incomplete link
            if "maps.google." in netloc or "google.com/maps" in raw_url:
                if not parsed.query and clean_anchor:
                    return True, f"https://www.google.com/maps/search/?api=1&query={encoded_query}"

            # 7. Placeholder or dummy domains
            placeholder_domains = ["example.com", "mysite.com", "sample.com", "yourdomain.com", "placeholder", "test.com"]
            if any(p in netloc for p in placeholder_domains):
                return True, f"https://www.google.com/search?q={encoded_query}"

        except Exception as e:
            logger.debug(f"[WebGrounding] Platform URL check note: {e}")

        return False, None

    def heal_url(self, raw_url: str, anchor: str = "") -> Optional[str]:
        """
        Validates URL and auto-heals 404 dead links, incomplete platform paths,
        and hallucinated video IDs into structured, fully-functional URLs.
        """
        clean_url = raw_url.strip().rstrip(".,;:!?)*_~#>")
        if not clean_url.startswith(("http://", "https://")):
            return None

        # 1. First check if it's an incomplete/unstructured platform URL (YouTube, GitHub, etc.)
        is_platform, healed_platform = self.is_incomplete_or_fake_platform_url(clean_url, anchor)
        if is_platform and healed_platform:
            return healed_platform

        # 2. Test exact original URL
        ok, final_u = self.verify_single_url(clean_url)
        if ok:
            return final_u.rstrip(".,;:!?)*_~#>")

        # 3. Parse domain and path
        try:
            parsed = urllib.parse.urlparse(clean_url)
            scheme = parsed.scheme or "https"
            netloc = parsed.netloc

            if not netloc:
                return None

            # Generate host variants (with and without 'www.')
            netloc_variants = [netloc]
            if netloc.startswith("www."):
                netloc_variants.append(netloc[4:])
            else:
                netloc_variants.append(f"www.{netloc}")

            # 4. Progressive path trimming (e.g. /en/dubai.html -> /en/ -> /)
            path_segments = [p for p in parsed.path.split("/") if p]
            while path_segments:
                path_segments.pop()
                subpath = "/" + "/".join(path_segments)
                if subpath != "/" and subpath:
                    subpath += "/"
                elif not subpath:
                    subpath = "/"

                for host in netloc_variants:
                    candidate = f"{scheme}://{host}{subpath}"
                    ok, final_u = self.verify_single_url(candidate)
                    if ok:
                        return final_u.rstrip(".,;:!?)*_~#>")

            # 5. Try root domains
            for host in netloc_variants:
                candidate = f"{scheme}://{host}/"
                ok, final_u = self.verify_single_url(candidate)
                if ok:
                    return final_u.rstrip(".,;:!?)*_~#>")
        except Exception as e:
            logger.debug(f"[WebGrounding] URL heal error: {e}")

        # 6. If completely dead domain but we have anchor text, fallback to search URL
        if anchor and not anchor.startswith(("http://", "https://")):
            clean_anchor = re.sub(r"[\–\—\-\:\(\)\[\]\|]", " ", anchor).strip()
            if clean_anchor:
                return f"https://www.google.com/search?q={urllib.parse.quote_plus(clean_anchor)}"

        return None

    def verify_and_heal_links(self, text: str) -> str:
        """
        Scans AI response for Markdown links [Anchor](URL) and raw URLs,
        validates all URLs in parallel, auto-heals 404 links and incomplete paths
        to their working base/parent or structured search URLs.
        """
        if not text or ("http://" not in text and "https://" not in text):
            return text

        # 1. Preprocess links where raw URL was used inside anchor preceded by label:
        # e.g. "- Dubai Land Department [https://youtube.com/c/...] (https://youtube.com/c/...)"
        pattern_with_prefix = re.compile(r"([-\*\•]\s*([^\[\n\r]+?)\s*)\[(https?://[^\s\]]+)\]\((https?://[^\s\)]+)\)")
        def repl_prefix(m):
            full_prefix = m.group(1)
            title = m.group(2).strip()
            raw_url = m.group(4).rstrip(".,;:!?)*_~#>")
            healed = self.heal_url(raw_url, title)
            if healed:
                return f"{full_prefix}[{title}]({healed})"
            return f"{full_prefix}**{title}**"
        text = pattern_with_prefix.sub(repl_prefix, text)

        # 2. Process all standard Markdown links [Anchor](URL)
        md_link_pattern = re.compile(r"\[([^\]]+)\]\((https?://[^\s\)]+)\)")
        md_matches = md_link_pattern.findall(text)

        if md_matches:
            def process_match(item):
                anchor, raw_url = item
                clean_url = raw_url.rstrip(".,;:!?)*_~#>")
                working = self.heal_url(clean_url, anchor)
                return (item, working)

            with ThreadPoolExecutor(max_workers=6) as executor:
                results = list(executor.map(process_match, md_matches))

            for (anchor, raw_url), working_url in results:
                target_str = f"[{anchor}]({raw_url})"
                if working_url:
                    text = text.replace(target_str, f"[{anchor}]({working_url})")
                else:
                    # Strip dead link, preserve anchor name as bold text
                    text = text.replace(target_str, f"**{anchor}**")

        return text

    def get_grounding_prompt(self, user_query: str, history: list = None) -> str:
        """
        Builds live web grounding prompt injection with context support.
        """
        temporal = self.get_temporal_context()
        now = datetime.datetime.now()

        # If query requires live web facts or links, search the web
        if self.should_search_web(user_query, history=history):
            web_facts = self.search_live(user_query, history=history)
            if web_facts:
                return (
                    f"{temporal}\n\n"
                    f"[LIVE REAL-TIME VERIFIED 2026 WEB & BREAKING NEWS RESULTS (Current Date: {now.strftime('%B %d, %Y')})]\n"
                    f"{web_facts}\n\n"
                    f"CRITICAL REAL-TIME INSTRUCTIONS:\n"
                    f"1. You MUST answer the user's question directly, accurately, and concisely using the fresh, verified live {now.strftime('%B %Y')} facts provided directly above.\n"
                    f"2. When asked for game answers (e.g. Wordle), news, or puzzle solutions, state the verified answer directly in bold (e.g. **MOUND**) without refusing, deflecting, or guessing.\n"
                    f"3. When the user asks for links, websites, documentation, or portals:\n"
                    f"   - Provide clean, verified URLs formatted as [Title](https://clean-domain-url.com/).\n"
                    f"   - NEVER hallucinate or guess deep subpaths (e.g. do NOT invent hypothetical URLs like /en/dubai.html or /investor/). Provide official top-level domain URLs.\n"
                    f"   - Inform the user that the clickable links are available in the chat box."
                )
            else:
                return (
                    f"{temporal}\n\n"
                    f"[REAL-TIME TEMPORAL DIRECTIVE]\n"
                    f"Today is {now.strftime('%B %d, %Y')}. If you do not have live breaking feeds for this specific event, state that as of {now.strftime('%B %Y')} no fresh live feed was received, and do NOT falsely claim events from 2024 or 2025 happened 'recently' or 'today'. When providing URLs, provide only verified official top-level domain URLs (e.g. https://www.propertyfinder.ae/)."
                )

        return temporal


# Global singleton instance
web_grounding = WebGroundingEngine()

