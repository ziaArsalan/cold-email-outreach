// Persisted UI-editable config for the Upwork monitor. Stored as JSON in
// server/data/upworkConfig.json (gitignored via server/data/). The config
// fallback chain in jobs/config.js reads this between env vars and defaults.

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(CONFIG_DIR, 'upworkConfig.json');

// Shape: { actorId, keywords, cronInterval, autoCover }
const readConfig = () => {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
};

const writeConfig = (obj) => {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(obj, null, 2));
};

const today = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// Daily count resets automatically when the stored date is not today.
const readDailyCount = () => {
  const stored = readConfig();
  if (stored.dailyCountDate !== today()) return 0;
  return stored.dailyCount || 0;
};

// Increments (and resets on a new day) the count of jobs appended today.
// Writes the FULL config back so other fields are preserved.
const incrementDailyCount = () => {
  const stored = readConfig();
  let count = stored.dailyCount || 0;
  let date = stored.dailyCountDate;
  if (date !== today()) {
    count = 0;
    date = today();
  }
  count += 1;
  writeConfig({ ...stored, dailyCount: count, dailyCountDate: date });
  return count;
};

module.exports = { readConfig, writeConfig, today, readDailyCount, incrementDailyCount };
