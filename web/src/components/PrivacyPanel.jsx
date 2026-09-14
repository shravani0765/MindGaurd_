import React, { useState } from 'react';
import { Download, ShieldCheck, Trash2 } from 'lucide-react';
import { Button, Callout, Field, StatusBanner } from './ui';
import { apiClient } from '../services/api';

/** Export-my-data and delete-my-account. */
export default function PrivacyPanel({ onAccountDeleted }) {
  const [banner, setBanner] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    setBanner(null);
    try {
      const data = await apiClient.exportAccountData();
      // Build the file in-browser: the data is already here, and a download
      // link avoids a second authenticated round-trip.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mindguard-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setBanner({ tone: 'success', text: `Downloaded ${data.moodLogs?.length ?? 0} check-ins.` });
    } catch (error) {
      setBanner({ tone: 'error', text: error.message || 'Could not export your data.' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async (event) => {
    event.preventDefault();
    setIsDeleting(true);
    setBanner(null);
    try {
      await apiClient.deleteAccount(password);
      onAccountDeleted?.();
    } catch (error) {
      setBanner({ tone: 'error', text: error.message || 'Could not delete your account.' });
    } finally {
      setIsDeleting(false);
      setPassword('');
    }
  };

  return (
    <section className="voice-studio__section">
      <h3>Your data</h3>

      {banner && <StatusBanner tone={banner.tone}>{banner.text}</StatusBanner>}

      <Callout tone="muted" icon={ShieldCheck} title="What is stored where">
        <p>
          Your account and check-in history live on the server. Your archetype, language, voice and
          comfort profile never leave this browser.
        </p>
        <p>Camera frames and audio are processed on your device and are never uploaded.</p>
      </Callout>

      <div className="privacy-actions">
        <Button variant="ghost" icon={Download} onClick={handleExport} isLoading={isExporting} loadingLabel="Preparing...">
          Download my data
        </Button>

        {!isConfirming ? (
          <Button variant="ghost" icon={Trash2} onClick={() => setIsConfirming(true)}>
            Delete my account
          </Button>
        ) : null}
      </div>

      {isConfirming && (
        <form className="privacy-delete" onSubmit={handleDelete}>
          <Callout tone="danger" title="This cannot be undone">
            <p>Your account and every check-in will be permanently deleted.</p>
          </Callout>

          <Field
            label="Confirm your password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <div className="privacy-actions">
            <Button
              variant="danger"
              type="submit"
              icon={Trash2}
              isLoading={isDeleting}
              loadingLabel="Deleting..."
              disabled={!password}
            >
              Permanently delete
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setIsConfirming(false);
                setPassword('');
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
