import React, { useState } from 'react';
import { LABELS } from '../config/constants.js';
import { LetterApi } from '../services/letterApi.js';
import { localInputToMs, formatLocalInput, earliestSendAtMs } from '../utils/datetime.js';

// Inline editor for moving a waiting letter to a new future delivery time.
// Past times are rejected client-side; the server enforces it as well.
export default function RescheduleControl({ letterId, currentScheduledAt, onDone, onError }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const startEdit = () => {
    const now = Date.now();
    const base = currentScheduledAt && currentScheduledAt > now
      ? currentScheduledAt
      : earliestSendAtMs(now);
    setValue(formatLocalInput(base));
    setError('');
    setEditing(true);
  };

  const save = async () => {
    const ms = localInputToMs(value);
    if (ms == null) {
      setError('请选择送达时间');
      return;
    }
    if (ms <= Date.now()) {
      setError('过去的时间无法投递，请重新选择');
      return;
    }
    setSaving(true);
    try {
      await LetterApi.reschedule({ id: letterId, scheduledAt: ms });
      setEditing(false);
      if (onDone) onDone();
    } catch (err) {
      setError(err.message);
      if (onError) onError(err);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button className="icon-btn" onClick={startEdit}>
        {LABELS.RESCHEDULE}
      </button>
    );
  }

  return (
    <span className="reschedule-editor" onClick={(e) => e.stopPropagation()}>
      <input
        className="schedule-input"
        type="datetime-local"
        value={value}
        min={formatLocalInput(earliestSendAtMs())}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
      />
      <button className="icon-btn on" onClick={save} disabled={saving || !value}>
        {saving ? '提交中…' : LABELS.RESCHEDULE_SAVE}
      </button>
      <button
        className="icon-btn"
        onClick={() => setEditing(false)}
        disabled={saving}
      >
        {LABELS.RESCHEDULE_CANCEL}
      </button>
      {error && <span className="reschedule-error">{error}</span>}
    </span>
  );
}
