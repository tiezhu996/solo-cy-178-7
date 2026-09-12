import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LABELS, STATUS_TEXT } from '../config/constants.js';
import { LetterApi } from '../services/letterApi.js';

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ThreadPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);

  const load = async (silent) => {
    try {
      const thread = await LetterApi.thread(id);
      setData(thread);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  // While the letter waits for delivery, keep polling so it flips into the
  // normal conversation view automatically when its time arrives.
  const status = data ? data.status : null;
  useEffect(() => {
    if (status === 'scheduled') {
      timerRef.current = setInterval(() => load(true), 5000);
      return () => clearInterval(timerRef.current);
    }
    return undefined;
  }, [status, id]);

  const submitReply = async () => {
    setError('');
    if (!reply.trim()) return;
    setSubmitting(true);
    try {
      await LetterApi.reply({ id, content: reply.trim() });
      setReply('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFavorite = async () => {
    try {
      await LetterApi.toggleFavorite(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const cancel = async () => {
    setError('');
    if (!window.confirm(LABELS.CONFIRM_CANCEL)) return;
    try {
      await LetterApi.cancel(id);
      navigate('/inbox');
    } catch (err) {
      setError(err.message);
      load();
    }
  };

  if (loading) return <div className="loading">加载对话中…</div>;
  if (!data) return <div className="empty-state">{error || '无法加载对话'}</div>;

  const isScheduled = data.status === 'scheduled';
  const isCancelled = data.status === 'cancelled';
  const locked = isScheduled || isCancelled;

  return (
    <div className="thread-wrap">
      <div className="thread-head">
        <h2>对话链 #{id}</h2>
        <div>
          {!locked && (
            <button
              className={`icon-btn ${data.favorited ? 'on' : ''}`}
              onClick={toggleFavorite}
            >
              {data.favorited ? `★ ${LABELS.UNFAVORITE}` : `☆ ${LABELS.FAVORITE}`}
            </button>
          )}
          <button
            className="icon-btn"
            style={{ marginLeft: 8 }}
            onClick={() => navigate(-1)}
          >
            {LABELS.BACK}
          </button>
        </div>
      </div>

      {isScheduled && (
        <div className="schedule-banner">
          <span className="badge scheduled">{STATUS_TEXT.scheduled}</span>
          <span>
            {LABELS.SCHEDULED_THREAD_HINT}
            {data.scheduledAt ? ` ${LABELS.ESTIMATED_DELIVERY} ${formatTime(data.scheduledAt)}` : ''}
          </span>
          <button className="secondary-btn" onClick={cancel}>
            {LABELS.CANCEL_DELIVERY}
          </button>
        </div>
      )}
      {isCancelled && (
        <div className="schedule-banner cancelled">
          <span className="badge cancelled">{STATUS_TEXT.cancelled}</span>
          <span>{LABELS.CANCELLED_THREAD_HINT}</span>
        </div>
      )}

      <div className="message-list">
        {data.messages.map((m) => (
          <div key={m.id} className={`msg-bubble ${m.fromMe ? 'me' : 'them'}`}>
            <div>{m.content}</div>
            <div className="msg-time">
              {isScheduled && m.fromMe && data.scheduledAt
                ? `${LABELS.ESTIMATED_DELIVERY} ${formatTime(data.scheduledAt)}`
                : formatTime(m.createdAt)}
            </div>
          </div>
        ))}
      </div>

      {!locked && (
        <div className="reply-box">
          <textarea
            className="reply-text"
            placeholder={LABELS.REPLY_PLACEHOLDER}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={2000}
          />
          <div className="reply-footer">
            <div className="error-text" style={{ margin: 'auto 0' }}>{error}</div>
            <button
              className="big-btn"
              onClick={submitReply}
              disabled={submitting || !reply.trim()}
            >
              {submitting ? '寄出中…' : LABELS.SUBMIT_REPLY}
            </button>
          </div>
        </div>
      )}
      {locked && error && <div className="error-text">{error}</div>}
    </div>
  );
}
