// Global constants configuration — keep all string literals in one place
module.exports = {
  PORTS: {
    FRONTEND: Number(process.env.FRONTEND_PORT) || 8178,
    BACKEND: Number(process.env.PORT || process.env.BACKEND_PORT) || 9178,
    DATABASE: Number(process.env.DB_PORT) || 10178
  },

  DB: {
    FILE: process.env.SQLITE_PATH || 'data/letter_pigeon.db'
  },

  JWT: {
    SECRET: process.env.JWT_SECRET || 'letter-pigeon-dev-secret-change-me',
    EXPIRY: '7d'
  },

  ROUTES: {
    AUTH: '/api/auth',
    LETTERS: '/api/letters',
    INBOX: '/api/inbox'
  },

  LETTER_STATUS: {
    PENDING: 'pending',
    DELIVERED: 'delivered',
    SKIPPED: 'skipped',
    REPLIED: 'replied',
    SCHEDULED: 'scheduled',
    CANCELLED: 'cancelled'
  },

  SCHEDULER: {
    TICK_MS: 5000
  },

  ROLES: {
    SENDER: 'sender',
    RECEIVER: 'receiver'
  },

  CATEGORIES: {
    SENT: 'sent',
    RECEIVED: 'received',
    CONVERSATIONS: 'conversations'
  },

  MESSAGES: {
    USERNAME_TAKEN: '该笔名已被占用',
    REGISTER_OK: '注册成功',
    LOGIN_FAIL: '笔名或密码错误',
    UNAUTHORIZED: '请先登录',
    NO_OTHER_USERS: '驿站暂时还没有其他旅人，再等等吧',
    LETTER_NOT_FOUND: '信件不存在',
    NOT_YOUR_LETTER: '这不是你的信件',
    LETTER_SENT: '信件已投入驿站',
    FAVORITED: '已收藏',
    UNFAVORITED: '已取消收藏',
    SKIPPED: '已跳过这封信',
    REPLIED: '回复已送达',
    SCHEDULED_TIME_PAST: '定时时间必须晚于当前时间',
    SCHEDULED_TIME_INVALID: '定时时间格式不正确',
    LETTER_SCHEDULED: '信件已收好，将在指定时间投递',
    NOT_DELIVERED: '信件尚未投递',
    CANCELLED: '已取消投递',
    ALREADY_DELIVERED: '信件已经投递，无法取消',
    NOT_SENDER: '只能取消自己寄出的信',
    RESCHEDULED: '送达时间已更新',
    ALREADY_CANCELLED: '信件已取消，无法改期',
    NOT_RESCHEDULABLE: '只能改期待投递的信',
    RESCHEDULE_NOT_SENDER: '只能改期自己寄出的信'
  }
};
