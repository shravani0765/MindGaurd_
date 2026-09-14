import React from 'react';
import { AlertTriangle, ExternalLink, Phone } from 'lucide-react';
import { INTERNATIONAL_DIRECTORY, getCrisisResources } from '../services/crisisResources';

/**
 * The crisis panel. Numbers are tel:/sms: links so a phone dials on one tap —
 * in distress, copying a number by hand is a barrier worth removing.
 */
export default function CrisisResources({ regionId, compact = false }) {
  const region = getCrisisResources(regionId);

  return (
    <div className={`crisis-panel ${compact ? 'crisis-panel--compact' : ''}`.trim()} role="note">
      <p className="crisis-panel__title">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>If you are in a life threatening situation — don&apos;t use this site</span>
      </p>

      <p className="crisis-panel__lead">
        Call <a href={`tel:${region.emergency.number}`}><strong>{region.emergency.number}</strong></a>{' '}
        ({region.emergency.label}) or go to your nearest emergency room if you are in immediate danger.
      </p>

      <ul className="crisis-panel__lines">
        {region.lines.map((line) => (
          <li key={line.name}>
            <a href={line.href} className="crisis-panel__line">
              <Phone size={13} aria-hidden="true" />
              <span className="crisis-panel__line-name">{line.name}</span>
              <span className="crisis-panel__line-number">{line.number}</span>
            </a>
            <span className="crisis-panel__line-detail">{line.detail}</span>
          </li>
        ))}
      </ul>

      <p className="crisis-panel__footer">
        Outside {region.label}?{' '}
        <a href={INTERNATIONAL_DIRECTORY.url} target="_blank" rel="noreferrer">
          {INTERNATIONAL_DIRECTORY.name}
          <ExternalLink size={11} aria-hidden="true" />
        </a>{' '}
        lists {INTERNATIONAL_DIRECTORY.detail.toLowerCase()}.
      </p>
    </div>
  );
}
