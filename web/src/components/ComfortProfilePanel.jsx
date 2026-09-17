import React, { useEffect, useState } from 'react';
import { Check, Heart, Volume2 } from 'lucide-react';
import { Button, Callout, Field, OptionCard, StatusBanner } from './ui';
import {
  COMFORT_SOUNDSCAPES,
  loadComfortProfile,
  saveComfortProfile,
  validateComfortTrackUrl,
} from '../services/comfortProfile';
import { ambianceEngine } from '../services/audioAmbiance';
import { aiConfig } from '../services/aiConfig';

/**
 * Edits the comfort profile after onboarding.
 *
 * These answers were previously collected once and then unreachable, so a user
 * who picked the wrong soundscape — or whose comfort song changed — had no way
 * to correct it short of clearing browser storage.
 */
export default function ComfortProfilePanel() {
  const [profile, setProfile] = useState(loadComfortProfile);
  const [auditioning, setAuditioning] = useState(null);
  const [status, setStatus] = useState(null);
  const [trackError, setTrackError] = useState('');
  const [preferredName, setPreferredName] = useState(() => aiConfig.getPreferredName());

  // Never leave an audition playing when the panel closes.
  useEffect(() => () => ambianceEngine.stop(), []);

  const update = (patch) => {
    setProfile((prev) => ({ ...prev, ...patch }));
    setStatus(null);
  };

  const audition = (id) => {
    update({ soundscape: id });
    if (auditioning === id) {
      ambianceEngine.stop();
      setAuditioning(null);
      return;
    }
    ambianceEngine.playTrack(id);
    setAuditioning(id);
  };

  const handleSave = () => {
    const check = validateComfortTrackUrl(profile.comfortTrackUrl);
    if (!check.valid) {
      setTrackError(check.error);
      return;
    }
    setTrackError('');
    const clean = { ...profile, comfortTrackUrl: check.url };
    saveComfortProfile(clean);
    aiConfig.setPreferredName(preferredName);
    setProfile(clean);
    setStatus({ tone: 'success', text: 'Saved. MindGuard will use these the next time it notices strain.' });
  };

  return (
    <section className="voice-studio__section">
      <h3>Name &amp; comfort profile</h3>

      {status && <StatusBanner tone={status.tone}>{status.text}</StatusBanner>}

      <Callout tone="muted" icon={Heart}>
        These play automatically when MindGuard detects strain. Everything here stays in this
        browser and is never uploaded.
      </Callout>

      <Field
        label="What MindGuard calls you"
        placeholder="A nickname is fine"
        maxLength={40}
        hint="Does not have to be your real name. Saved only in this browser, not on your account."
        value={preferredName}
        onChange={(event) => {
          setPreferredName(event.target.value);
          setStatus(null);
        }}
      />

      <fieldset className="onboarding-fieldset">
        <legend>Soundscape</legend>
        <div className="ui-option-grid ui-option-grid--two">
          {COMFORT_SOUNDSCAPES.map((scape) => (
            <OptionCard
              key={scape.id}
              name="comfort-soundscape"
              value={scape.id}
              checked={profile.soundscape === scape.id}
              onChange={(value) => update({ soundscape: value })}
              glyph={scape.glyph}
              label={scape.label}
              description={scape.blurb}
            >
              <Button
                variant="ghost"
                size="sm"
                icon={auditioning === scape.id ? Check : Volume2}
                className="onboarding-preview"
                onClick={(event) => {
                  event.preventDefault();
                  audition(scape.id);
                }}
              >
                {auditioning === scape.id ? 'Stop' : 'Listen'}
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
        value={profile.comfortTrackUrl}
        onChange={(event) => {
          setTrackError('');
          update({ comfortTrackUrl: event.target.value });
        }}
      />

      <Field
        label="Someone who steadies you (optional)"
        placeholder="Amma, my brother, my dog Rocky..."
        value={profile.anchorPerson}
        onChange={(event) => update({ anchorPerson: event.target.value })}
      />

      <Field
        label="A memory you return to (optional)"
        as="textarea"
        rows={3}
        placeholder="on the terrace after the rain stopped..."
        hint="Finish the sentence: “that time ___”."
        value={profile.anchorMemory}
        onChange={(event) => update({ anchorMemory: event.target.value })}
      />

      <div className="privacy-actions">
        <Button onClick={handleSave}>Save preferences</Button>
      </div>
    </section>
  );
}
