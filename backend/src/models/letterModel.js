const db = require('../data/database');

const LetterModel = {
  create({ senderId, receiverId, parentId, content, status, scheduledAt, createdAt }) {
    const stmt = db.prepare(
      `INSERT INTO letters (sender_id, receiver_id, parent_id, content, status, scheduled_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(
      senderId,
      receiverId,
      parentId || null,
      content,
      status,
      scheduledAt || null,
      createdAt
    );
    return info.lastInsertRowid;
  },

  findById(id) {
    return db.prepare('SELECT * FROM letters WHERE id = ?').get(id);
  },

  findRootByChild(id) {
    const row = db
      .prepare(
        `WITH RECURSIVE chain(id, parent_id) AS (
           SELECT id, parent_id FROM letters WHERE id = ?
           UNION ALL
           SELECT l.id, l.parent_id FROM letters l
           INNER JOIN chain c ON l.id = c.parent_id
         )
         SELECT id FROM chain WHERE parent_id IS NULL`
      )
      .get(id);
    return row ? row.id : id;
  },

  updateStatus(id, status) {
    return db.prepare('UPDATE letters SET status = ? WHERE id = ?').run(status, id);
  },

  // Atomically deliver every scheduled letter whose time has come.
  // Returns the ids that flipped on this tick.
  deliverDue(now) {
    const due = db
      .prepare(
        `SELECT id FROM letters
         WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?`
      )
      .all(now);
    if (!due.length) return [];
    const mark = db.prepare(
      `UPDATE letters
       SET status = 'delivered', delivered_at = ?
       WHERE id = ? AND status = 'scheduled'`
    );
    const run = db.transaction((rows) => {
      for (const row of rows) mark.run(now, row.id);
    });
    run(due);
    return due.map((row) => row.id);
  },

  // Cancel only if the letter is still waiting to be delivered.
  // Returns true when this call performed the cancellation.
  cancelIfScheduled({ id, senderId }) {
    const info = db
      .prepare(
        `UPDATE letters
         SET status = 'cancelled'
         WHERE id = ? AND sender_id = ? AND status = 'scheduled'`
      )
      .run(id, senderId);
    return info.changes > 0;
  },

  // Move a waiting letter to a new delivery time. The conditional UPDATE is
  // the race guard: a letter delivered in the meantime no longer matches.
  rescheduleIfScheduled({ id, senderId, scheduledAt }) {
    const info = db
      .prepare(
        `UPDATE letters
         SET scheduled_at = ?
         WHERE id = ? AND sender_id = ? AND status = 'scheduled'`
      )
      .run(scheduledAt, id, senderId);
    return info.changes > 0;
  },

  listSentByUser(userId) {
    return db
      .prepare(
        `SELECT l.*,
          (SELECT COUNT(*) FROM letters c WHERE c.parent_id = l.id) AS reply_count
         FROM letters l
         WHERE l.sender_id = ? AND l.parent_id IS NULL
         ORDER BY l.created_at DESC`
      )
      .all(userId);
  },

  listReceivedByUser(userId) {
    return db
      .prepare(
        `SELECT l.*,
          (SELECT COUNT(*) FROM letters c WHERE c.parent_id = l.id) AS reply_count
         FROM letters l
         WHERE l.receiver_id = ? AND l.parent_id IS NULL
           AND l.status NOT IN ('scheduled', 'cancelled')
         ORDER BY COALESCE(l.delivered_at, l.created_at) DESC`
      )
      .all(userId);
  },

  listConversationsForUser(userId) {
    return db
      .prepare(
        `SELECT DISTINCT l.*,
          (SELECT COUNT(*) FROM letters c WHERE c.parent_id = l.id) AS reply_count
         FROM letters l
         WHERE l.parent_id IS NULL
           AND (l.sender_id = ? OR l.receiver_id = ?)
           AND EXISTS (
             SELECT 1 FROM letters c WHERE c.parent_id = l.id
           )
         ORDER BY l.created_at DESC`
      )
      .all(userId, userId);
  },

  listThread(rootId) {
    return db
      .prepare(
        `WITH RECURSIVE chain(id, parent_id, depth) AS (
           SELECT id, parent_id, 0 FROM letters WHERE id = ?
           UNION ALL
           SELECT l.id, l.parent_id, c.depth + 1 FROM letters l
           INNER JOIN chain c ON l.parent_id = c.id
         )
         SELECT l.* FROM letters l
         INNER JOIN chain c ON l.id = c.id
         ORDER BY c.depth ASC, l.created_at ASC`
      )
      .all(rootId);
  }
};

module.exports = LetterModel;
