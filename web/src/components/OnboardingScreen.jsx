import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Sparkles, Volume2 } from 'lucide-react';
import { Button, Callout, Field, OptionCard } from './ui';
import WarmthSlider from './WarmthSlider';
import { aiConfig } from '../services/aiConfig';
import { ARCHETYPES, DEFAULT_ARCHETYPE_ID, DEFAULT_REGION_ID, REGIONS } from '../services/archetypes';
import { DEFAULT_PERSONA_ID, VOICE_PERSONAS } from '../services/kokoroEngine';
import { speechService } from '../services/speech';
import { DEFAULT_LANGUAGE_ID, DEFAULT_SLANG_LEVEL, LANGUAGES, VERNACULAR_SPEECH_NOTE, speechTargetFor } from '../services/vernacular';
import {
  COMFORT_SOUNDSCAPES,
  loadComfortProfile,
  saveComfortProfile,
  validateComfortTrackUrl,
} from '../services/comfortProfile';
import { ambianceEngine } from '../services/audioAmbiance';

const STEPS = [
  {
    id: 'archetype',
    eyebrow: 'Step 1 of 5',
    title: 'Which of these sounds most like you right now?',
    description:
      'This only changes how the companion talks to you — how much it reassures, and what it asks next. You can change it any time.',
  },
  {
    id: 'region',
    eyebrow: 'Step 2 of 5',
    title: 'Which English feels most natural to read and hear?',
    description: 'Grounding prompts will use everyday phrasing from that region rather than a translated version.',
  },
  {
    id: 'voice',
    eyebrow: 'Step 3 of 5',
    title: 'Pick the voice that feels easiest to listen to.',
    description:
      'Voices run on-device. The first reply downloads the model once, then everything stays local and offline.',
  },
  {
    id: 'language',
    eyebrow: 'Step 4 of 5',
    title: 'How should your companion talk — formal, or like home?',
    description:
      'Pick the language you think in, then slide towards however familiar you want it to sound. You can move this any time.',
  },
  {
    id: 'comfort',
    eyebrow: 'Step 5 of 5',
    title: 'What comforts you when a day goes badly?',
    description:
      'When MindGuard notices you are struggling, it will dim the room and bring these in quietly. All of it stays on this device.',
  },
];

function tierLabelKey(level) {
  if (level <= 33) return 'formal';
  if (level <= 66) return 'friendly';
  return 'home';
}

export default function OnboardingScreen({ userName, onComplete }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [archetypeId, setArchetypeId] = useState(() => aiConfig.getArchetype() || DEFAULT_ARCHETYPE_ID);
  const [regionId, setRegionId] = useState(() => aiConfig.getRegion() || DEFAULT_REGION_ID);
  const [personaId, setPersonaId] = useState(() => aiConfig.getVoicePersona() || DEFAULT_PERSONA_ID);
  const [previewingId, setPreviewingId] = useState(null);
  const [languageId, setLanguageId] = useState(() => aiConfig.getLanguage() || DEFAULT_LANGUAGE_ID);
  const [slangLevel, setSlangLevel] = useState(() => aiConfig.getSlangLevel() ?? DEFAULT_SLANG_LEVEL);
  const [comfort, setComfort] = useState(() => loadComfortProfile());
  const [trackError, setTrackError] = useState('');
  const [auditioningScape, setAuditioningScape] = useState(null);

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

  const finish = () => {
    speechService.stopSpeaking();
    ambianceEngine.stop();

    const check = validateComfortTrackUrl(comfort.comfortTrackUrl);
    // Never persist a URL the player cannot actually sound.
    const cleanComfort = { ...comfort, comfortTrackUrl: check.valid ? check.url : '' };

    saveComfortProfile(cleanComfort);
    aiConfig.completeOnboarding({ archetypeId, regionId, personaId, languageId, slangLevel });
    onComplete({ archetypeId, regionId, personaId, languageId, slangLevel, comfort: cleanComfort });
  };

  const handleNext = () => {
    if (stepIndex === STEPS.findIndex((step) => step.id === 'comfort')) {
      const check = validateComfortTrackUrl(comfort.comfortTrackUrl);
      if (!check.valid) {
        setTrackError(check.error);
        return;
      }
    }

    if (!isLastStep) {
      setStepIndex((index) => index + 1);
      return;
    }

    finish();
  };

  const handleSkip = finish;

  const auditionSoundscape = (id) => {
    setComfort((prev) => ({ ...prev, soundscape: id }));
    if (auditioningScape === id) {
      ambianceEngine.stop();
      setAuditioningScape(null);
      return;
    }
    ambianceEngine.playTrack(id);
    setAuditioningScape(id);
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
          {step.id === 'language' && (
            <>
              <div className="ui-option-grid ui-option-grid--two">
                {Object.values(LANGUAGES).map((language) => {
                  const target = speechTargetFor(language.id);
                  const speakable = target.neuralCapable || speechService.hasVoiceFor(target.locale);
                  return (
                    <OptionCard
                      key={language.id}
                      name="language"
                      value={language.id}
                      checked={languageId === language.id}
                      onChange={setLanguageId}
                      glyph={language.glyph}
                      label={language.label}
                      meta={speakable ? 'Can be spoken' : 'Text only on this device'}
                      description={language.phrases[tierLabelKey(slangLevel)].reassure[0]}
                    />
                  );
                })}
              </div>

              <WarmthSlider value={slangLevel} onChange={setSlangLevel} languageId={languageId} />

              <Callout tone="muted">{VERNACULAR_SPEECH_NOTE}</Callout>
            </>
          )}

          {step.id === 'comfort' && (
            <>
              <fieldset className="onboarding-fieldset">
                <legend>Your soundscape</legend>
                <div className="ui-option-grid ui-option-grid--two">
                  {COMFORT_SOUNDSCAPES.map((scape) => (
                    <OptionCard
                      key={scape.id}
                      name="soundscape"
                      value={scape.id}
                      checked={comfort.soundscape === scape.id}
                      onChange={(value) => setComfort((prev) => ({ ...prev, soundscape: value }))}
                      glyph={scape.glyph}
                      label={scape.label}
                      description={scape.blurb}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={auditioningScape === scape.id ? Check : Volume2}
                        className="onboarding-preview"
                        onClick={(event) => {
                          event.preventDefault();
                          auditionSoundscape(scape.id);
                        }}
                      >
                        {auditioningScape === scape.id ? 'Stop' : 'Listen'}
                      </Button>
                    </OptionCard>
                  ))}
                </div>
              </fieldset>

              <Field
                label="Your comfort song (optional)"
                placeholder="https://example.com/my-song.mp3"
                hint="Must be a direct audio file link (.mp3, .m4a, .ogg, .wav). Streaming page links cannot be played in a browser."
                error={trackError}
                value={comfort.comfortTrackUrl}
                onChange={(event) => {
                  setTrackError('');
                  setComfort((prev) => ({ ...prev, comfortTrackUrl: event.target.value }));
                }}
              />

              <Field
                label="Someone who steadies you (optional)"
                placeholder="Amma, my brother, my dog Rocky..."
                value={comfort.anchorPerson}
                onChange={(event) => setComfort((prev) => ({ ...prev, anchorPerson: event.target.value }))}
              />

              <Field
                label="A memory you return to (optional)"
                as="textarea"
                rows={3}
                placeholder="on the terrace after the rain stopped..."
                hint="Finish the sentence: “that time ___”. MindGuard will offer it back to you gently, never analyse it."
                value={comfort.anchorMemory}
                onChange={(event) => setComfort((prev) => ({ ...prev, anchorMemory: event.target.value }))}
              />

              <Callout tone="muted">
                Your comfort profile is saved only in this browser. It is never uploaded, and it is not
                part of your account.
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
