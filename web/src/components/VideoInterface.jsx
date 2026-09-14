// web/src/components/VideoInterface.jsx
import React, { useRef, useState, useEffect } from 'react';
import { Video, VideoOff, Camera, HeartPulse, ShieldCheck } from 'lucide-react';
import { apiClient } from '../services/api';
import { faceAnalyzer } from '../services/faceEmotionDetector';

export default function VideoInterface({ isCamOn, onToggleCam, onMoodLogged, userId = null }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [facialState, setFacialState] = useState({
    emotion: 'calm',
    tension: 18,
    fatigue: 24,
    valence: 82,
    confidence: 0.94,
  });
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (isCamOn) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isCamOn]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsScanning(true);
    } catch (error) {
      console.warn('Camera access denied or unavailable:', error);
      setIsScanning(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsScanning(false);
  };

  useEffect(() => {
    if (!isCamOn) return undefined;

    const interval = setInterval(() => {
      const reading = faceAnalyzer.analyzeVideoFrame(videoRef.current);
      if (!reading) return;

      // Smooth across readings so a single noisy frame does not make the
      // on-screen meters jump.
      setFacialState((prev) => ({
        emotion: reading.emotion,
        confidence: reading.confidence,
        tension: prev.tension * 0.6 + reading.tension * 0.4,
        fatigue: prev.fatigue * 0.6 + reading.fatigue * 0.4,
        valence: prev.valence * 0.6 + reading.valence * 0.4,
      }));
    }, 1500);

    return () => clearInterval(interval);
  }, [isCamOn]);

  const handleCaptureSnapshot = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64Data = canvas.toDataURL('image/jpeg').split(',')[1];
    // Prefer a live reading over the smoothed display state at capture time.
    const reading = faceAnalyzer.analyzeVideoFrame(video) || facialState;

    try {
      const response = await apiClient.sendVideoInteraction(userId, base64Data, {
        emotion: reading.emotion,
        tension: Math.round(reading.tension),
        fatigue: Math.round(reading.fatigue),
        valence: Math.round(reading.valence),
        confidence: Number(reading.confidence.toFixed(2)),
      });
      if (onMoodLogged) onMoodLogged(response.moodLog);
    } catch (error) {
      console.warn('Video interaction err:', error);
    }
  };

  const stats = [
    {
      label: 'Facial tension',
      value: Math.round(facialState.tension),
      hint: facialState.tension < 35 ? 'Low strain' : facialState.tension < 60 ? 'Watch pacing' : 'Higher strain',
    },
    {
      label: 'Eye fatigue',
      value: Math.round(facialState.fatigue),
      hint: facialState.fatigue < 35 ? 'Fresh' : facialState.fatigue < 60 ? 'Moderate load' : 'Take a screen break',
    },
    {
      label: 'Positive valence',
      value: Math.round(facialState.valence),
      hint: facialState.valence > 70 ? 'Steady tone' : facialState.valence > 45 ? 'Mixed signal' : 'Lower energy',
    },
  ];

  return (
    <div className="video-shell">
      <div className="experience-panel">
        <div className="experience-panel__header">
          <div>
            <span className="eyebrow">Video Check-In</span>
            <h3>Use camera only when it helps.</h3>
            <p>Video mode is optional. It can add extra context, but text and voice still work well on their own.</p>
          </div>

          <div className="experience-panel__status-row">
            <div className={`badge-emotion ${facialState.emotion}`}>
              <HeartPulse size={12} />
              <span>{formatLabel(facialState.emotion)} {Math.round(facialState.confidence * 100)}%</span>
            </div>
            <div className="experience-panel__status">
              <ShieldCheck size={14} />
              <span>{isScanning ? 'Private scan live' : 'Camera paused'}</span>
            </div>
          </div>
        </div>

        <div className="video-shell__stage glass-panel">
          {isCamOn ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="video-shell__media"
            />
          ) : (
            <div className="video-shell__empty">
              <div className="video-shell__empty-icon">
                <VideoOff size={30} />
              </div>
              <h4>Camera is off</h4>
              <p>Turn it on only if you want an extra facial check-in. You can always stay with text or voice instead.</p>
              <button type="button" onClick={onToggleCam} className="btn-primary">
                <Video size={16} />
                Turn camera on
              </button>
            </div>
          )}

          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {isCamOn && (
          <>
            <div className="video-shell__stats">
              {stats.map((stat) => (
                <div key={stat.label} className="video-stat glass-card">
                  <div className="video-stat__header">
                    <span>{stat.label}</span>
                    <strong>{stat.value}%</strong>
                  </div>
                  <div className="video-stat__bar">
                    <div className="video-stat__bar-fill" style={{ width: `${stat.value}%` }} />
                  </div>
                  <p>{stat.hint}</p>
                </div>
              ))}
            </div>

            <div className="video-shell__actions">
              <button type="button" onClick={handleCaptureSnapshot} className="btn-primary">
                <Camera size={16} />
                Capture snapshot
              </button>
              <button type="button" onClick={onToggleCam} className="btn-ghost">
                <VideoOff size={15} />
                Turn camera off
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatLabel(value) {
  return (value || 'neutral')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
