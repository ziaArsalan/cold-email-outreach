// Pipeline: for each keyword → fetch → dedupe → proposal → append → mark seen.
// Per-job try/catch so one failure never aborts the whole cycle. A job is only
// marked seen AFTER a successful sheet append.

const config = require('./config');
const seenStore = require('./seenStore');
const { fetchJobs } = require('../services/upworkFetch');
const { generateProposal } = require('../services/proposalService');
const { appendJobRow } = require('../services/upworkSheet');
const { readConfig, readDailyCount, incrementDailyCount } = require('../services/upworkConfigStore');

const dedupeKey = (job) => job.id || job.url || '';

const runCycle = async () => {
  // Live config read each cycle so UI-editable controls take effect without a restart.
  const live = readConfig();
  const keywords = live.keywords
    ? live.keywords.split(',').map((k) => k.trim()).filter(Boolean)
    : config.KEYWORDS;
  const autoCover = live.autoCover ?? config.AUTO_COVER;
  const cronEnabled = live.cronEnabled ?? true;
  const scheduleEnabled = live.scheduleEnabled ?? false;
  const scheduleStart = live.scheduleStart || '09:00';
  const scheduleEnd = live.scheduleEnd || '18:00';
  const dailyLimit = live.dailyLimit ?? 0;

  // Guard 1: cron toggle
  if (!cronEnabled) {
    console.log('[upworkMonitor] cron disabled — skipping cycle');
    return;
  }

  // Guard 2: time-window
  if (scheduleEnabled) {
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    const toMins = (hhmm) => {
      const [h, m] = hhmm.split(':').map(Number);
      return h * 60 + m;
    };
    const startMins = toMins(scheduleStart);
    const endMins = toMins(scheduleEnd);
    const inWindow = startMins <= endMins
      ? nowMins >= startMins && nowMins <= endMins
      : nowMins >= startMins || nowMins <= endMins; // overnight window
    if (!inWindow) {
      console.log(`[upworkMonitor] outside active window (${scheduleStart}–${scheduleEnd}) — skipping`);
      return;
    }
  }

  console.log(`[upworkMonitor] cycle start — source=${config.UPWORK_SOURCE} keywords=${keywords.length}`);

  for (const keyword of keywords) {
    let jobs = [];
    try {
      jobs = await fetchJobs(keyword);
    } catch (err) {
      console.error(`[upworkMonitor] fetch failed for "${keyword}": ${err.message}`);
      continue;
    }

    for (const job of jobs) {
      const key = dedupeKey(job);

      if (!key) {
        console.warn(`[upworkMonitor] [${keyword}] skipped — job has no id/url`);
        continue;
      }

      if (seenStore.has(key)) {
        console.log(`[upworkMonitor] [${keyword}] skipped (seen) — ${job.title}`);
        continue;
      }

      // Guard 3: per-job daily limit (counts every appended job, cover or not).
      const todayCount = readDailyCount();
      if (dailyLimit > 0 && todayCount >= dailyLimit) {
        console.log(`[upworkMonitor] daily limit reached (${todayCount}/${dailyLimit}) — skipping`);
        return;
      }

      try {
        if (autoCover) {
          const coverLetter = await generateProposal(job);
          await appendJobRow(job, coverLetter);
          incrementDailyCount();
          console.log(`[upworkMonitor] [${keyword}] NEW — ${job.title}`);
        } else {
          await appendJobRow(job, '');
          incrementDailyCount();
          console.log(`[upworkMonitor] [${keyword}] NEW (no cover — auto-cover off) — ${job.title}`);
        }
        seenStore.add(key);
        seenStore.persist();
      } catch (err) {
        console.error(`[upworkMonitor] [${keyword}] FAILED — ${job.title}: ${err.message}`);
      }
    }
  }

  console.log('[upworkMonitor] cycle complete');
};

module.exports = { runCycle };
