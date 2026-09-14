// web/src/services/api.js
import { getStoredAuthToken, loadStoredSession } from './authSession';

const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');

async function requestJson(path, options = {}, fallback) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);
  const authToken = getStoredAuthToken();

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(options.headers || {}),
      },
      ...options,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `Request failed with ${response.status}`);
    }
    return data;
  } catch (error) {
    if (fallback) {
      return fallback(error);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const apiClient = {
  async register(payload) {
    return requestJson('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async login(payload) {
    const data = await requestJson('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return normalizeSessionPayload(data);
  },

  async logout() {
    return requestJson('/auth/logout', { method: 'POST' }, () => ({ message: 'Logged out' }));
  },

  async getCurrentSession() {
    const data = await requestJson('/auth/me');
    return {
      user: normalizeUser(data.user),
      burnoutSnapshot: data.burnoutSnapshot || null,
    };
  },

  async verifyEmail(token) {
    return requestJson(`/auth/verify?token=${encodeURIComponent(token)}`);
  },

  async requestPasswordReset(email) {
    return requestJson('/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async confirmPasswordReset(token, password, passwordConfirm) {
    return requestJson('/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ token, password, passwordConfirm }),
    });
  },

  async sendTextInteraction(userId, text) {
    const payload = userId ? { userId, text } : { text };
    const data = await requestJson(
      '/interactions/text',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      (error) => {
        console.warn('API error sending text interaction, falling back to local reasoning:', error);
        return mockAnalysis('text', text, userId);
      }
    );

    return { ...data, moodLog: normalizeMoodLog(data.moodLog) };
  },

  /**
   * @param {string} userId
   * @param {string} audioBase64 Raw clip, only used when no transcript exists.
   * @param {{transcript?: string, voiceFeatures?: Record<string, number>}} [signals]
   */
  async sendVoiceInteraction(userId, audioBase64, signals = {}) {
    const payload = {
      ...(userId ? { userId } : {}),
      ...(audioBase64 ? { audioBase64 } : {}),
      ...(signals.transcript ? { transcript: signals.transcript } : {}),
      ...(signals.voiceFeatures ? { voiceFeatures: signals.voiceFeatures } : {}),
    };

    const data = await requestJson(
      '/interactions/voice',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      (error) => {
        console.warn('API error sending voice interaction:', error);
        return mockAnalysis('voice', signals.transcript || '', userId);
      }
    );

    return { ...data, moodLog: normalizeMoodLog(data.moodLog) };
  },

  /**
   * @param {string} userId
   * @param {string} videoBase64
   * @param {Record<string, number|string>} [facialSignals] Measurements from the
   *   client-side frame analyser. The server scores these rather than the image.
   */
  async sendVideoInteraction(userId, videoBase64, facialSignals = null) {
    const payload = {
      ...(userId ? { userId } : {}),
      ...(videoBase64 ? { videoBase64 } : {}),
      ...(facialSignals ? { facialSignals } : {}),
    };

    const data = await requestJson(
      '/interactions/video',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      (error) => {
        console.warn('API error sending video interaction:', error);
        return mockAnalysis('video', '', userId);
      }
    );

    return { ...data, moodLog: normalizeMoodLog(data.moodLog) };
  },

  async getBurnoutRisk(userId) {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return requestJson(
      `/mood/burnout-risk${query}`,
      {},
      () => ({ burnoutRisk: 28, level: 'Low', status: 'Healthy equilibrium', trend: 'steady' })
    );
  },

  async getMoodHistory(userId) {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const data = await requestJson(
      `/mood/history${query}`,
      {},
      () => []
    );
    return Array.isArray(data) ? data.map(normalizeMoodLog) : [];
  },

  async createMoodEntry(payload) {
    const data = await requestJson('/mood', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      ...data,
      entry: normalizeMoodLog(data.entry),
    };
  },
};

function normalizeMoodLog(moodLog) {
  if (!moodLog) {
    return null;
  }

  return {
    id: moodLog.id || moodLog._id || `mood_${Date.now()}`,
    userId: moodLog.userId || moodLog.client_user_id || loadStoredSessionUserId(),
    emotion: moodLog.emotion || 'neutral',
    sourceMode: moodLog.sourceMode || moodLog.source_mode || 'text',
    timestamp: moodLog.timestamp || new Date().toISOString(),
    details: moodLog.details || {},
  };
}

function mockAnalysis(mode, text = '', userId = '') {
  let emotion = 'calm';
  const lower = text.toLowerCase();
  if (/anxious|panic|worried|racing/.test(lower)) {
    emotion = 'anxious';
  } else if (/stress|overwhelm|burnout|deadline|pressure/.test(lower)) {
    emotion = 'stressed';
  } else if (/tired|exhausted|drained|no energy|sleepy/.test(lower)) {
    emotion = 'fatigued';
  } else if (/happy|great|good|peace|relaxed|grateful|joy/.test(lower)) {
    emotion = 'happy';
  } else {
    emotion = 'neutral';
  }

  return {
    message: 'Interaction processed',
    moodLog: normalizeMoodLog({
      id: 'mock_' + Date.now(),
      userId,
      emotion,
      sourceMode: mode,
      timestamp: new Date().toISOString(),
      details: { confidence: 0.92, urgency: 'normal', topicFlags: {} },
    }),
  };
}

function normalizeSessionPayload(data) {
  return {
    authToken: data.authToken,
    refreshToken: data.refreshToken,
    user: normalizeUser(data.user),
    burnoutSnapshot: data.burnoutSnapshot || null,
  };
}

function normalizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name || [user.firstName, user.lastName].filter(Boolean).join(' '),
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    burnoutScore: user.burnoutScore ?? 24,
    lastDetectedEmotion: user.lastDetectedEmotion || 'neutral',
    isVerified: Boolean(user.isVerified ?? true),
  };
}

function loadStoredSessionUserId() {
  return loadStoredSession()?.user?.id || 'guest-user';
}
