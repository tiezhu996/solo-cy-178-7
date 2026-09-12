import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LABELS, STATUS_TEXT } from '../config/constants.js';
import { LetterApi } from '../services/letterApi.js';

const TABS = [
  { key: 'received', label: LABELS.RECEIVED },
  { key: 'sent', label: LABELS.SENT },
  { key: 'conversations', label: LABELS.CONVERSATIONS }
];

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function LetterCard({ item, onOpen, onToggleFavorite, onSkip, onCancel }) {
  const isScheduled = item.status === 'scheduled';
  const isCancelled = item.status === 'cancelled';
  const waiting = isScheduled || isCancelled;
  const badgeClass = `badge ${isScheduled ? 'scheduled' : isCancelled ? 'cancelled' : item.status === 'skipped' ? 'skipped' : ''}`;

  return (
    <div
      className="letter-card"
      onClick={() => onOpen(item.id)}
      style={isCancelled ? { opacity: 0.6 } : undefined}
    >
      <div className="letter-meta">
        <span>
          {item.role === 'sent' ? LABELS.SENT_FROM_ME : LABELS.SENT_FROM_STRANGER}
          {item.replyCount > 0 ? ` · ${item.replyCount} 封回信` : ''}
        </span>
        <span>
          {isScheduled && item.scheduledAt
            ? `${LABELS.ESTIMATED_DELIVERY} ${formatTime(item.scheduledAt)}`
            : formatTime(item.deliveredAt || item.createdAt)}
          {waiting || (item.status !== 'delivered' && item.status !== 'pending') ? (
            <>
              {' '}
              <span className={badgeClass}>{STATUS_TEXT[item.status]}</span>
            </>
          ) : null}
        </span>
      </div>
      <div className="letter-preview">{item.preview}{item.preview.length >= 80 ? '…' : ''}</div>
      {isScheduled && (
        <div className="schedule-note">
          {LABELS.PENDING_DELIVERY} · {LABELS.ESTIMATED_DELIVERY} {formatTime(item.scheduledAt)}
        </div>
      )}
      <div className="letter-actions" onClick={(e) => e.stopPropagation()}>
        {!waiting && (
          <button
            className={`icon-btn ${item.favorited ? 'on' : ''}`}
            onClick={() => onToggleFavorite(item.id)}
          >
            {item.favorited ? `★ ${LABELS.UNFAVORITE}` : `☆ ${LABELS.FAVORITE}`}
          </button>
        )}
        {item.role === 'received' && item.status !== 'skipped' && item.replyCount === 0 && (
          <button className="icon-btn" onClick={() => onSkip(item.id)}>
            {LABELS.SKIP}
          </button>
        )}
        {isScheduled && item.role === 'sent' && (
          <button className="icon-btn" onClick={() => onCancel(item.id)}>
            {LABELS.CANCEL_DELIVERY}
          </button>
        )}
      </div>
    </div>
  );
}

export default function InboxPage() {
  const [tab, setTab] = useState('received');
  const [data, setData] = useState({ sent: [], received: [], conversations: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const timerRef = useRef(null);

  const refresh = async (silent) => {
    try {
      const result = await LetterApi.inbox();
      setData(result);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // Scheduled letters flip to delivered on the server clock; poll so the
    // list updates without waiting for a manual reload.
    timerRef.current = setInterval(() => refresh(true), 5000);
    return () => clearInterval(timerRef.current);
  }, []);

  const toggleFavorite = async (id) => {
    try {
      await LetterApi.toggleFavorite(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const skip = async (id) => {
    try {
      await LetterApi.skip(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const cancel = async (id) => {
    setError('');
    if (!window.confirm(LABELS.CONFIRM_CANCEL)) return;
    try {
      await LetterApi.cancel(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const list = data[tab] || [];

  const emptyText = useMemo(() => {
    if (tab === 'sent') return LABELS.EMPTY_SENT;
    if (tab === 'received') return LABELS.EMPTY_RECEIVED;
    return LABELS.EMPTY_CONVERSATIONS;
  }, [tab]);

  return (
    <div>
      <div className="inbox-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="loading">加载中…</div>
      ) : list.length === 0 ? (
        <div className="empty-state">{emptyText}</div>
      ) : (
        <div className="letter-list">
          {list.map((item) => (
            <LetterCard
              key={item.id}
              item={item}
              onOpen={(id) => navigate(`/thread/${id}`)}
              onToggleFavorite={toggleFavorite}
              onSkip={skip}
              onCancel={cancel}
            />
          ))}
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
