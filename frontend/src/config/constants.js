// Global string constants and endpoints — single source of truth

export const PORTS = {
  FRONTEND: 8178,
  BACKEND: 9178,
  DATABASE: 10178
};

export const API_BASE = '';

export const ENDPOINTS = {
  REGISTER: `${API_BASE}/api/auth/register`,
  LOGIN: `${API_BASE}/api/auth/login`,
  ME: `${API_BASE}/api/auth/me`,
  SEND_LETTER: `${API_BASE}/api/letters`,
  REPLY_LETTER: (id) => `${API_BASE}/api/letters/${id}/reply`,
  SKIP_LETTER: (id) => `${API_BASE}/api/letters/${id}/skip`,
  FAVORITE_LETTER: (id) => `${API_BASE}/api/letters/${id}/favorite`,
  CANCEL_LETTER: (id) => `${API_BASE}/api/letters/${id}/cancel`,
  RESCHEDULE_LETTER: (id) => `${API_BASE}/api/letters/${id}/reschedule`,
  THREAD: (id) => `${API_BASE}/api/letters/${id}/thread`,
  INBOX: `${API_BASE}/api/inbox`
};

export const STORAGE_KEYS = {
  TOKEN: 'lp_token',
  PEN_NAME: 'lp_pen_name'
};

export const ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  HOME: '/',
  COMPOSE: '/compose',
  INBOX: '/inbox',
  THREAD: '/thread/:id'
};

export const LABELS = {
  APP_TITLE: '信件驿站',
  APP_SUBTITLE: '写给陌生人的一封信',
  LOGIN_HINT: '用你的笔名继续未读完的信',
  REGISTER_HINT: '起一个笔名，匿名穿梭于驿站',
  PEN_NAME: '笔名',
  PASSWORD: '密码',
  LOGIN: '登录',
  REGISTER: '注册',
  SWITCH_TO_LOGIN: '已有笔名？去登录',
  SWITCH_TO_REGISTER: '没有笔名？去注册',
  LOGOUT: '退出',
  COMPOSE: '投一封信',
  MY_INBOX: '我的信箱',
  SENT: '发出的',
  RECEIVED: '收到的',
  CONVERSATIONS: '对话中',
  FAVORITE: '收藏',
  UNFAVORITE: '取消收藏',
  REPLY: '回复',
  SKIP: '跳过',
  SEND: '投入驿站',
  CONTENT_PLACEHOLDER: '写下此刻想对陌生人说的话……',
  EMPTY_SENT: '还没有寄出的信',
  EMPTY_RECEIVED: '信箱空空，等一封信',
  EMPTY_CONVERSATIONS: '没有在持续的对话',
  BACK: '返回',
  REPLY_PLACEHOLDER: '回信给这位陌生人……',
  SUBMIT_REPLY: '寄出回复',
  SENT_FROM_ME: '我寄出',
  SENT_FROM_STRANGER: '陌生人',
  SCHEDULE_TOGGLE: '定时寄出',
  SCHEDULE_TIME: '送达时间',
  SEND_IMMEDIATE_HINT: '不选时间则立即投递',
  SCHEDULED_DONE: '信已收好在驿站，到点自会送达',
  WRITE_ANOTHER: '再写一封',
  GOTO_INBOX: '去看看我的信箱',
  PENDING_DELIVERY: '待投递',
  ESTIMATED_DELIVERY: '预计送达',
  CANCEL_DELIVERY: '取消投递',
  RESCHEDULE: '改期',
  RESCHEDULE_SAVE: '确认改期',
  RESCHEDULE_CANCEL: '放弃改期',
  RESCHEDULED: '送达时间已更新',
  CONFIRM_CANCEL: '确定取消这封信的投递吗？取消后不会再寄出。',
  CANCELLED_BADGE: '已取消',
  SCHEDULED_THREAD_HINT: '这封信还在驿站等候，到点后才会送到对方手中。',
  CANCELLED_THREAD_HINT: '这封信已取消投递，不会再寄出。'
};

export const STATUS_TEXT = {
  pending: '待处理',
  delivered: '已送达',
  skipped: '已跳过',
  replied: '已回复',
  scheduled: '待投递',
  cancelled: '已取消'
};
