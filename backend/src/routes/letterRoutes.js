const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const LetterService = require('../services/letterService');
const { MESSAGES } = require('../config/constants');

const router = Router();
router.use(requireAuth);

router.post('/', (req, res) => {
  try {
    const { content, scheduledAt } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '信件内容不能为空' });
    }
    let scheduledAtMs = null;
    if (scheduledAt != null && scheduledAt !== '') {
      scheduledAtMs = Number(scheduledAt);
      if (!Number.isFinite(scheduledAtMs)) {
        return res.status(400).json({ error: MESSAGES.SCHEDULED_TIME_INVALID });
      }
      if (scheduledAtMs <= Date.now()) {
        return res.status(400).json({ error: MESSAGES.SCHEDULED_TIME_PAST });
      }
    }
    const letter = LetterService.sendRandom({
      senderId: req.user.id,
      content: content.trim(),
      scheduledAt: scheduledAtMs
    });
    const message = scheduledAtMs
      ? MESSAGES.LETTER_SCHEDULED
      : MESSAGES.LETTER_SENT;
    res.json({
      message,
      id: letter.id,
      status: letter.status,
      scheduledAt: letter.scheduled_at
    });
  } catch (err) {
    const status =
      err.code === 'NO_USERS' || err.code === 'PAST_TIME' || err.code === 'BAD_REQUEST'
        ? 400
        : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/:id/cancel', (req, res) => {
  try {
    LetterService.cancel({
      userId: req.user.id,
      letterId: Number(req.params.id)
    });
    res.json({ message: MESSAGES.CANCELLED });
  } catch (err) {
    const status =
      err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403
        : err.code === 'ALREADY_DELIVERED' ? 409 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/:id/reschedule', (req, res) => {
  try {
    const { scheduledAt } = req.body || {};
    const scheduledAtMs = Number(scheduledAt);
    if (!Number.isFinite(scheduledAtMs)) {
      return res.status(400).json({ error: MESSAGES.SCHEDULED_TIME_INVALID });
    }
    const letter = LetterService.reschedule({
      userId: req.user.id,
      letterId: Number(req.params.id),
      scheduledAt: scheduledAtMs
    });
    res.json({
      message: MESSAGES.RESCHEDULED,
      id: letter.id,
      status: letter.status,
      scheduledAt: letter.scheduled_at
    });
  } catch (err) {
    const status =
      err.code === 'NOT_FOUND' ? 404
        : err.code === 'FORBIDDEN' ? 403
          : err.code === 'PAST_TIME' || err.code === 'BAD_REQUEST' ? 400
            : err.code === 'NOT_RESCHEDULABLE' ? 409 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/:id/reply', (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '回复内容不能为空' });
    }
    const reply = LetterService.reply({
      userId: req.user.id,
      parentId: Number(req.params.id),
      content: content.trim()
    });
    res.json({ message: MESSAGES.REPLIED, id: reply.id });
  } catch (err) {
    const status =
      err.code === 'NOT_FOUND' ? 404
        : err.code === 'FORBIDDEN' ? 403
          : err.code === 'NOT_DELIVERED' ? 409 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/:id/skip', (req, res) => {
  try {
    LetterService.skip({
      userId: req.user.id,
      letterId: Number(req.params.id)
    });
    res.json({ message: MESSAGES.SKIPPED });
  } catch (err) {
    const status =
      err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/:id/favorite', (req, res) => {
  try {
    const result = LetterService.toggleFavorite({
      userId: req.user.id,
      letterId: Number(req.params.id)
    });
    res.json({
      message: result.favorited ? MESSAGES.FAVORITED : MESSAGES.UNFAVORITED,
      favorited: result.favorited
    });
  } catch (err) {
    const status =
      err.code === 'NOT_FOUND' ? 404
        : err.code === 'FORBIDDEN' || err.code === 'NOT_DELIVERED' ? 403
          : 500;
    res.status(status).json({ error: err.message });
  }
});

router.get('/:id/thread', (req, res) => {
  try {
    const thread = LetterService.getThread({
      userId: req.user.id,
      rootId: Number(req.params.id)
    });
    res.json(thread);
  } catch (err) {
    const status =
      err.code === 'NOT_FOUND' ? 404 : err.code === 'FORBIDDEN' ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
