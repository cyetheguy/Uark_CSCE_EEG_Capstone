import React, { useEffect } from 'react';
import {
  STAGE_HEALTH_MODAL_TITLE,
  STAGE_HEALTH_DISCLAIMER,
  STAGE_HEALTH_ENTRIES,
} from '../utils/stageInterpretationCopy';

interface SleepStageHealthModalProps {
  open: boolean;
  onClose: () => void;
}

const SleepStageHealthModal: React.FC<SleepStageHealthModalProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="stage-health-modal-root">
      <div className="stage-health-modal-backdrop" onClick={onClose} role="presentation" />
      <div
        className="stage-health-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stage-health-modal-title"
      >
        <div className="stage-health-modal-header">
          <h3 id="stage-health-modal-title">{STAGE_HEALTH_MODAL_TITLE}</h3>
          <button type="button" className="stage-health-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="stage-health-modal-disclaimer">{STAGE_HEALTH_DISCLAIMER}</p>
        <ul className="stage-health-modal-list">
          {STAGE_HEALTH_ENTRIES.map((entry) => (
            <li key={entry.title}>
              <strong>{entry.title}.</strong>
              <span> {entry.body}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default SleepStageHealthModal;
