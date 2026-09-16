import React, { useState } from 'react';
import { BrainCircuit, CheckCircle2, ExternalLink, Stethoscope, XCircle } from 'lucide-react';
import { Badge, Button, Callout, Field, StatusBanner } from './ui';
import { aiConfig } from '../services/aiConfig';
import { resetConversation, testGeminiConnection } from '../services/geminiClient';
import { apiClient } from '../services/api';

// Kept short on purpose: these are the Gemini models that make sense for a
// short, conversational, low-latency reply.
// Server reasons translated into something actionable.
const EXPLAIN = {
  'not-configured': 'The server has NO Gemini key. Add GEMINI_API_KEY in Render -> Environment, or paste a key below to use one just on this device.',
  'crisis-path': 'Safety path active — the model is intentionally bypassed for crisis messages.',
  'http-400': 'Google rejected the request. The server key is probably malformed.',
  'http-403': 'Google refused the server key. It may be restricted or revoked.',
  'http-429': 'Quota exceeded on the server key. Wait, or use a different key.',
  'http-404': 'That model name is not available for the server key.',
  blocked: "Gemini's safety filter blocked this prompt.",
  'request-failed': 'The server could not reach Google. Network or timeout.',
};

const MODEL_OPTIONS = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — fast, recommended' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — newer, slightly slower' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash — older fallback' },
];

/**
 * Where the Gemini key is entered. The key is held in localStorage on this
 * device only and is never sent to the MindGuard backend — the browser calls
 * Google directly.
 */
export default function AiBrainPanel() {
  const [key, setKey] = useState(() => aiConfig.getGeminiKey());
  const [model, setModel] = useState(() => aiConfig.getModel());
  const [result, setResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [serverCheck, setServerCheck] = useState(null);
  const [isCheckingServer, setIsCheckingServer] = useState(false);

  const isConfigured = Boolean(aiConfig.getGeminiKey());

  const handleSave = async () => {
    setIsTesting(true);
    setResult(null);

    aiConfig.setModel(model);
    const check = await testGeminiConnection(key, model);

    if (check.success) {
      aiConfig.setGeminiKey(key);
      // Old template replies in the buffer would confuse the new model.
      resetConversation();
    }
    setResult(check);
    setIsTesting(false);
  };

  /**
   * Asks the server what it would actually do with a reply request. Surfaces
   * the raw reason so a misconfiguration is self-diagnosable instead of
   * looking like bad model output.
   */
  const handleServerCheck = async () => {
    setIsCheckingServer(true);
    setServerCheck(null);
    try {
      const result = await apiClient.generateCompanionReply({
        text: 'This is a configuration check.',
        analysis: { emotion: 'neutral' },
      });

      if (result?.source === 'gemini') {
        setServerCheck({ tone: 'success', text: `Server is generating replies with ${result.model}.` });
      } else {
        setServerCheck({ tone: 'error', text: EXPLAIN[result?.reason] || `Server replied: ${result?.reason || 'unknown'}` });
      }
    } catch (error) {
      setServerCheck({ tone: 'error', text: `Could not reach the server: ${error.message}` });
    } finally {
      setIsCheckingServer(false);
    }
  };

  const handleClear = () => {
    aiConfig.setGeminiKey('');
    setKey('');
    resetConversation();
    setResult({ success: true, message: 'Key removed. Replies now use the built-in offline responses.' });
  };

  return (
    <section className="voice-studio__section">
      <h3>
        Conversation brain
        {isConfigured ? (
          <Badge tone="positive" icon={CheckCircle2}>Gemini active</Badge>
        ) : (
          <Badge tone="caution" icon={XCircle}>Offline replies</Badge>
        )}
      </h3>

      <Callout tone="muted" icon={BrainCircuit} title="Why this makes a difference">
        <p>
          Without a key, replies come from a fixed set of written responses — the same words every
          time, which is why the companion can feel like it is not really listening.
        </p>
        <p>
          With a key, each reply is generated for what you actually said, in your chosen language
          and warmth level.
        </p>
      </Callout>

      {result && (
        <StatusBanner tone={result.success ? 'success' : 'error'}>{result.message}</StatusBanner>
      )}

      <div className="privacy-actions">
        <Button
          variant="ghost"
          icon={Stethoscope}
          onClick={handleServerCheck}
          isLoading={isCheckingServer}
          loadingLabel="Checking..."
        >
          Check server setup
        </Button>
      </div>

      {serverCheck && <StatusBanner tone={serverCheck.tone}>{serverCheck.text}</StatusBanner>}

      <Field
        label="Gemini API key"
        type="password"
        placeholder="AIza..."
        autoComplete="off"
        spellCheck="false"
        hint="Stored only in this browser. Sent directly to Google, never to the MindGuard server."
        value={key}
        onChange={(event) => setKey(event.target.value)}
      />

      <Field
        label="Model"
        as="select"
        value={model}
        onChange={(event) => setModel(event.target.value)}
      >
        {MODEL_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </Field>

      <div className="privacy-actions">
        <Button onClick={handleSave} isLoading={isTesting} loadingLabel="Testing..." disabled={!key.trim()}>
          Test &amp; save
        </Button>
        {isConfigured && (
          <Button variant="ghost" onClick={handleClear}>
            Remove key
          </Button>
        )}
      </div>

      <p className="ai-brain__link">
        Get a free key at{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          aistudio.google.com/apikey
          <ExternalLink size={11} aria-hidden="true" />
        </a>
      </p>

      <Callout tone="info">
        Crisis replies are never generated by the model. If distress is detected, MindGuard uses
        reviewed wording and shows helplines directly.
      </Callout>
    </section>
  );
}
