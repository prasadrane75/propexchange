import os
import requests
from typing import Optional

CLAUDE_API_URL = os.getenv("CLAUDE_API_URL")
CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-haiku-4.5")

# Only raise error if explicitly needed; allow fallback
HAS_CLAUDE = CLAUDE_API_URL and CLAUDE_API_KEY

if HAS_CLAUDE:
    HEADERS = {
        "Authorization": f"Bearer {CLAUDE_API_KEY}",
        "Content-Type": "application/json",
    }

def _extract_text_from_response(resp):
    try:
        j = resp.json()
    except Exception:
        return resp.text.strip()
    for key in ("text", "completion", "output", "result"):
        if key in j:
            val = j[key]
            if isinstance(val, str):
                return val.strip()
            if isinstance(val, dict) and "text" in val:
                return val["text"].strip()
    if "choices" in j and isinstance(j["choices"], list) and j["choices"]:
        c = j["choices"][0]
        if "message" in c and isinstance(c["message"], dict) and "content" in c["message"]:
            return c["message"]["content"].strip()
        for key in ("text", "content"):
            if key in c:
                return c[key].strip()
    if "output_text" in j:
        return j["output_text"].strip()
    return str(j)

def generate_description(title: str, price: Optional[float] = None, tone: str = "friendly, concise") -> str:
    if not HAS_CLAUDE:
        return _generate_fallback_description(title, price)
    
    prompt_lines = [
        f"Write a short, {tone} product description for the item titled: \"{title}\"."
    ]
    if price is not None:
        prompt_lines.append(f"The price is ${price:.2f}.")
    prompt_lines.append("Keep it to 1-3 sentences, suitable for an item listing.")
    prompt = "\n".join(prompt_lines)

    payload = {
        "model": CLAUDE_MODEL,
        "prompt": prompt,
        "max_tokens": 120,
        "temperature": 0.2
    }

    resp = requests.post(CLAUDE_API_URL, headers=HEADERS, json=payload, timeout=15)
    resp.raise_for_status()
    return _extract_text_from_response(resp)


def _generate_fallback_description(title: str, price: Optional[float] = None) -> str:
    """Generate a simple description without Claude (fallback)."""
    desc = f"A high-quality {title.lower()}."
    if price is not None:
        desc += f" Great value at ${price:.2f}."
    else:
        desc += " Excellent product."
    return desc
    return _extract_text_from_response(resp)
