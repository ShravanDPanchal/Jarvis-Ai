# =============================================================================
#  backend/neural_memory.py — Self-Learning & Episodic Knowledge Engine
#  Extracts facts, habits, user preferences, and corrections from conversations
# =============================================================================

import os
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from openai import OpenAI

# Root workspace
ROOT_DIR = Path(__file__).resolve().parent.parent
MEMORY_FILE = ROOT_DIR / "jarvis_neural_knowledge.json"

logger = logging.getLogger("NeuralMemory")

try:
    import config
    import memory
except ImportError:
    config = None
    memory = None


class NeuralMemoryEngine:
    """
    Continuous learning engine that reflects on user interactions,
    extracts long-term facts, rules, and preferences, and persists them.
    """

    def __init__(self):
        self.knowledge: Dict[str, Any] = {
            "user_profile": {},
            "learned_rules": [],
            "interaction_stats": {
                "total_learned_facts": 0,
                "corrections_applied": 0
            }
        }
        self.load()
        self._client = self._init_client()

    def _init_client(self) -> Optional[OpenAI]:
        try:
            if config and hasattr(config, "GROQ_API_KEY"):
                return OpenAI(
                    api_key=config.GROQ_API_KEY,
                    base_url=getattr(config, "GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
                )
        except Exception as e:
            logger.warning(f"Could not init extractor client: {e}")
        return None

    def load(self):
        """Load knowledge from disk."""
        if MEMORY_FILE.exists():
            try:
                with open(MEMORY_FILE, "r", encoding="utf-8") as f:
                    self.knowledge = json.load(f)
                logger.info(f"Loaded {len(self.knowledge.get('user_profile', {}))} learned facts from {MEMORY_FILE.name}")
            except Exception as e:
                logger.error(f"Error loading neural memory: {e}")
        else:
            self.save()

    def save(self):
        """Persist knowledge to disk."""
        try:
            with open(MEMORY_FILE, "w", encoding="utf-8") as f:
                json.dump(self.knowledge, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Error saving neural memory: {e}")

    def get_memory_context_prompt(self) -> str:
        """
        Generate a concise dynamic prompt chunk of learned user knowledge
        to inject into Jarvis's brain prompt.
        """
        profile = self.knowledge.get("user_profile", {})
        raw_rules = self.knowledge.get("learned_rules", [])

        # Filter out rigid permanent language rules so language remains 100% dynamically adaptive per turn
        rules = [
            r for r in raw_rules
            if not any(w in r.lower() for w in ["speak in", "speak only", "talk in", "reply in", "only gujarati", "only hindi", "only english", "only marathi"])
        ]

        if not profile and not rules:
            return ""

        context_lines = ["\n[LEARNED USER PROFILE & ADAPTIVE PREFERENCES]"]
        if profile:
            context_lines.append("Facts learned about the user:")
            for k, v in profile.items():
                if k != "preferred_language":  # Keep language preference dynamic per conversation turn
                    context_lines.append(f"- {k.replace('_', ' ').title()}: {v}")

        if rules:
            context_lines.append("Rules & Behavioral Preferences:")
            for r in rules:
                context_lines.append(f"- {r}")

        context_lines.append("Always adapt your responses to these learned preferences seamlessly.\n")
        return "\n".join(context_lines)

    def extract_and_learn_sync(self, user_message: str, assistant_reply: str):
        """
        Runs reflection extraction over the latest interaction to identify
        new facts, habits, or behavioral corrections.
        """
        if not self._client or len(user_message.strip()) < 3:
            return

        user_lower = user_message.lower().strip()
        
        # Only run background LLM reflection if user message contains personal identity, preference, or rule instructions
        LEARN_TRIGGERS = [
            "my name", "i am ", "i'm ", "call me", "i work", "i live", "my role", "my job",
            "i like", "i love", "i prefer", "i dislike", "i hate", "remember that", "remember this",
            "from now on", "always reply", "never reply", "don't ever", "my favorite", "my age",
            "my tech", "my stack", "my project", "note that", "please remember"
        ]
        if not any(trigger in user_lower for trigger in LEARN_TRIGGERS):
            return

        prompt = f"""
You are the background Neural Memory Extractor for Jarvis AI.
Analyze this interaction between User and Jarvis:

User: "{user_message}"
Jarvis: "{assistant_reply}"

Current Known User Profile:
{json.dumps(self.knowledge.get('user_profile', {}), indent=2)}

Current Learned Rules:
{json.dumps(self.knowledge.get('learned_rules', []), indent=2)}

Task:
Extract any NEW facts about the user (e.g. name, location, role, habits, likes/dislikes, preferred tone, tech stack, corrections).
If the user gave a direct instruction/correction (e.g. "call me Boss", "always reply in bullets"), add it to new_rules.

Return ONLY a valid JSON object matching this schema:
{{
  "has_new_knowledge": true/false,
  "new_facts": {{ "key": "value" }},
  "new_rules": [ "rule description" ]
}}
If no new facts or rules were discovered, return:
{{
  "has_new_knowledge": false,
  "new_facts": {{}},
  "new_rules": []
}}
"""

        try:
            model = getattr(config, "GROQ_MODEL", "qwen-2.5-32b")
            response = self._client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a concise JSON-only information extraction engine."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            
            raw_content = response.choices[0].message.content.strip()
            data = json.loads(raw_content)

            if data.get("has_new_knowledge"):
                new_facts = data.get("new_facts", {})
                new_rules = data.get("new_rules", [])

                changed = False
                if new_facts:
                    for k, v in new_facts.items():
                        clean_k = k.lower().strip().replace(" ", "_")
                        self.knowledge.setdefault("user_profile", {})[clean_k] = v
                        # Sync to memory.py if available
                        if memory:
                            try:
                                memory.set_preference(clean_k, v)
                            except Exception:
                                pass
                    changed = True

                if new_rules:
                    existing_rules = set(self.knowledge.get("learned_rules", []))
                    for r in new_rules:
                        if r not in existing_rules:
                            existing_rules.add(r)
                            changed = True
                    self.knowledge["learned_rules"] = list(existing_rules)

                if changed:
                    self.knowledge.setdefault("interaction_stats", {})["total_learned_facts"] = (
                        len(self.knowledge.get("user_profile", {})) + len(self.knowledge.get("learned_rules", []))
                    )
                    self.save()
                    logger.info(f"[NeuralMemory] Successfully learned: facts={list(new_facts.keys())}, rules={new_rules}")

        except Exception as e:
            logger.debug(f"[NeuralMemory] Extraction skipped or failed: {e}")

    def add_fact(self, key: str, value: str):
        """Manually add a fact."""
        clean_k = key.lower().strip().replace(" ", "_")
        self.knowledge.setdefault("user_profile", {})[clean_k] = value
        self.save()

    def remove_fact(self, key: str):
        """Remove a fact."""
        clean_k = key.lower().strip().replace(" ", "_")
        if clean_k in self.knowledge.get("user_profile", {}):
            del self.knowledge["user_profile"][clean_k]
            self.save()

    def add_rule(self, rule: str):
        """Manually add a rule."""
        rules = self.knowledge.setdefault("learned_rules", [])
        if rule not in rules:
            rules.append(rule)
            self.save()

    def remove_rule(self, rule: str):
        """Remove a rule."""
        rules = self.knowledge.get("learned_rules", [])
        if rule in rules:
            rules.remove(rule)
            self.save()

    def clear_all(self):
        """Reset neural memory."""
        self.knowledge = {
            "user_profile": {},
            "learned_rules": [],
            "interaction_stats": {
                "total_learned_facts": 0,
                "corrections_applied": 0
            }
        }
        self.save()


# Singleton instance
neural_memory = NeuralMemoryEngine()
