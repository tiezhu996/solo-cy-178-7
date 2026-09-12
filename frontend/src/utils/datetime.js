// Helpers for the minute-precision datetime-local picker used by scheduling.

// datetime-local gives "YYYY-MM-DDTHH:mm" in local time; turn it into epoch ms.
export function localInputToMs(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export function formatLocalInput(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Earliest minute-aligned time that is still at least one full minute ahead.
// Rounding UP (not truncating) is essential near the end of a minute:
// at 10:30:59 this must yield 10:32, not an already-expired 10:31.
export function earliestSendAtMs(now = Date.now()) {
  return Math.ceil((now + 60 * 1000) / (60 * 1000)) * (60 * 1000);
}

export function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
