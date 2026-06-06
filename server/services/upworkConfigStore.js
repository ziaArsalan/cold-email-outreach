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

module.exports = { readConfig, writeConfig };
