import React, { useEffect, useMemo, useRef, useState } from 'react';
import './components/ui/ui.css';
import './App.css';
import Header from './components/Header';
import ModeSwitcher from './components/ModeSwitcher';
import VoiceAssistantOrb from './components/VoiceAssistantOrb';
import ChatInterface from './components/ChatInterface';
import VideoInterface from './components/VideoInterface';
import ComboInterface from './components/ComboInterface';
import BurnoutRadar from './components/BurnoutRadar';
import SadhguruMeditationModal from './components/SadhguruMeditationModal';
import InsightsPanel from './components/InsightsPanel';
import DashboardHero from './components/DashboardHero';
import StreakCard from './components/StreakCard';
import DailyQuote from './components/DailyQuote';
import RecoveryGuidePanel from './components/RecoveryGuidePanel';
import AuthScreen from './components/AuthScreen';
import OnboardingScreen from './components/OnboardingScreen';
import VoiceStudioModal from './components/VoiceStudioModal';
import { Music, X } from 'lucide-react';
import { apiClient, onServerWaking, wakeServer } from './services/api';
import { clearStoredSession, loadStoredSession, saveStoredSession } from './services/authSession';
import { aiConfig } from './services/aiConfig';
import { speechService } from './services/speech';
import { anchorReminder, engageComfortLayer, loadComfortProfile, releaseComfortLayer } from './services/comfortProfile';
import { sanctuaryTheme } from './services/sanctuaryTheme';

const EMPTY_SNAPSHOT = {
  burnoutRisk: 28,
  level: 'Low',
  status: 'Healthy equilibrium',
  trend: 'steady',
  latestEmotion: 'neutral',
  dominantEmotion: 'neutral',
};

export default function App() {
  const routeInfo = getRouteInfo();
  const initialSessionRef = useRef(loadStoredSession());
  const [session, setSession] = useState(initialSessionRef.current);
  const [isCheckingSession, setIsCheckingSession] = useState(() => Boolean(initialSessionRef.current?.authToken));
  const [currentMode, setCurrentMode] = useState('text');
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [moodHistory, setMoodHistory] = useState([]);
  const [burnoutSnapshot, setBurnoutSnapshot] = useState(() => loadStoredSession()?.burnoutSnapshot || EMPTY_SNAPSHOT);
  const [isSyncingInsights, setIsSyncingInsights] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isMeditationOpen, setIsMeditationOpen] = useState(false);
  const [isVoiceStudioOpen, setIsVoiceStudioOpen] = useState(false);
  const [isOnboarded, setIsOnboarded] = useState(() => aiConfig.isOnboarded());
  // What the user asked to be called. Held locally, never on the account.
  const [preferredName, setPreferredName] = useState(() => aiConfig.getPreferredName());
  const [interventionToast, setInterventionToast] = useState(null);
  const [sanctuaryMode, setSanctuaryMode] = useState('default');
  const [isServerWaking, setIsServerWaking] = useState(false);

  const activeUserId = session?.user?.id || null;
  const burnoutScore = burnoutSnapshot.burnoutRisk;

  useEffect(() => {
    let cancelled = false;
    const savedSession = initialSessionRef.current;

    async function restoreSession() {
      if (!savedSession?.authToken) {
        setIsCheckingSession(false);
        return;
      }

      setIsCheckingSession(true);
      try {
        const current = await apiClient.getCurrentSession();
        if (cancelled) return;
        const nextSession = {
          ...savedSession,
          user: current.user,
          burnoutSnapshot: current.burnoutSnapshot || savedSession.burnoutSnapshot || EMPTY_SNAPSHOT,
        };
        saveStoredSession(nextSession);
        setSession(nextSession);
        setBurnoutSnapshot(nextSession.burnoutSnapshot || EMPTY_SNAPSHOT);
      } catch (error) {
        console.warn('Unable to restore saved session:', error);
        clearStoredSession();
        if (!cancelled) {
          setSession(null);
          setBurnoutSnapshot(EMPTY_SNAPSHOT);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingSession(false);
        }
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeUserId) {
      setMoodHistory([]);
      setBurnoutSnapshot(EMPTY_SNAPSHOT);
      return;
    }

    void refreshInsights(activeUserId);
  }, [activeUserId]);

  // Free hosting sleeps the API. Start waking it the moment the page opens so
  // the first real request is not the one that pays the ~50s cold start.
  useEffect(() => {
    const unsubscribe = onServerWaking(setIsServerWaking);
    void wakeServer();
    return unsubscribe;
  }, []);

  useEffect(() => {
    setSanctuaryMode(sanctuaryTheme.restore());
    return sanctuaryTheme.subscribe(setSanctuaryMode);
  }, []);

  // Start fetching the neural voice weights as soon as the user is in the app,
  // so the first spoken reply does not stall behind a cold download.
  useEffect(() => {
    if (!activeUserId || !isOnboarded) return;
    void speechService.preloadNeuralVoice();
  }, [activeUserId, isOnboarded]);

  const handleToggleMic = () => setIsMicOn((prev) => !prev);
  const handleToggleCam = () => setIsCamOn((prev) => !prev);
  const handleToggleTranscript = () => setShowTranscript((prev) => !prev);

  async function refreshInsights(userId = activeUserId) {
    if (!userId) return;

    setIsSyncingInsights(true);
    try {
      const [history, snapshot] = await Promise.all([
        apiClient.getMoodHistory(userId),
        apiClient.getBurnoutRisk(userId),
      ]);
      setMoodHistory(history);
      setBurnoutSnapshot((prev) => ({ ...prev, ...snapshot }));
      setSession((prev) => {
        if (!prev) return prev;
        const nextSession = { ...prev, burnoutSnapshot: { ...prev.burnoutSnapshot, ...snapshot } };
        saveStoredSession(nextSession);
        return nextSession;
      });
    } finally {
      setIsSyncingInsights(false);
    }
  }

  const handleMoodLogged = (logEntry) => {
    if (!logEntry) return;

    const normalizedEntry = normalizeMoodLog(logEntry);
    setMoodHistory((prev) => {
      const nextHistory = [normalizedEntry, ...prev].slice(0, 30);
      setBurnoutSnapshot(buildSnapshot(nextHistory));
      return nextHistory;
    });

    if (DISTRESS_EMOTIONS.includes(normalizedEntry.emotion)) {
      engageComfortLayer(loadComfortProfile());
      sanctuaryTheme.engageForDistress();
      setInterventionToast(describeComfortLayer());
      setTimeout(() => setInterventionToast(null), 9000);
    }

    if (normalizedEntry.emotion === 'happy' || normalizedEntry.emotion === 'calm') {
      // Coming back up is the moment to hand the room back to the user.
      sanctuaryTheme.releaseAutomatic();
      setInterventionToast('A positive signal was logged. This is a good moment to preserve the routine that helped you feel steadier.');
      setTimeout(() => setInterventionToast(null), 5000);
    }

    void refreshInsights();
  };

  const handleAuthenticated = (nextSession) => {
    saveStoredSession(nextSession);
    setSession(nextSession);
    setIsOnboarded(aiConfig.isOnboarded());
    setBurnoutSnapshot(nextSession.burnoutSnapshot || EMPTY_SNAPSHOT);
    setMoodHistory([]);
    setCurrentMode('text');
    setIsMicOn(false);
    setIsCamOn(false);
    window.history.replaceState({}, '', '/');
  };

  const handleLogout = async () => {
    speechService.stopSpeaking();
    releaseComfortLayer();
    sanctuaryTheme.releaseAutomatic();

    try {
      await apiClient.logout();
    } catch (error) {
      console.warn('Logout request failed:', error);
    }

    clearStoredSession();
    setSession(null);
    setMoodHistory([]);
    setBurnoutSnapshot(EMPTY_SNAPSHOT);
    setCurrentMode('text');
    setIsMicOn(false);
    setIsCamOn(false);
    setShowTranscript(true);
    setIsDashboardOpen(false);
    setIsMeditationOpen(false);
    setIsVoiceStudioOpen(false);
  };

  const recoveryActions = useMemo(
    () => getRecoveryActions(burnoutSnapshot, moodHistory[0]),
    [burnoutSnapshot, moodHistory]
  );

  if (!session) {
    return (
      <AuthScreen
        onAuthenticated={handleAuthenticated}
        initialMode={routeInfo.path === '/reset-password' ? 'reset' : 'login'}
        routePath={routeInfo.path}
        routeToken={routeInfo.token}
      />
    );
  }

  if (isCheckingSession) {
    return <div className="app-loading">Restoring your private check-in space...</div>;
  }

  if (!isOnboarded) {
    return (
      <OnboardingScreen
        userName={session.user?.firstName || session.user?.name}
        onComplete={({ preferredName: chosen }) => {
          setPreferredName(chosen || '');
          setIsOnboarded(true);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <Header
        burnoutScore={burnoutScore}
        onOpenDashboard={() => setIsDashboardOpen(true)}
        userName={preferredName || session.user?.firstName || session.user?.name}
        onLogout={handleLogout}
        onOpenVoiceStudio={() => setIsVoiceStudioOpen(true)}
        sanctuaryMode={sanctuaryMode}
        onToggleSanctuary={() => sanctuaryTheme.toggle()}
        onOpenYoga={() => setIsMeditationOpen(true)}
      />

      {isServerWaking && (
        <div className="waking-banner" role="status" aria-live="polite">
          <span className="waking-banner__spinner" aria-hidden="true" />
          <span>Waking the server up — first load after a quiet spell takes about 30 seconds.</span>
        </div>
      )}

      {interventionToast && (
        <div className="intervention-toast">
          <Music size={18} color="var(--sage-green)" />
          <span>{interventionToast}</span>
          <button
            type="button"
            onClick={() => setInterventionToast(null)}
            className="toast-dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <main className="app-content">
        <section className="hero-grid">
          <DashboardHero
            currentMode={currentMode}
            burnoutSnapshot={burnoutSnapshot}
            onStartCheckIn={() => setCurrentMode('text')}
            onViewTrends={() => setIsDashboardOpen(true)}
          />

          <div className="hero-grid__aside">
            <StreakCard moodHistory={moodHistory} />

            <DailyQuote />

            <InsightsPanel
              burnoutSnapshot={burnoutSnapshot}
              moodHistory={moodHistory}
              isLoading={isSyncingInsights}
              onRefresh={refreshInsights}
              onOpenDashboard={() => setIsDashboardOpen(true)}
            />
          </div>
        </section>

        <ModeSwitcher
          currentMode={currentMode}
          onModeChange={(mode) => {
            setCurrentMode(mode);
            setIsMicOn(mode === 'voice' || mode === 'combo');
            setIsCamOn(mode === 'video' || mode === 'combo');
          }}
          isMicOn={isMicOn}
          onToggleMic={handleToggleMic}
          isCamOn={isCamOn}
          onToggleCam={handleToggleCam}
          showTranscript={showTranscript}
          onToggleTranscript={handleToggleTranscript}
        />

        <section className="workspace-grid">
          <div className="experience-shell">
            {currentMode === 'combo' && (
              <ComboInterface
                isMicOn={isMicOn}
                onToggleMic={handleToggleMic}
                isCamOn={isCamOn}
                onToggleCam={handleToggleCam}
                showTranscript={showTranscript}
                onMoodLogged={handleMoodLogged}
                onOpenMeditation={() => setIsMeditationOpen(true)}
                userId={activeUserId}
              />
            )}

            {currentMode === 'voice' && (
              <VoiceAssistantOrb
                isMicOn={isMicOn}
                onToggleMic={handleToggleMic}
                showTranscript={showTranscript}
                onMoodLogged={handleMoodLogged}
                userId={activeUserId}
              />
            )}

            {currentMode === 'text' && (
              <ChatInterface onMoodLogged={handleMoodLogged} userId={activeUserId} />
            )}

            {currentMode === 'video' && (
              <VideoInterface
                isCamOn={isCamOn}
                onToggleCam={handleToggleCam}
                onMoodLogged={handleMoodLogged}
                userId={activeUserId}
              />
            )}
          </div>

          <RecoveryGuidePanel recoveryActions={recoveryActions} moodHistory={moodHistory} />
        </section>
      </main>

      <BurnoutRadar
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        burnoutScore={burnoutScore}
        moodHistory={moodHistory}
        burnoutSnapshot={burnoutSnapshot}
      />

      <SadhguruMeditationModal
        isOpen={isMeditationOpen}
        onClose={() => setIsMeditationOpen(false)}
      />

      <VoiceStudioModal
        isOpen={isVoiceStudioOpen}
        onClose={() => setIsVoiceStudioOpen(false)}
        onAccountDeleted={handleLogout}
      />
    </div>
  );
}

// Emotions that should dim the room and bring the comfort layer in.
const DISTRESS_EMOTIONS = ['stressed', 'anxious', 'sad', 'fatigued'];

/**
 * Describes what the comfort layer actually started, so the toast never claims
 * to have played a track the user never configured.
 */
function describeComfortLayer() {
  const profile = loadComfortProfile();
  const parts = ['MindGuard noticed the strain and dimmed the room.'];

  if (profile.comfortTrackUrl) {
    parts.push('Your comfort track and soundscape are playing softly underneath.');
  } else {
    parts.push('A gentle soundscape is playing underneath.');
  }

  const anchor = anchorReminder(profile);
  if (anchor) parts.push(anchor);

  return parts.join(' ');
}

function getRouteInfo() {
  if (typeof window === 'undefined') {
    return { path: '/', token: '' };
  }

  const url = new URL(window.location.href);
  return {
    path: url.pathname,
    token: url.searchParams.get('token') || '',
  };
}

function normalizeMoodLog(logEntry) {
  return {
    id: logEntry.id || logEntry._id || `entry_${Date.now()}`,
    emotion: logEntry.emotion || 'neutral',
    sourceMode: logEntry.sourceMode || logEntry.source_mode || 'text',
    timestamp: logEntry.timestamp || new Date().toISOString(),
    details: logEntry.details || {},
  };
}

function buildSnapshot(logs) {
  if (!logs.length) {
    return EMPTY_SNAPSHOT;
  }

  const scoreMap = {
    calm: 0.12,
    happy: 0.2,
    neutral: 0.42,
    sad: 0.58,
    fatigued: 0.66,
    anxious: 0.78,
    stressed: 0.9,
  };

  const recent = logs.slice(0, 7);
  const average = recent.reduce((total, item) => total + (scoreMap[item.emotion] ?? 0.42), 0) / recent.length;
  const burnoutRisk = Math.round(average * 100);
  const counts = recent.reduce((accumulator, item) => {
    accumulator[item.emotion] = (accumulator[item.emotion] || 0) + 1;
    return accumulator;
  }, {});
  const dominantEmotion =
    Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] || 'neutral';

  return {
    burnoutRisk,
    level: burnoutRisk >= 70 ? 'High' : burnoutRisk >= 45 ? 'Moderate' : 'Low',
    status:
      burnoutRisk >= 70
        ? 'Sustained strain detected'
        : burnoutRisk >= 45
          ? 'Recovery pacing recommended'
          : 'Healthy equilibrium',
    trend:
      recent[0]?.emotion === 'happy' || recent[0]?.emotion === 'calm'
        ? 'improving'
        : ['stressed', 'anxious', 'fatigued', 'sad'].includes(recent[0]?.emotion)
          ? 'rising'
          : 'steady',
    latestEmotion: recent[0]?.emotion || 'neutral',
    dominantEmotion: dominantEmotion || 'neutral',
  };
}

function getRecoveryActions(snapshot, latestEntry) {
  const latestEmotion = latestEntry?.emotion || snapshot.latestEmotion;

  if (snapshot.level === 'High') {
    return [
      {
        title: 'Reduce intensity',
        body: 'Shrink the next focus block to 25 minutes and remove one non-essential task from today.',
      },
      {
        title: 'Recover physically',
        body: 'Step away from the screen, hydrate, and let your breathing slow down before restarting.',
      },
      {
        title: 'Log context',
        body: 'Use the text mode to capture the trigger so repeated strain becomes easier to predict.',
      },
    ];
  }

  if (latestEmotion === 'happy' || latestEmotion === 'calm') {
    return [
      {
        title: 'Protect the routine',
        body: 'Save the pattern that helped today: timing, music, breaks, or environment.',
      },
      {
        title: 'Build consistency',
        body: 'Add one more check-in later today so the baseline stays grounded in real data.',
      },
      {
        title: 'Stay lightweight',
        body: 'Use the voice or combo mode for a quick pulse check rather than waiting for stress to build.',
      },
    ];
  }

  return [
    {
      title: 'Create a clear baseline',
      body: 'Two or three short check-ins across the day will make burnout trends more trustworthy.',
    },
    {
      title: 'Use multimodal mode',
      body: 'The combo flow gives the strongest signal because it blends voice, text intent, and facial cues.',
    },
    {
      title: 'End with a cooldown',
      body: 'Open the meditation flow after your last session to lower carryover stress into the evening.',
    },
  ];
}
