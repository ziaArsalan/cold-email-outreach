// Pipeline: for each keyword → fetch → dedupe → proposal → append → mark seen.
// Per-job try/catch so one failure never aborts the whole cycle. A job is only
// marked seen AFTER a successful sheet append.

const config = require('./config');
const seenStore = require('./seenStore');
const { fetchJobs } = require('../services/upworkFetch');
const { generateProposal } = require('../services/proposalService');
const { appendJobRow } = require('../services/upworkSheet');

const dedupeKey = (job) => job.id || job.url || '';

const runCycle = async () => {
  console.log(`[upworkMonitor] cycle start — source=${config.UPWORK_SOURCE} keywords=${config.KEYWORDS.length}`);

  for (const keyword of config.KEYWORDS) {
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

      try {
        if (config.AUTO_COVER) {
          const coverLetter = await generateProposal(job);
          await appendJobRow(job, coverLetter);
          console.log(`[upworkMonitor] [${keyword}] NEW — ${job.title}`);
        } else {
          await appendJobRow(job, '');
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
