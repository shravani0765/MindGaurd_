import React, { useEffect, useState } from 'react';
import { Check, Cpu, Download, Volume2, X, Zap } from 'lucide-react';
import { Badge, Button, Callout, OptionCard, StatusBanner } from './ui';
import WarmthSlider from './WarmthSlider';
import PrivacyPanel from './PrivacyPanel';
import AiBrainPanel from './AiBrainPanel';
import ComfortProfilePanel from './ComfortProfilePanel';
import CrisisResources from './CrisisResources';
import { crisisRegionFor } from '../services/crisisResources';
import { aiConfig } from '../services/aiConfig';
import { ARCHETYPES, REGIONS } from '../services/archetypes';
import { VOICE_PERSONAS, kokoroEngine } from '../services/kokoroEngine';
import { speechService } from '../services/speech';
import { LANGUAGES, VERNACULAR_SPEECH_NOTE, speechTargetFor } from '../services/vernacular';

const ENGINE_OPTIONS = [
  {
    id: 'neural',
    glyph: '🧠',
    label: 'Kokoro neural (on-device)',
    meta: '82M ONNX',
    description:
      'Runs the model locally with WebGPU, falling back to WebAssembly. Nothing is sent to a server and there is no per-word cost.',
  },
  {
    id: 'browser',
    glyph: '⚡',
    label: 'Device voice',
    meta: 'Instant',
    description:
      'Uses the voice built into your operating system. No download, available immediately, less natural.',
  },
];

export default function VoiceStudioModal({ isOpen, onClose, onAccountDeleted }) {
  const [engine, setEngine] = useState(() => aiConfig.getTtsEngine());
  const [personaId, setPersonaId] = useState(() => aiConfig.getVoicePersona());
  const [archetypeId, setArchetypeId] = useState(() => aiConfig.getArchetype());
  const [regionId, setRegionId] = useState(() => aiConfig.getRegion());
  const [engineState, setEngineState] = useState(() => kokoroEngine.getState());
  const [previewingId, setPreviewingId] = useState(null);
  const [languageId, setLanguageId] = useState(() => aiConfig.getLanguage());
  const [slangLevel, setSlangLevel] = useState(() => aiConfig.getSlangLevel());

  useEffect(() => kokoroEngine.subscribe(setEngineState), []);

  // Re-read persisted values whenever the panel is reopened, so it never shows
  // stale selections after an onboarding change.
  useEffect(() => {
    if (!isOpen) return;
    setEngine(aiConfig.getTtsEngine());
    setPersonaId(aiConfig.getVoicePersona());
    setArchetypeId(aiConfig.getArchetype());
    setRegionId(aiConfig.getRegion());
    setLanguageId(aiConfig.getLanguage());
    setSlangLevel(aiConfig.getSlangLevel());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const applyEngine = (value) => {
    setEngine(value);
    aiConfig.setTtsEngine(value);
    if (value === 'neural') void kokoroEngine.preload();
  };

  const applyPersona = (value) => {
    setPersonaId(value);
    aiConfig.setVoicePersona(value);
  };

  const applyArchetype = (value) => {
    setArchetypeId(value);
    aiConfig.setArchetype(value);
  };

  const applyRegion = (value) => {
    setRegionId(value);
    aiConfig.setRegion(value);
  };

  const applyLanguage = (value) => {
    setLanguageId(value);
    aiConfig.setLanguage(value);
  };

  const applySlangLevel = (value) => {
    setSlangLevel(value);
    aiConfig.setSlangLevel(value);
  };

  const preview = (id) => {
    applyPersona(id);
    setPreviewingId(id);
    speechService.speak(
      `This is ${VOICE_PERSONAS[id].label}. ${REGIONS[regionId].affirmations[0]} Let's take one slow breath together.`,
      () => setPreviewingId(null),
      { personaId: id, emotion: 'calm', languageId }
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-panel voice-studio"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-studio-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="voice-studio__header">
          <div>
            <span className="ui-panel__eyebrow">Companion voice</span>
            <h2 id="voice-studio-title">Voice &amp; tone studio</h2>
            <p>Tune how MindGuard sounds and how directly it speaks to you.</p>
          </div>
          <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Close voice studio">
            Close
          </Button>
        </header>

        <div className="voice-studio__body">
          <AiBrainPanel />

          <section className="voice-studio__section">
            <h3>Audio engine</h3>
            <EngineStatus state={engineState} engine={engine} />
            <div className="ui-option-grid ui-option-grid--two">
              {ENGINE_OPTIONS.map((option) => (
                <OptionCard
                  key={option.id}
                  name="engine"
                  value={option.id}
                  checked={engine === option.id}
                  onChange={applyEngine}
                  glyph={option.glyph}
                  label={option.label}
                  meta={option.meta}
                  description={option.description}
                />
              ))}
            </div>
          </section>

          <section className="voice-studio__section">
            <h3>Character voice</h3>
            <div className="ui-option-grid ui-option-grid--two">
              {Object.values(VOICE_PERSONAS).map((persona) => (
                <OptionCard
                  key={persona.id}
                  name="persona"
                  value={persona.id}
                  checked={personaId === persona.id}
                  onChange={applyPersona}
                  glyph={persona.glyph}
                  label={persona.label}
                  meta={persona.neuralAvailable ? 'Neural' : 'Device voice'}
                  description={persona.blurb}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={previewingId === persona.id ? Check : Volume2}
                    className="onboarding-preview"
                    onClick={(event) => {
                      event.preventDefault();
                      preview(persona.id);
                    }}
                  >
                    {previewingId === persona.id ? 'Playing' : 'Preview'}
                  </Button>
                </OptionCard>
              ))}
            </div>
          </section>

          <section className="voice-studio__section">
            <h3>Language &amp; warmth</h3>
            <div className="ui-option-grid ui-option-grid--two">
              {Object.values(LANGUAGES).map((language) => {
                const target = speechTargetFor(language.id);
                const speakable = target.neuralCapable || speechService.hasVoiceFor(target.locale);
                return (
                  <OptionCard
                    key={language.id}
                    name="language-studio"
                    value={language.id}
                    checked={languageId === language.id}
                    onChange={applyLanguage}
                    glyph={language.glyph}
                    label={language.label}
                    meta={speakable ? 'Can be spoken' : 'Text only on this device'}
                  />
                );
              })}
            </div>

            <WarmthSlider value={slangLevel} onChange={applySlangLevel} languageId={languageId} />
            <Callout tone="muted">{VERNACULAR_SPEECH_NOTE}</Callout>
          </section>

          <section className="voice-studio__section">
            <h3>How it should talk to you</h3>
            <div className="ui-option-grid">
              {Object.values(ARCHETYPES).map((archetype) => (
                <OptionCard
                  key={archetype.id}
                  name="archetype-studio"
                  value={archetype.id}
                  checked={archetypeId === archetype.id}
                  onChange={applyArchetype}
                  glyph={archetype.glyph}
                  label={archetype.label}
                  description={archetype.summary}
                />
              ))}
            </div>
          </section>

          <section className="voice-studio__section">
            <h3>Regional phrasing</h3>
            <div className="ui-option-grid ui-option-grid--two">
              {Object.values(REGIONS).map((region) => (
                <OptionCard
                  key={region.id}
                  name="region-studio"
                  value={region.id}
                  checked={regionId === region.id}
                  onChange={applyRegion}
                  glyph={region.glyph}
                  label={region.label}
                  description={region.grounding}
                />
              ))}
            </div>
          </section>

          <ComfortProfilePanel />

          <PrivacyPanel onAccountDeleted={onAccountDeleted} />

          <section className="voice-studio__section">
            <h3>Crisis support</h3>
            <CrisisResources regionId={crisisRegionFor(languageId)} compact />
          </section>

          <Callout tone="muted">
            Tone, language, and warmth change the wording of everyday replies only. Crisis guidance is
            never re-paced, translated, or made casual — it is delivered identically for everyone.
          </Callout>
        </div>
      </div>
    </div>
  );
}

function EngineStatus({ state, engine }) {
  if (engine !== 'neural') {
    return (
      <StatusBanner tone="info">
        Using your device&apos;s built-in voice. Switch to Kokoro for a noticeably warmer delivery.
      </StatusBanner>
    );
  }

  if (state.status === 'loading') {
    return (
      <StatusBanner tone="info">
        <span className="voice-studio__status-row">
          <Download size={14} aria-hidden="true" />
          Downloading neural weights… {state.progress}%
        </span>
      </StatusBanner>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <StatusBanner tone="error">
        Neural voice unavailable on this device{state.error ? ` (${state.error})` : ''}. Replies will
        use your device voice instead.
      </StatusBanner>
    );
  }

  if (state.status === 'ready') {
    return (
      <div className="voice-studio__status-row">
        <Badge tone="positive" icon={state.device === 'webgpu' ? Zap : Cpu}>
          Ready · {state.device === 'webgpu' ? 'WebGPU accelerated' : 'WebAssembly'}
        </Badge>
        <span className="voice-studio__status-note">Model cached locally — nothing leaves this device.</span>
      </div>
    );
  }

  return (
    <StatusBanner tone="info">
      The neural model loads the first time you play a reply, then stays cached.
    </StatusBanner>
  );
}
