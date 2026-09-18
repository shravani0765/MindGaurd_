from collections import Counter
from datetime import timedelta
from functools import lru_cache
import json
import re

from django.conf import settings
from django.utils import timezone

from .models import MoodLog

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - dependency can be optional in some local setups
    OpenAI = None

EMOTION_SCORES = {
    "happy": 0.18,
    "calm": 0.12,
    "neutral": 0.42,
    "sad": 0.58,
    "fatigued": 0.66,
    "anxious": 0.78,
    "stressed": 0.9,
}

TEXT_RULES = {
    "stressed": [
        ("stress", 2.5),
        ("burnout", 3.2),
        ("deadline", 2.5),
        ("panic", 2.4),
        ("overwhelm", 3.0),
        ("overwhelmed", 3.0),
        ("pressure", 2.2),
        ("workload", 2.0),
        ("unmanageable", 2.4),
        ("unrealistic", 1.6),
    ],
    "anxious": [
        ("anxious", 3.0),
        ("worry", 2.0),
        ("nervous", 2.0),
        ("afraid", 2.1),
        ("scared", 2.4),
        ("racing thoughts", 2.8),
        ("presentation", 1.6),
    ],
    "fatigued": [
        ("tired", 2.5),
        ("exhausted", 3.1),
        ("drained", 2.8),
        ("heavy", 1.5),
        ("sleepy", 2.1),
        ("no energy", 2.9),
        ("worn out", 2.8),
    ],
    "happy": [
        ("happy", 2.8),
        ("great", 2.0),
        ("good", 1.5),
        ("grateful", 2.6),
        ("joy", 2.4),
        ("proud", 2.4),
        ("milestone", 2.3),
    ],
    "calm": [
        ("calm", 2.6),
        ("rested", 2.1),
        ("peaceful", 2.5),
        ("relaxed", 2.4),
        ("grounded", 2.4),
        ("steady", 1.7),
    ],
    "sad": [
        ("sad", 2.7),
        ("lonely", 2.8),
        ("alone", 2.5),
        ("empty", 2.4),
        ("numb", 2.3),
        ("low", 1.4),
    ],
}

INTENSIFIERS = ("very", "really", "extremely", "deeply", "so", "totally", "completely")
SOFTENERS = ("a bit", "a little", "kind of", "slightly", "somewhat")
MODE_WEIGHTS = {"text": 1.0, "voice": 1.05, "video": 0.95, "combo": 1.15}

TOPIC_FLAGS = {
    "workPressure": ("work", "deadline", "meeting", "boss", "presentation", "project", "task"),
    "sleepDepletion": ("sleep", "rest", "exhausted", "drained", "tired", "no energy"),
    "grounding": ("breathe", "breathing", "panic", "racing thoughts", "calm me down"),
    "celebration": ("proud", "milestone", "happy", "grateful", "achieved"),
    "loneliness": ("alone", "lonely", "isolated", "disconnected"),
    "heartbreak": (
        "breakup", "broke up", "break up", "ex ", "dumped", "left me", "cheated",
        "love failed", "love failure", "she left", "he left", "divorce", "rejected me",
        "heartbreak", "heart broken", "broken heart", "move on from her", "move on from him",
    ),
    "grief": ("passed away", "died", "death of", "lost my", "funeral", "no longer with us"),
    "selfHarm": ("hurt myself", "kill myself", "end it all", "want to disappear", "not worth living"),
}

URGENCY_ORDER = {"normal": 0, "elevated": 1, "high": 2}
VALID_EMOTIONS = tuple(EMOTION_SCORES.keys())


def analyze_text(text):
    heuristic = _analyze_text_heuristics(text)
    llm_result = _analyze_text_with_llm(text, heuristic)

    if not llm_result:
        return heuristic

    return _merge_heuristic_and_llm(heuristic, llm_result)


def analyze_audio(audio_base64="", transcript="", voice_features=None):
    """Infer emotion from a voice check-in.

    The transcript is by far the highest-signal channel available, so when the
    client has one it is routed through the same LLM-backed text pipeline the
    journal uses, then adjusted by any acoustic measurements. Raw base64 on its
    own carries no emotional information, so it is reported as unscored rather
    than dressed up as a prediction.
    """
    voice_features = _coerce_features(voice_features, VOICE_FEATURE_KEYS)
    transcript = (transcript or "").strip()

    if transcript:
        analysis = analyze_text(transcript)
        return _apply_acoustic_adjustment(analysis, voice_features)

    if voice_features:
        return _analyze_acoustic_only(voice_features)

    return _unscored_analysis("voice", bool(audio_base64))


def analyze_video(video_base64="", facial_signals=None):
    """Infer emotion from a video check-in.

    The browser already runs frame analysis (luminance/edge signatures for brow
    tension, mouth shape, and fatigue) before uploading, so the server scores
    those measurements instead of re-deriving them from an encoded frame.
    """
    facial_signals = _coerce_features(facial_signals, FACIAL_SIGNAL_KEYS)

    if facial_signals:
        return _analyze_facial_signals(facial_signals)

    return _unscored_analysis("video", bool(video_base64))


VOICE_FEATURE_KEYS = ("pitchVariance", "energy", "speechRate", "pauseRatio", "jitter")
FACIAL_SIGNAL_KEYS = ("emotion", "tension", "fatigue", "valence", "confidence")


def _coerce_features(payload, allowed_keys):
    """Keeps only known keys and drops anything non-numeric (besides `emotion`)."""
    if not isinstance(payload, dict):
        return {}

    cleaned = {}
    for key in allowed_keys:
        if key not in payload:
            continue
        value = payload[key]
        if key == "emotion":
            lowered = str(value or "").strip().lower()
            if lowered in VALID_EMOTIONS:
                cleaned[key] = lowered
            continue
        try:
            cleaned[key] = float(value)
        except (TypeError, ValueError):
            continue
    return cleaned


def _analyze_facial_signals(signals):
    """Scores client-side facial measurements into an emotion and confidence."""
    tension = _clamp(signals.get("tension", 20.0), 0.0, 100.0)
    fatigue = _clamp(signals.get("fatigue", 20.0), 0.0, 100.0)
    valence = _clamp(signals.get("valence", 60.0), 0.0, 100.0)
    reported = signals.get("emotion")

    scores = {emotion: 0.0 for emotion in EMOTION_SCORES}
    # The client's own classification is a strong prior, not the final answer —
    # the continuous measurements below can still override it.
    if reported:
        scores[reported] += 1.6

    scores["stressed"] += (tension / 100) * 2.4
    scores["fatigued"] += (fatigue / 100) * 2.4
    scores["happy"] += (valence / 100) * 1.8
    scores["sad"] += ((100 - valence) / 100) * 1.6
    scores["calm"] += ((100 - tension) / 100) * 1.2
    scores["neutral"] += 0.7

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    emotion = ranked[0][0]

    # Confidence rises with separation between the top two candidates, and is
    # capped below the text path because vision alone is the weaker signal.
    separation = ranked[0][1] - ranked[1][1]
    reported_confidence = signals.get("confidence")
    confidence = _clamp(0.6 + separation / 5, 0.6, 0.9)
    if reported_confidence is not None:
        confidence = _clamp((confidence + _clamp(reported_confidence, 0.0, 1.0)) / 2, 0.6, 0.9)

    topic_flags = {flag: False for flag in TOPIC_FLAGS}
    topic_flags["sleepDepletion"] = fatigue >= 60

    return {
        "emotion": emotion,
        "confidence": round(confidence, 2),
        "details": {
            "confidence": round(confidence, 2),
            "summary": (
                f"Facial signals suggest {emotion} "
                f"(tension {round(tension)}%, fatigue {round(fatigue)}%, valence {round(valence)}%)."
            ),
            "suggestion": suggested_action(emotion, topic_flags, "normal"),
            "topicFlags": topic_flags,
            "urgency": "normal",
            "confidenceBand": "high" if confidence >= 0.84 else "medium" if confidence >= 0.7 else "low",
            "supportStyle": _pick_support_style(emotion, topic_flags),
            "analysisEngine": "facial-signal-fusion-v1",
            "analysisModel": "client-frame-analyzer",
            "signals": {"tension": round(tension), "fatigue": round(fatigue), "valence": round(valence)},
        },
    }


def _analyze_acoustic_only(features):
    """Fallback scoring when a voice clip arrives without any transcript."""
    energy = _clamp(features.get("energy", 50.0), 0.0, 100.0)
    speech_rate = _clamp(features.get("speechRate", 50.0), 0.0, 100.0)
    pause_ratio = _clamp(features.get("pauseRatio", 30.0), 0.0, 100.0)
    pitch_variance = _clamp(features.get("pitchVariance", 40.0), 0.0, 100.0)

    scores = {emotion: 0.0 for emotion in EMOTION_SCORES}
    scores["neutral"] += 0.8
    # Fast, loud, pitch-variable speech reads as activation; the reverse as depletion.
    scores["anxious"] += (speech_rate / 100) * 1.4 + (pitch_variance / 100) * 1.2
    scores["stressed"] += (energy / 100) * 1.3 + (speech_rate / 100) * 0.9
    scores["fatigued"] += ((100 - energy) / 100) * 1.5 + (pause_ratio / 100) * 1.1
    scores["sad"] += ((100 - pitch_variance) / 100) * 1.0 + (pause_ratio / 100) * 0.8
    scores["calm"] += ((100 - speech_rate) / 100) * 0.9 + ((100 - pitch_variance) / 100) * 0.6

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    emotion = ranked[0][0]
    # Prosody without words is genuinely ambiguous — never claim more than 0.78.
    confidence = _clamp(0.58 + (ranked[0][1] - ranked[1][1]) / 5, 0.58, 0.78)
    topic_flags = {flag: False for flag in TOPIC_FLAGS}

    return {
        "emotion": emotion,
        "confidence": round(confidence, 2),
        "details": {
            "confidence": round(confidence, 2),
            "summary": f"Vocal prosody suggests {emotion}. No transcript was available to confirm it.",
            "suggestion": suggested_action(emotion, topic_flags, "normal"),
            "topicFlags": topic_flags,
            "urgency": "normal",
            "confidenceBand": "low",
            "supportStyle": _pick_support_style(emotion, topic_flags),
            "analysisEngine": "acoustic-prosody-v1",
            "analysisModel": "client-voice-features",
        },
    }


def _apply_acoustic_adjustment(analysis, features):
    """Nudges a transcript-derived result using prosody, without overriding it.

    Words carry the meaning; tone only tells us how hard it is landing. So this
    can raise or lower confidence and flag fatigue, but never changes the
    emotion label the text pipeline chose.
    """
    if not features:
        return analysis

    details = dict(analysis.get("details", {}))
    confidence = float(analysis.get("confidence", 0.74))

    energy = features.get("energy")
    speech_rate = features.get("speechRate")

    agreement = 0.0
    if energy is not None:
        if analysis["emotion"] == "fatigued" and energy < 35:
            agreement += 0.05
        elif analysis["emotion"] in {"happy", "calm"} and energy > 60:
            agreement += 0.04
        elif analysis["emotion"] == "fatigued" and energy > 70:
            agreement -= 0.05
    if speech_rate is not None and analysis["emotion"] in {"anxious", "stressed"} and speech_rate > 65:
        agreement += 0.05

    confidence = _clamp(confidence + agreement, 0.55, 0.99)
    details["confidence"] = round(confidence, 2)
    details["confidenceBand"] = "high" if confidence >= 0.84 else "medium" if confidence >= 0.7 else "low"
    details["analysisEngine"] = f"{details.get('analysisEngine', 'heuristic-v2')}+prosody"
    details["signals"] = {key: round(value, 2) for key, value in features.items() if isinstance(value, float)}

    return {"emotion": analysis["emotion"], "confidence": round(confidence, 2), "details": details}


def _unscored_analysis(mode, had_payload):
    """Records the check-in without inventing an emotion.

    Guessing from an opaque payload produced numbers that looked like inference
    but were not, which then polluted the burnout average. Logging `neutral` at
    an explicitly low confidence keeps the entry without corrupting the trend.
    """
    reason = (
        f"A {mode} sample arrived with no transcript or measured signals, so no emotion was inferred."
        if had_payload
        else f"No usable {mode} data was received."
    )
    topic_flags = {flag: False for flag in TOPIC_FLAGS}

    return {
        "emotion": "neutral",
        "confidence": 0.3,
        "details": {
            "confidence": 0.3,
            "summary": reason,
            "suggestion": "Add a short written or spoken note so MindGuard has something real to work with.",
            "topicFlags": topic_flags,
            "urgency": "normal",
            "confidenceBand": "low",
            "supportStyle": "reflection",
            "analysisEngine": "unscored",
            "analysisModel": "none",
            "unscored": True,
        },
    }


def create_mood_log(user_id, source_mode, analysis, user=None):
    normalized_user_id = str(getattr(user, "external_id", user_id) or user_id)
    mood_log = MoodLog.objects.create(
        user=user,
        client_user_id=normalized_user_id,
        source_mode=source_mode,
        emotion=analysis["emotion"],
        details=analysis.get("details", {"confidence": analysis.get("confidence", 0.8)}),
    )

    if user:
        snapshot = format_burnout_snapshot(get_user_logs(normalized_user_id))
        user.last_detected_emotion = mood_log.emotion
        user.burnout_score = snapshot["burnoutRisk"]
        user.save(update_fields=["last_detected_emotion", "burnout_score", "updated_at"])

    return mood_log


def get_user_logs(user_id):
    return MoodLog.objects.filter(client_user_id=str(user_id)).order_by("-timestamp")


RECENT_WINDOW = 10
PRIOR_WINDOW = 10


def _weighted_window(entries):
    """Weighted mean burden over one window, plus the weighted label tally.

    Recency is indexed from the start of the window, so the same weighting
    scheme applies to the recent and prior windows and the two means stay
    directly comparable.
    """
    weighted_scores = []
    weighted_counter = Counter()
    for index, item in enumerate(entries):
        recency_weight = 1 / (1 + (index * 0.38))
        confidence_weight = (
            float(item.details.get("confidence", 0.8))
            if isinstance(item.details, dict)
            else 0.8
        )
        mode_weight = MODE_WEIGHTS.get(item.source_mode, 1.0)
        weight = recency_weight * max(confidence_weight, 0.45) * mode_weight
        weighted_scores.append((EMOTION_SCORES.get(item.emotion, 0.42), weight))
        weighted_counter[item.emotion] += weight

    total_weight = sum(weight for _, weight in weighted_scores)
    if not total_weight:
        return None, weighted_counter
    mean = sum(score * weight for score, weight in weighted_scores) / total_weight
    return mean, weighted_counter


def format_burnout_snapshot(log_queryset):
    logs = list(log_queryset[: RECENT_WINDOW + PRIOR_WINDOW])
    if not logs:
        return {
            "burnoutRisk": 24,
            "level": "Low",
            "status": "Healthy equilibrium",
            "trend": "steady",
            "latestEmotion": "neutral",
            "dominantEmotion": "neutral",
            "recommendedCadence": "Two gentle check-ins across the day",
        }

    recent = logs[:RECENT_WINDOW]
    average, weighted_counter = _weighted_window(recent)
    burnout_risk = round(average * 100)

    if burnout_risk >= 70:
        level = "High"
        status = "Sustained strain detected"
    elif burnout_risk >= 45:
        level = "Moderate"
        status = "Recovery pacing recommended"
    else:
        level = "Low"
        status = "Healthy equilibrium"

    # Disjoint from `recent`, and weighted the same way, so the comparison below
    # is between two commensurable quantities.
    prior_window = logs[RECENT_WINDOW : RECENT_WINDOW + PRIOR_WINDOW]
    prior_average, _ = _weighted_window(prior_window)
    if prior_average is None:
        prior_average = average

    delta = average - prior_average
    if delta > 0.08:
        trend = "rising"
    elif delta < -0.08:
        trend = "improving"
    else:
        trend = "steady"

    dominant_emotion = weighted_counter.most_common(1)[0][0]
    return {
        "burnoutRisk": burnout_risk,
        "level": level,
        "status": status,
        "trend": trend,
        "latestEmotion": recent[0].emotion,
        "dominantEmotion": dominant_emotion,
        "recommendedCadence": recommended_cadence(level),
    }


def group_logs_by_day(logs, days=7):
    today = timezone.localdate()
    buckets = []
    recent_logs = list(logs)
    for offset in range(days - 1, -1, -1):
        day = today - timedelta(days=offset)
        day_logs = [log for log in recent_logs if timezone.localtime(log.timestamp).date() == day]
        calm_score = 0
        stress_score = 0
        if day_logs:
            for log in day_logs:
                score = EMOTION_SCORES.get(log.emotion, 0.42)
                stress_score += score
                calm_score += 1 - score
            denominator = len(day_logs)
            stress_score = round((stress_score / denominator) * 100)
            calm_score = round((calm_score / denominator) * 100)
        buckets.append(
            {
                "day": day.strftime("%a"),
                "stress": stress_score,
                "calm": calm_score,
            }
        )
    return buckets


def recommended_cadence(level):
    if level == "High":
        return "Check in every few hours and end the day with a cooldown"
    if level == "Moderate":
        return "Aim for a morning, midday, and evening check-in"
    return "Two gentle check-ins across the day"


def suggested_action(emotion, topic_flags=None, urgency="normal"):
    topic_flags = topic_flags or {}

    if urgency == "high":
        return "Reach out to a trusted person or local emergency support immediately."
    if topic_flags.get("workPressure"):
        return "Pick one next task and deliberately pause the rest for a few minutes."
    if topic_flags.get("sleepDepletion") or emotion == "fatigued":
        return "Take a short recovery break with water, slower breathing, and less screen strain."
    if emotion in {"stressed", "anxious", "sad"}:
        return "Take a 3-minute grounding reset and reduce one active demand."
    if emotion in {"happy", "calm"}:
        return "Capture what is helping so you can repeat it later."
    return "Add one short reflection so MindGuard can build a steadier baseline."


def serialize_user(user):
    full_name = " ".join(part for part in [user.first_name, user.last_name] if part).strip() or user.name or user.email.split("@")[0]
    return {
        "id": str(user.external_id),
        "email": user.email,
        "name": full_name,
        "firstName": user.first_name,
        "lastName": user.last_name,
        "burnoutScore": user.burnout_score,
        "lastDetectedEmotion": user.last_detected_emotion,
        "isVerified": user.is_verified,
    }


def _analyze_text_heuristics(text):
    lowered = (text or "").strip().lower()
    scores = {emotion: 0.45 for emotion in EMOTION_SCORES.keys()}
    scores["neutral"] += 0.6
    topic_flags = {flag: any(pattern in lowered for pattern in patterns) for flag, patterns in TOPIC_FLAGS.items()}

    for emotion, patterns in TEXT_RULES.items():
        for pattern, weight in patterns:
            if pattern in lowered:
                scores[emotion] += _apply_intensity(lowered, weight)

    if topic_flags["workPressure"]:
        scores["stressed"] += 0.9
    if topic_flags["sleepDepletion"]:
        scores["fatigued"] += 0.8
    if topic_flags["grounding"]:
        scores["anxious"] += 0.8
    if topic_flags["celebration"]:
        scores["happy"] += 0.8
    if topic_flags["loneliness"]:
        scores["sad"] += 0.9
    if topic_flags["heartbreak"]:
        scores["sad"] += 1.8
    if topic_flags["grief"]:
        scores["sad"] += 2.0
    if topic_flags["selfHarm"]:
        scores["stressed"] += 2.6

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    emotion = ranked[0][0]
    confidence = _clamp(0.58 + ((ranked[0][1] - ranked[1][1]) / 6), 0.58, 0.97)
    urgency = "high" if topic_flags["selfHarm"] else "elevated" if topic_flags["grounding"] and "panic" in lowered else "normal"
    details = {
        "confidence": round(confidence, 2),
        "summary": f"Detected {emotion} sentiment from reflection text.",
        "suggestion": suggested_action(emotion, topic_flags, urgency),
        "topicFlags": topic_flags,
        "urgency": urgency,
        "confidenceBand": "high" if confidence >= 0.84 else "medium" if confidence >= 0.7 else "low",
        "supportStyle": _pick_support_style(emotion, topic_flags),
        "analysisEngine": "heuristic-v2",
        "analysisModel": "rule-fusion",
    }
    return {"emotion": emotion, "confidence": round(confidence, 2), "details": details}


def _merge_heuristic_and_llm(heuristic, llm_result):
    heuristic_details = heuristic.get("details", {})
    llm_topic_flags = _normalize_topic_flags(llm_result.get("topicFlags"))
    topic_flags = {
        key: bool(heuristic_details.get("topicFlags", {}).get(key) or llm_topic_flags.get(key))
        for key in TOPIC_FLAGS.keys()
    }
    urgency = _higher_urgency(heuristic_details.get("urgency", "normal"), llm_result.get("urgency", "normal"))
    emotion = _normalize_emotion(llm_result.get("emotion") or heuristic.get("emotion"))
    confidence = _clamp(float(llm_result.get("confidence", heuristic.get("confidence", 0.74))), 0.58, 0.99)

    details = {
        "confidence": round(confidence, 2),
        "summary": llm_result.get("summary") or heuristic_details.get("summary"),
        "suggestion": llm_result.get("suggestion") or suggested_action(emotion, topic_flags, urgency),
        "topicFlags": topic_flags,
        "urgency": urgency,
        "confidenceBand": "high" if confidence >= 0.84 else "medium" if confidence >= 0.7 else "low",
        "supportStyle": llm_result.get("supportStyle") or _pick_support_style(emotion, topic_flags),
        "analysisEngine": llm_result.get("analysisEngine", "openai-responses"),
        "analysisModel": llm_result.get("analysisModel", settings.OPENAI_MODEL),
    }
    return {"emotion": emotion, "confidence": round(confidence, 2), "details": details}


def _analyze_text_with_llm(text, heuristic):
    client = _get_openai_client()
    if not client or not text or not text.strip():
        return None

    heuristic_details = heuristic.get("details", {})
    baseline = {
        "emotion": heuristic.get("emotion", "neutral"),
        "confidence": heuristic.get("confidence", 0.72),
        "topicFlags": heuristic_details.get("topicFlags", {}),
        "urgency": heuristic_details.get("urgency", "normal"),
    }

    prompt = (
        "Analyze this mental wellness check-in for a supportive burnout tracking app. "
        "Choose one emotion from: happy, calm, neutral, sad, fatigued, anxious, stressed. "
        "Return compact JSON with keys emotion, confidence, urgency, topicFlags, summary, suggestion, supportStyle. "
        "urgency must be one of normal, elevated, high. "
        "topicFlags must include booleans for workPressure, sleepDepletion, grounding, celebration, loneliness, selfHarm. "
        "supportStyle must be one of safety, grounding, prioritization, recovery, reinforcement, connection, reflection. "
        "Use the heuristic baseline as context, but correct it if the text clearly points elsewhere.\n\n"
        f"Heuristic baseline: {json.dumps(baseline, separators=(',', ':'))}\n"
        f"User text: {text.strip()}"
    )

    try:
        response = client.responses.create(
            model=settings.OPENAI_MODEL,
            input=prompt,
        )
        raw = (getattr(response, "output_text", "") or "").strip()
        if not raw:
            return None
        parsed = json.loads(_extract_json_object(raw))
    except Exception:
        return None

    return {
        "emotion": _normalize_emotion(parsed.get("emotion")),
        "confidence": parsed.get("confidence", heuristic.get("confidence", 0.74)),
        "urgency": parsed.get("urgency", heuristic_details.get("urgency", "normal")),
        "topicFlags": parsed.get("topicFlags", {}),
        "summary": str(parsed.get("summary", "")).strip() or heuristic_details.get("summary"),
        "suggestion": str(parsed.get("suggestion", "")).strip() or heuristic_details.get("suggestion"),
        "supportStyle": str(parsed.get("supportStyle", "")).strip() or heuristic_details.get("supportStyle"),
        "analysisEngine": "openai-responses",
        "analysisModel": settings.OPENAI_MODEL,
    }


@lru_cache(maxsize=1)
def _get_openai_client():
    if not settings.OPENAI_API_KEY or OpenAI is None:
        return None

    client_kwargs = {
        "api_key": settings.OPENAI_API_KEY,
        "timeout": settings.OPENAI_TIMEOUT_SECONDS,
    }
    if settings.OPENAI_BASE_URL:
        client_kwargs["base_url"] = settings.OPENAI_BASE_URL
    return OpenAI(**client_kwargs)


def _extract_json_object(raw):
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model response")
    return raw[start : end + 1]


def _normalize_topic_flags(value):
    if not isinstance(value, dict):
        return {}
    return {key: bool(value.get(key)) for key in TOPIC_FLAGS.keys()}


def _normalize_emotion(value):
    lowered = str(value or "neutral").strip().lower()
    return lowered if lowered in VALID_EMOTIONS else "neutral"


def _higher_urgency(left, right):
    normalized_left = left if left in URGENCY_ORDER else "normal"
    normalized_right = right if right in URGENCY_ORDER else "normal"
    return normalized_left if URGENCY_ORDER[normalized_left] >= URGENCY_ORDER[normalized_right] else normalized_right


def _pick_support_style(emotion, topic_flags):
    if topic_flags.get("selfHarm"):
        return "safety"
    if topic_flags.get("grounding") or emotion == "anxious":
        return "grounding"
    if topic_flags.get("workPressure") or emotion == "stressed":
        return "prioritization"
    if topic_flags.get("sleepDepletion") or emotion == "fatigued":
        return "recovery"
    if topic_flags.get("celebration") or emotion in {"happy", "calm"}:
        return "reinforcement"
    if topic_flags.get("heartbreak") or topic_flags.get("grief"):
        return "connection"
    if topic_flags.get("loneliness") or emotion == "sad":
        return "connection"
    return "reflection"


def _apply_intensity(content, weight):
    multiplier = 1.0
    for word in INTENSIFIERS:
        if re.search(rf"\b{re.escape(word)}\b", content):
            multiplier += 0.1
    for phrase in SOFTENERS:
        if phrase in content:
            multiplier -= 0.08
    return weight * multiplier


def _clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))
