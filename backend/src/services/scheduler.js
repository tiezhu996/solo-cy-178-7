const LetterModel = require('../models/letterModel');
const { SCHEDULER } = require('../config/constants');

// Polls for scheduled letters whose time has come and flips them into the
// receiver's inbox. Delivery is a single atomic UPDATE, so restarting the
// process simply delivers any letters that came due while it was down.
function startScheduler() {
  const tick = () => {
    try {
      const ids = LetterModel.deliverDue(Date.now());
      if (ids.length) {
        console.log(`[scheduler] delivered ${ids.length} scheduled letter(s): ${ids.join(', ')}`);
      }
    } catch (err) {
      console.error('[scheduler] tick failed:', err);
    }
  };
  tick();
  return setInterval(tick, SCHEDULER.TICK_MS);
}

module.exports = { startScheduler };
