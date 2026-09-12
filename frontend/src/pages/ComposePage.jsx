import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LABELS, ROUTES } from '../config/constants.js';
import { LetterApi } from '../services/letterApi.js';

// datetime-local gives "YYYY-MM-DDTHH:mm" in local time; turn it into epoch ms.
function localInputToMs(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function formatLocalInput(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Earliest minute-aligned time that is still at least one full minute ahead.
// Rounding UP (not truncating) is essential near the end of a minute:
// at 10:30:59 this must yield 10:32, not an already-expired 10:31.
function earliestSendAtMs(now = Date.now()) {
  return Math.ceil((now + 60 * 1000) / (60 * 1000)) * (60 * 1000);
}

export default function ComposePage() {
  const [content, setContent] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [sendAt, setSendAt] = useState(formatLocalInput(earliestSendAtMs()));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [doneInfo, setDoneInfo] = useState(null);
  const navigate = useNavigate();

  const scheduledAt = scheduled ? localInputToMs(sendAt) : null;

  const submit = async () => {
    setError('');
    if (!content.trim()) return;
    if (scheduled) {
      if (scheduledAt == null) {
        setError('请选择送达时间');
        return;
      }
      if (scheduledAt <= Date.now()) {
        setError('过去的时间无法投递，请重新选择');
        return;
      }
    }
    setSending(true);
    try {
      const result = await LetterApi.send({
        content: content.trim(),
        scheduledAt: scheduledAt
      });
      setDoneInfo({ scheduled: scheduled, scheduledAt: result.scheduledAt || scheduledAt });
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setDoneInfo(null);
    setContent('');
    setScheduled(false);
    setSendAt(formatLocalInput(earliestSendAtMs()));
  };

  if (doneInfo) {
    return (
      <div className="compose-wrap" style={{ textAlign: 'center' }}>
        <h2 className="compose-title">
          {doneInfo.scheduled ? LABELS.PENDING_DELIVERY : '信已投入驿站'}
        </h2>
        <p className="compose-hint">
          {doneInfo.scheduled
            ? LABELS.SCHEDULED_DONE
            : '它正在寻找一位陌生的旅人……'}
        </p>
        <div className="home-actions">
          <button className="secondary-btn" onClick={reset}>
            {LABELS.WRITE_ANOTHER}
          </button>
          <button className="secondary-btn" onClick={() => navigate(ROUTES.INBOX)}>
            {LABELS.GOTO_INBOX}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="compose-wrap">
      <h2 className="compose-title">{LABELS.COMPOSE}</h2>
      <p className="compose-hint">
        这封信会随机分配给另一位注册的旅人。你们彼此看不到真名，只以信会友。
      </p>
      <textarea
        className="compose-text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={LABELS.CONTENT_PLACEHOLDER}
        maxLength={2000}
      />
      <div className="schedule-row">
        <label className="schedule-toggle">
          <input
            type="checkbox"
            checked={scheduled}
            onChange={(e) => {
              setScheduled(e.target.checked);
              setError('');
              if (e.target.checked) setSendAt(formatLocalInput(earliestSendAtMs()));
            }}
          />
          {LABELS.SCHEDULE_TOGGLE}
        </label>
        {scheduled && (
          <input
            className="schedule-input"
            type="datetime-local"
            value={sendAt}
            min={formatLocalInput(earliestSendAtMs())}
            onChange={(e) => setSendAt(e.target.value)}
          />
        )}
        {!scheduled && <span className="schedule-hint">{LABELS.SEND_IMMEDIATE_HINT}</span>}
      </div>
      <div className="compose-footer">
        <span className="count">{content.length} / 2000</span>
        <div>
          <button
            className="secondary-btn"
            style={{ marginRight: 10 }}
            onClick={() => navigate(ROUTES.HOME)}
          >
            {LABELS.BACK}
          </button>
          <button
            className="big-btn"
            onClick={submit}
            disabled={sending || !content.trim() || (scheduled && !sendAt)}
          >
            {sending ? '投入中…' : scheduled ? '定时投入驿站' : LABELS.SEND}
          </button>
        </div>
      </div>
      <div className="error-text">{error}</div>
    </div>
  );
}
