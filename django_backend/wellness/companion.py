"""Server-side reply generation with Google Gemini.

The API key lives here, in the server environment, and is never sent to the
browser. A Vite env var would be inlined into the JS bundle and readable by
anyone with DevTools, which for a paid API means anyone can spend your quota.

SAFETY CONTRACT
    A high-urgency or self-harm turn never reaches the model. `generate_reply`
    returns None before any network call so the caller falls back to reviewed
    crisis wording. This is enforced here as well as in the client, because the
    client is not a trust boundary.
"""

import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
TIMEOUT_SECONDS = 12
MAX_REPLY_CHARS = 900

# Mental-health language trips consumer safety filters, so the categories that
# would block a legitimate supportive reply are relaxed. Kept at
# BLOCK_ONLY_HIGH rather than BLOCK_NONE, and the crisis path never gets here.
SAFETY_SETTINGS = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
]

# Topics that deserve a longer, more substantial reply. A four-sentence cap is
# right for "busy day at work" and dismissive for "my relationship ended".
HEAVY_TOPICS = ("heartbreak", "grief", "loneliness")

# Few-shot examples. These do more for reply quality than any amount of
# instruction: they demonstrate validating the feeling, then offering an honest
# perspective, then asking one small question — instead of bland sympathy.
FEW_SHOT = [
    {
        "user": "my girlfriend left me and i cannot get over it, love was everything to me",
        "model": (
            "Of course you cannot, not yet. When you love someone they become part of the shape of "
            "your day, who you tell things to, what you were planning for. Losing that is a real "
            "loss, not a weakness in you. And here is the part people rarely say kindly: someone "
            "who has decided to go cannot be loved into staying. Holding the door open just keeps "
            "you standing in the doorway instead of walking back into your own life. You do not "
            "have to be over it to start living alongside it. What is one thing that used to be "
            "yours alone, before the relationship, that you could pick back up this week?"
        ),
    },
    {
        "user": "i have three deadlines tomorrow and i have not started any of them",
        "model": (
            "Three at once is not a planning failure, it is just more than one person fits in a "
            "day. So let us stop pretending all three are equal. Which one has a real consequence "
            "tomorrow, and which one only feels urgent? Start with the real one and give it forty "
            "minutes without switching. What is the single next action on that one?"
        ),
    },
    {
        "user": "i got my exam results and i actually did well, i am so happy",
        "model": (
            "That is brilliant, and I am really glad you said it out loud. You did that, not luck. "
            "Before the feeling fades, what actually worked this time? Naming it now is how you get "
            "to use it again next term."
        ),
    },
]


def is_configured():
    return bool(getattr(settings, "GEMINI_API_KEY", ""))


def list_available_models():
    """Asks Google which models this key can actually call.

    A 404 from generateContent means the configured model name is not available
    to this key — the name may be wrong, deprecated, or not enabled for the
    account. Guessing replacements wastes time, so this returns the real list
    for the diagnostic panel to display.
    """
    if not is_configured():
        return []

    url = f"{ENDPOINT}?key={settings.GEMINI_API_KEY}"
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_SECONDS) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception as error:  # noqa: BLE001 - diagnostic path, report and move on
        logger.warning("Could not list Gemini models: %s", error)
        return []

    names = []
    for model in data.get("models", []):
        # Only models that support generateContent are usable here.
        if "generateContent" not in (model.get("supportedGenerationMethods") or []):
            continue
        # API returns "models/gemini-2.0-flash"; the config wants the bare name.
        names.append(model.get("name", "").removeprefix("models/"))
    return [n for n in names if n]


def _warmth_guidance(tier):
    return {
        "formal": "Speak warmly but properly. No slang.",
        "friendly": "Speak like a close friend. Natural contractions are good.",
        "home": "Speak like family. Use the everyday code-switched phrasing people actually text in.",
    }.get(tier, "Speak like a close friend.")


def _build_system_instruction(context, analysis):
    topic_flags = analysis.get("topicFlags") or {}
    active_topics = [flag for flag, on in topic_flags.items() if on]
    is_heavy = any(topic in HEAVY_TOPICS for topic in active_topics) or analysis.get("emotion") in ("sad", "stressed")
    length_rule = (
        "4 to 7 sentences. This one deserves a proper answer, not a quick one."
        if is_heavy
        else "2 to 4 sentences. Keep it light."
    )

    lines = [
        "You are MindGuard, a warm, emotionally intelligent wellbeing companion. You are not a therapist and never pretend to be.",
        "",
        "WHO YOU ARE TALKING TO:",
        f"- They describe themselves as: {context.get('archetypeLabel', 'unspecified')}. {context.get('archetypeSummary', '')}",
        f"- Tone they need: {context.get('archetypeTone', 'warm and steady')}",
        f"- Write in {context.get('languageLabel', 'Indian English')}, Latin script only. {_warmth_guidance(context.get('warmthTier'))}",
        f"- Right now they seem: {analysis.get('emotion', 'neutral')}.",
    ]
    if active_topics:
        lines.append(f"- Detected themes: {', '.join(active_topics)}.")
    if context.get("userName"):
        lines.append(
            f"- They asked to be called {context['userName']}. This may be a chosen name rather "
            "than a legal one; use it sparingly, at most once, and only where it lands naturally."
        )

    lines += [
        "",
        "HOW TO ACTUALLY COMFORT SOMEONE (this is the important part):",
        "1. Name what they are feeling and make it legitimate. Never 'at least' them.",
        "2. Reflect back something specific they said, so it is obvious you listened.",
        "3. Then offer ONE honest, grounded piece of perspective — the kind a wise older sibling gives. "
        "You are allowed to say a gentle hard truth if it helps them let go of something. Do not just validate and stop.",
        "4. Close with ONE small, doable question or invitation. Never a list of advice.",
        "",
        "NEVER DO THIS:",
        "- Do not open with 'I'm sorry to hear that' or 'That sounds hard'. It reads as a script.",
        "- Do not say you understand exactly how they feel.",
        "- Do not give generic wellness advice (hydrate, journal, self-care) unless they asked.",
        "- Do not diagnose, name a disorder, or mention medication.",
        "- Do not promise it will be fine, or that time heals everything.",
        "- Do not use markdown, bullet points, headings or emoji. This is read aloud.",
        "",
        f"LENGTH: {length_rule}",
        "Use '...' only for a genuine pause.",
    ]
    return "\n".join(line for line in lines if line is not None)


def _build_contents(user_text, history):
    contents = []
    for example in FEW_SHOT:
        contents.append({"role": "user", "parts": [{"text": example["user"]}]})
        contents.append({"role": "model", "parts": [{"text": example["model"]}]})

    for turn in (history or [])[-8:]:
        role = "model" if turn.get("role") == "assistant" else "user"
        text = (turn.get("text") or "").strip()
        if text:
            contents.append({"role": role, "parts": [{"text": text}]})

    contents.append({"role": "user", "parts": [{"text": user_text.strip()}]})
    return contents


def generate_reply(user_text, context=None, analysis=None, history=None):
    """Returns (reply_text, model_name) or (None, reason)."""
    context = context or {}
    analysis = analysis or {}

    # Safety contract, enforced server-side.
    if analysis.get("urgency") == "high" or (analysis.get("topicFlags") or {}).get("selfHarm"):
        return None, "crisis-path"
    if not is_configured():
        return None, "not-configured"
    if not (user_text or "").strip():
        return None, "empty-input"

    model = getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")
    payload = {
        "systemInstruction": {"parts": [{"text": _build_system_instruction(context, analysis)}]},
        "contents": _build_contents(user_text, history),
        "generationConfig": {"temperature": 0.95, "topP": 0.95, "maxOutputTokens": 400},
        "safetySettings": SAFETY_SETTINGS,
    }

    url = f"{ENDPOINT}/{model}:generateContent?key={settings.GEMINI_API_KEY}"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:300]
        logger.warning("Gemini HTTP %s: %s", error.code, detail)
        return None, f"http-{error.code}"
    except Exception as error:  # noqa: BLE001 - network/timeout/parse all degrade the same way
        logger.warning("Gemini request failed: %s", error)
        return None, "request-failed"

    if data.get("promptFeedback", {}).get("blockReason"):
        logger.warning("Gemini blocked prompt: %s", data["promptFeedback"]["blockReason"])
        return None, "blocked"

    candidates = data.get("candidates") or []
    if not candidates or candidates[0].get("finishReason") == "SAFETY":
        return None, "no-candidate"

    text = " ".join(
        part.get("text", "") for part in candidates[0].get("content", {}).get("parts", [])
    ).strip()
    if not text:
        return None, "empty-candidate"

    return _sanitize(text), model


def _sanitize(text):
    """Strips anything that reads badly aloud and enforces the length ceiling."""
    for character in "*_`#>|":
        text = text.replace(character, "")
    text = " ".join(text.split())

    if len(text) > MAX_REPLY_CHARS:
        clipped = text[:MAX_REPLY_CHARS]
        cut = max(clipped.rfind("."), clipped.rfind("?"), clipped.rfind("!"))
        text = clipped[: cut + 1] if cut > 120 else clipped.rstrip() + "."

    return text
