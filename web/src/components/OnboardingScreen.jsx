import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Sparkles, Volume2 } from 'lucide-react';
import { Button, Callout, OptionCard } from './ui';
import { aiConfig } from '../services/aiConfig';
import { ARCHETYPES, DEFAULT_ARCHETYPE_ID, DEFAULT_REGION_ID, REGIONS } from '../services/archetypes';
import { DEFAULT_PERSONA_ID, VOICE_PERSONAS } from '../services/kokoroEngine';
import { speechService } from '../services/speech';

const STEPS = [
  {
    id: 'archetype',
    eyebrow: 'Step 1 of 3',
    title: 'Which of these sounds most like you right now?',
    description:
      'This only changes how the companion talks to you — how much it reassures, and what it asks next. You can change it any time.',
  },
  {
    id: 'region',
    eyebrow: 'Step 2 of 3',
    title: 'Which English feels most natural to read and hear?',
    description: 'Grounding prompts will use everyday phrasing from that region rather than a translated version.',
  },
  {
    id: 'voice',
    eyebrow: 'Step 3 of 3',
    title: 'Pick the voice that feels easiest to listen to.',
    description:
      'Voices run on-device. The first reply downloads the model once, then everything stays local and offline.',
  },
];

export default function OnboardingScreen({ userName, onComplete }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [archetypeId, setArchetypeId] = useState(() => aiConfig.getArchetype() || DEFAULT_ARCHETYPE_ID);
  const [regionId, setRegionId] = useState(() => aiConfig.getRegion() || DEFAULT_REGION_ID);
  const [personaId, setPersonaId] = useState(() => aiConfig.getVoicePersona() || DEFAULT_PERSONA_ID);
  const [previewingId, setPreviewingId] = useState(null);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  const personas = useMemo(() => Object.values(VOICE_PERSONAS), []);

  const previewVoice = (id) => {
    setPersonaId(id);
    setPreviewingId(id);
    const persona = VOICE_PERSONAS[id];
    speechService.speak(
      `Hello ${userName || 'there'}. ${persona.blurb} Whenever you are ready, we can start with one slow breath.`,
      () => setPreviewingId(null),
      { personaId: id, emotion: 'calm' }
    );
  };

  const handleNext = () => {
    if (!isLastStep) {
      setStepIndex((index) => index + 1);
      return;
    }

    speechService.stopSpeaking();
    aiConfig.completeOnboarding({ archetypeId, regionId, personaId });
    onComplete({ archetypeId, regionId, personaId });
  };

  const handleSkip = () => {
    speechService.stopSpeaking();
    aiConfig.completeOnboarding({ archetypeId, regionId, personaId });
    onComplete({ archetypeId, regionId, personaId });
  };

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">
        <div className="onboarding-card__header">
          <span className="onboarding-card__eyebrow">
            <Sparkles size={13} aria-hidden="true" />
            {step.eyebrow}
          </span>
          <h1>{step.title}</h1>
          <p>{step.description}</p>

          <div className="onboarding-progress" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
            {STEPS.map((item, index) => (
              <span key={item.id} className={index <= stepIndex ? 'is-filled' : ''} />
            ))}
          </div>
        </div>

        <div className="onboarding-card__body">
          {step.id === 'archetype' && (
            <div className="ui-option-grid">
              {Object.values(ARCHETYPES).map((archetype) => (
                <OptionCard
                  key={archetype.id}
                  name="archetype"
                  value={archetype.id}
                  checked={archetypeId === archetype.id}
                  onChange={setArchetypeId}
                  glyph={archetype.glyph}
                  label={archetype.label}
                  description={archetype.summary}
                />
              ))}
            </div>
          )}

          {step.id === 'region' && (
            <div className="ui-option-grid ui-option-grid--two">
              {Object.values(REGIONS).map((region) => (
                <OptionCard
                  key={region.id}
                  name="region"
                  value={region.id}
                  checked={regionId === region.id}
                  onChange={setRegionId}
                  glyph={region.glyph}
                  label={region.label}
                  description={region.grounding}
                />
              ))}
            </div>
          )}

          {step.id === 'voice' && (
            <>
              <div className="ui-option-grid ui-option-grid--two">
                {personas.map((persona) => (
                  <OptionCard
                    key={persona.id}
                    name="voice"
                    value={persona.id}
                    checked={personaId === persona.id}
                    onChange={setPersonaId}
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
                        previewVoice(persona.id);
                      }}
                    >
                      {previewingId === persona.id ? 'Playing' : 'Preview'}
                    </Button>
                  </OptionCard>
                ))}
              </div>

              <Callout tone="muted">
                The neural voices download roughly 90&nbsp;MB the first time you use them, then run
                fully offline. If your browser cannot run them, MindGuard falls back to your
                device&apos;s own voice without interrupting the reply.
              </Callout>
            </>
          )}
        </div>

        <div className="onboarding-card__footer">
          <Button
            variant="ghost"
            icon={ArrowLeft}
            onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
            disabled={stepIndex === 0}
          >
            Back
          </Button>

          <div className="onboarding-card__footer-right">
            <Button variant="link" onClick={handleSkip}>
              Skip for now
            </Button>
            <Button icon={isLastStep ? Check : ArrowRight} onClick={handleNext}>
              {isLastStep ? 'Enter MindGuard' : 'Continue'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
