const LetterModel = require('../models/letterModel');
const UserModel = require('../models/userModel');
const FavoriteModel = require('../models/favoriteModel');
const { LETTER_STATUS, MESSAGES } = require('../config/constants');

const LetterService = {
  sendRandom({ senderId, content, scheduledAt }) {
    const other = UserModel.findRandomOther(senderId);
    if (!other) {
      const err = new Error(MESSAGES.NO_OTHER_USERS);
      err.code = 'NO_USERS';
      throw err;
    }
    if (scheduledAt != null) {
      if (!Number.isFinite(scheduledAt)) {
        const err = new Error(MESSAGES.SCHEDULED_TIME_INVALID);
        err.code = 'BAD_REQUEST';
        throw err;
      }
      if (scheduledAt <= Date.now()) {
        const err = new Error(MESSAGES.SCHEDULED_TIME_PAST);
        err.code = 'PAST_TIME';
        throw err;
      }
    }
    const isScheduled = !!scheduledAt;
    const now = Date.now();
    const id = LetterModel.create({
      senderId,
      receiverId: other.id,
      parentId: null,
      content,
      status: isScheduled ? LETTER_STATUS.SCHEDULED : LETTER_STATUS.DELIVERED,
      scheduledAt: isScheduled ? scheduledAt : null,
      createdAt: now
    });
    return LetterModel.findById(id);
  },

  cancel({ userId, letterId }) {
    const letter = LetterModel.findById(letterId);
    if (!letter) {
      const err = new Error(MESSAGES.LETTER_NOT_FOUND);
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (letter.sender_id !== userId) {
      const err = new Error(MESSAGES.NOT_SENDER);
      err.code = 'FORBIDDEN';
      throw err;
    }
    // The conditional update is the race guard: a letter whose time just
    // arrived has already flipped to delivered and cannot be cancelled.
    const cancelled = LetterModel.cancelIfScheduled({ id: letterId, senderId: userId });
    if (!cancelled) {
      const current = LetterModel.findById(letterId);
      const err = new Error(
        current && current.status === LETTER_STATUS.CANCELLED
          ? MESSAGES.CANCELLED
          : MESSAGES.ALREADY_DELIVERED
      );
      err.code = 'ALREADY_DELIVERED';
      throw err;
    }
    return true;
  },

  reschedule({ userId, letterId, scheduledAt }) {
    if (!Number.isFinite(scheduledAt)) {
      const err = new Error(MESSAGES.SCHEDULED_TIME_INVALID);
      err.code = 'BAD_REQUEST';
      throw err;
    }
    if (scheduledAt <= Date.now()) {
      const err = new Error(MESSAGES.SCHEDULED_TIME_PAST);
      err.code = 'PAST_TIME';
      throw err;
    }
    const letter = LetterModel.findById(letterId);
    if (!letter) {
      const err = new Error(MESSAGES.LETTER_NOT_FOUND);
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (letter.sender_id !== userId) {
      const err = new Error(MESSAGES.RESCHEDULE_NOT_SENDER);
      err.code = 'FORBIDDEN';
      throw err;
    }
    if (letter.status === LETTER_STATUS.CANCELLED) {
      const err = new Error(MESSAGES.ALREADY_CANCELLED);
      err.code = 'NOT_RESCHEDULABLE';
      throw err;
    }
    // Conditional UPDATE fails for delivered/replied/skipped letters as well
    // as for one delivered by the scheduler between the check and the write.
    const moved = LetterModel.rescheduleIfScheduled({ id: letterId, senderId: userId, scheduledAt });
    if (!moved) {
      const err = new Error(MESSAGES.NOT_RESCHEDULABLE);
      err.code = 'NOT_RESCHEDULABLE';
      throw err;
    }
    return LetterModel.findById(letterId);
  },

  reply({ userId, parentId, content }) {
    const parent = LetterModel.findById(parentId);
    if (!parent) {
      const err = new Error(MESSAGES.LETTER_NOT_FOUND);
      err.code = 'NOT_FOUND';
      throw err;
    }
    const isReceiver = parent.receiver_id === userId;
    const isSender = parent.sender_id === userId;
    if (!isReceiver && !isSender) {
      const err = new Error(MESSAGES.NOT_YOUR_LETTER);
      err.code = 'FORBIDDEN';
      throw err;
    }
    // A scheduled letter has not reached the receiver yet; nobody can reply to it.
    if (parent.status === LETTER_STATUS.SCHEDULED || parent.status === LETTER_STATUS.CANCELLED) {
      const err = new Error(MESSAGES.NOT_DELIVERED);
      err.code = isSender ? 'NOT_DELIVERED' : 'NOT_FOUND';
      if (!isSender) err.message = MESSAGES.LETTER_NOT_FOUND;
      throw err;
    }
    const receiverId = isReceiver ? parent.sender_id : parent.receiver_id;

    const rootId = LetterModel.findRootByChild(parent.id);
    const id = LetterModel.create({
      senderId: userId,
      receiverId,
      parentId: rootId,
      content,
      status: LETTER_STATUS.REPLIED,
      createdAt: Date.now()
    });
    if (parent.status === LETTER_STATUS.DELIVERED || parent.status === LETTER_STATUS.PENDING) {
      LetterModel.updateStatus(parent.id, LETTER_STATUS.REPLIED);
    }
    return LetterModel.findById(id);
  },

  skip({ userId, letterId }) {
    const letter = LetterModel.findById(letterId);
    if (!letter) {
      const err = new Error(MESSAGES.LETTER_NOT_FOUND);
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (letter.receiver_id !== userId) {
      const err = new Error(MESSAGES.NOT_YOUR_LETTER);
      err.code = 'FORBIDDEN';
      throw err;
    }
    if (letter.status === LETTER_STATUS.SCHEDULED || letter.status === LETTER_STATUS.CANCELLED) {
      const err = new Error(MESSAGES.LETTER_NOT_FOUND);
      err.code = 'NOT_FOUND';
      throw err;
    }
    LetterModel.updateStatus(letterId, LETTER_STATUS.SKIPPED);
    return true;
  },

  toggleFavorite({ userId, letterId }) {
    const letter = LetterModel.findById(letterId);
    if (!letter) {
      const err = new Error(MESSAGES.LETTER_NOT_FOUND);
      err.code = 'NOT_FOUND';
      throw err;
    }
    // Scheduled letters are invisible to the receiver; only the sender can
    // touch them, and the sender UI offers no favorite before delivery.
    if (
      letter.status === LETTER_STATUS.SCHEDULED ||
      letter.status === LETTER_STATUS.CANCELLED
    ) {
      const err = new Error(
        letter.sender_id === userId ? MESSAGES.NOT_DELIVERED : MESSAGES.LETTER_NOT_FOUND
      );
      err.code = letter.sender_id === userId ? 'NOT_DELIVERED' : 'NOT_FOUND';
      throw err;
    }
    const exists = FavoriteModel.exists({ userId, letterId });
    if (exists) {
      FavoriteModel.remove({ userId, letterId });
      return { favorited: false };
    }
    FavoriteModel.add({ userId, letterId, createdAt: Date.now() });
    return { favorited: true };
  },

  isFavorited({ userId, letterId }) {
    return FavoriteModel.exists({ userId, letterId });
  },

  listInbox(userId) {
    const rawSent = LetterModel.listSentByUser(userId);
    const rawReceived = LetterModel.listReceivedByUser(userId);
    const rawConvos = LetterModel.listConversationsForUser(userId);
    const favorites = new Set(
      FavoriteModel.listByUser(userId).map((l) => l.id)
    );
    const decorate = (list, role) =>
      list.map((l) => ({
        id: l.id,
        preview: l.content.slice(0, 80),
        status: l.status,
        createdAt: l.created_at,
        scheduledAt: l.scheduled_at,
        deliveredAt: l.delivered_at,
        replyCount: l.reply_count,
        role,
        favorited: favorites.has(l.id)
      }));
    return {
      sent: decorate(rawSent, 'sent'),
      received: decorate(rawReceived, 'received'),
      conversations: decorate(rawConvos, 'either')
    };
  },

  getThread({ userId, rootId }) {
    const thread = LetterModel.listThread(rootId);
    if (!thread.length) {
      const err = new Error(MESSAGES.LETTER_NOT_FOUND);
      err.code = 'NOT_FOUND';
      throw err;
    }
    const first = thread[0];
    const isParticipant = first.sender_id === userId || first.receiver_id === userId;
    if (!isParticipant) {
      const err = new Error(MESSAGES.NOT_YOUR_LETTER);
      err.code = 'FORBIDDEN';
      throw err;
    }
    // Waiting or cancelled letters exist only on the sender's side.
    const hiddenFromReceiver =
      first.receiver_id === userId &&
      (first.status === LETTER_STATUS.SCHEDULED || first.status === LETTER_STATUS.CANCELLED);
    if (hiddenFromReceiver) {
      const err = new Error(MESSAGES.LETTER_NOT_FOUND);
      err.code = 'NOT_FOUND';
      throw err;
    }
    const me = userId;
    return {
      rootId,
      status: first.status,
      scheduledAt: first.scheduled_at,
      deliveredAt: first.delivered_at,
      favorited: FavoriteModel.exists({ userId, letterId: rootId }),
      messages: thread.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.created_at,
        fromMe: m.sender_id === me
      }))
    };
  }
};

module.exports = LetterService;
