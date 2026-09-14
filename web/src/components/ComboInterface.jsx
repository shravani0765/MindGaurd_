// web/src/components/ComboInterface.jsx
import React, { useRef, useState, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  HeartPulse,
  ShieldCheck,
  Radio,
  Sparkles,
  Smile,
  Wind,
} from 'lucide-react';
import { speechService } from '../services/speech';
import { apiClient } from '../services/api';
import { ANALYSIS_INTERVAL_MS, faceAnalyzer } from '../services/faceEmotionDetector';
import { aiReasoningEngine } from '../services/aiReasoning';
import { ambianceEngine } from '../services/audioAmbiance';

export default function ComboInterface({
  isMicOn,
  onToggleMic,
  isCamOn,
  onToggleCam,
  showTranscript: _showTranscript,
  onMoodLogged,
  onOpenMeditation,
  userId = null,
}) {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);

  // Assistant states
  const [orbState, setOrbState] = useState('idle'); // 'idle' | 'listening' | 'thinking' | 'speaking'
  const [transcript, setTranscript] = useState('');
  const [lastAIResponse, setLastAIResponse] = useState(
    "Hello! I am actively tracking your facial expressions and listening to your voice. How are you genuinely feeling in this moment?"
  );
  const [somaticAdvice, setSomaticAdvice] = useState('');

  // Real-time Bio-telemetry from Computer Vision Face Analyzer
  const [telemetry, setTelemetry] = useState({
    emotion: 'calm',
    confidence: 0.94,
    tension: 18,
    fatigue: 22,
    valence: 85,
  });

  // 1. Camera lifecycle and throttled vision sampling.
  useEffect(() => {
    let intervalId = null;
    let cancelled = false;

    const sampleFrame = () => {
      const result = faceAnalyzer.analyzeVideoFrame(videoRef.current);
      if (!result) return;

      setTelemetry((prev) => ({
        ...prev,
        emotion: result.emotion,
        // Smooth the continuous measures so one noisy frame cannot spike the
        // meters, while letting the discrete label switch immediately.
        tension: prev.tension * 0.6 + result.tension * 0.4,
        fatigue: prev.fatigue * 0.6 + result.fatigue * 0.4,
        valence: prev.valence * 0.6 + result.valence * 0.4,
        confidence: result.confidence,
      }));
    };

    if (isCamOn) {
      startCamera().then(() => {
        if (cancelled) return;
        intervalId = setInterval(sampleFrame, ANALYSIS_INTERVAL_MS);
      });
    } else {
      stopCamera();
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      stopCamera();
    };
  }, [isCamOn]);

  // 2. Voice Recognition Lifecycle
  useEffect(() => {
    if (isMicOn) {
      startVoiceSession();
    } else {
      speechService.stopListening();
      speechService.stopSpeaking();
      setOrbState('idle');
    }
    return () => {
      speechService.stopListening();
      speechService.stopSpeaking();
    };
  }, [isMicOn]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn('Camera stream error:', err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const startVoiceSession = () => {
    setOrbState('listening');
    speechService.startListening(
      async (result) => {
        setTranscript(result.text);

        // When user pauses speaking
        if (result.final && result.final.trim().length > 2) {
          handleMultimodalInput(result.final);
        }
      },
      (err) => {
        console.warn('Speech error:', err);
        setOrbState('idle');
      },
      (isListening) => {
        if (!isListening && orbState === 'listening') {
          setOrbState('idle');
        }
      }
    );
  };

  const handleMultimodalInput = async (spokenText) => {
    setOrbState('thinking');
    speechService.stopListening();

    try {
      const textResponse = await apiClient.sendTextInteraction(userId, spokenText);
      const backendEmotion = textResponse.moodLog?.emotion || telemetry.emotion;

      // Use the authenticated backend result as the primary emotional baseline,
      // then layer facial telemetry on top for a gentler combo-mode response.
      const aiResult = await aiReasoningEngine.synthesizeAndRespond(
        spokenText,
        telemetry,
        backendEmotion
      );
      if (onMoodLogged) onMoodLogged(textResponse.moodLog);

      // 2. Update UI states with a multimodal response
      setLastAIResponse(aiResult.response);
      setSomaticAdvice(aiResult.somaticAdvice);

      // 3. If high stress or burnout is detected, auto-trigger restorative rain/music
      if (aiResult.fusedEmotion === 'stressed' || telemetry.tension > 60) {
        ambianceEngine.triggerBurnoutIntervention();
      }

      // 4. Speak reply with warm voice
      setOrbState('speaking');
      speechService.speak(
        aiResult.response,
        () => {
          if (isMicOn) {
            setOrbState('listening');
            startVoiceSession();
          } else {
            setOrbState('idle');
          }
        },
        { emotion: aiResult.fusedEmotion, urgency: aiResult.urgency, languageId: aiResult.languageId }
      );
    } catch (err) {
      console.error('Multimodal processing error:', err);
      setOrbState('idle');
    }
  };

  const handlePromptClick = (text) => {
    setTranscript(text);
    handleMultimodalInput(text);
  };

  return (
    <div className="combo-shell">
      <div className="combo-stage glass-panel">
        <div className="combo-stage__toolbar">
          <div className="combo-stage__chips">
            <div className={`badge-emotion ${telemetry.emotion}`}>
              <HeartPulse size={14} />
              <span>
                {telemetry.emotion} ({Math.round(telemetry.confidence * 100)}%)
              </span>
            </div>

            {isCamOn && (
              <div className="combo-stage__metric">
                <Smile size={12} />
                <span>Facial tension {Math.round(telemetry.tension)}%</span>
              </div>
            )}
          </div>

          <div className="combo-stage__chips">
            <div className="combo-stage__metric">
              <Radio size={12} />
              <span>
                {orbState === 'speaking' ? 'Speaking' : orbState === 'thinking' ? 'Reflecting' : isMicOn ? 'Listening' : 'Mic paused'}
              </span>
            </div>
            <div className="combo-stage__metric combo-stage__metric--soft">
              <ShieldCheck size={13} />
              <span>Private session</span>
            </div>
          </div>
        </div>

        <div className="combo-stage__media">
        {isCamOn ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="combo-stage__video"
          />
        ) : (
          <div className="combo-stage__empty">
            <div className="combo-stage__empty-content">
              <VideoOff size={42} color="var(--text-muted)" />
              <p>Camera is off. You can still use voice and text without video.</p>
            </div>
          </div>
        )}
        </div>
      </div>

      <div className="combo-response-grid">
        <div className="combo-card">
          <span className="combo-card__label">Live transcript</span>
          <p>{transcript ? `"${transcript}"` : 'Your latest voice input will appear here.'}</p>
        </div>

        <div className="combo-card combo-card--primary">
          <span className="combo-card__label">MindGuard response</span>
          <p>{lastAIResponse}</p>

          {somaticAdvice && (
            <div className="combo-card__note">
              <Wind size={13} />
              <span>{somaticAdvice}</span>
            </div>
          )}
        </div>
      </div>

      <div className="combo-toolbar">
        <div className="combo-toolbar__actions">
          <button
            onClick={onToggleMic}
            className={`btn-ghost ${isMicOn ? 'active' : ''}`}
          >
            {isMicOn ? <MicOff size={15} /> : <Mic size={15} />}
            <span>{isMicOn ? 'Pause mic' : 'Start mic'}</span>
          </button>

          <button
            onClick={onToggleCam}
            className={`btn-ghost ${isCamOn ? 'active' : ''}`}
          >
            {isCamOn ? <VideoOff size={15} /> : <Video size={15} />}
            <span>{isCamOn ? 'Turn camera off' : 'Turn camera on'}</span>
          </button>

          <button
            onClick={onOpenMeditation}
            className="btn-ghost"
          >
            <Sparkles size={14} color="var(--sage-green)" />
            <span>Start meditation</span>
          </button>
        </div>
      </div>

      <div className="chip-cloud">
        {[
          'My boss is pushing unrealistic deadlines',
          'I am exhausted and need a 2-minute reset',
          'Play Sadhguru 136.1Hz Om meditation',
          'Help me process my stress and unclench my jaw',
        ].map((prompt, i) => (
          <button
            key={i}
            onClick={() => handlePromptClick(prompt)}
            className="btn-ghost chip-cloud__button"
          >
            <Sparkles size={12} color="var(--calm-blue)" />
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
