// Local dedupe store of processed job IDs. Survives restarts via a JSON file.
// File is gitignored (server/data/).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'seenJobs.json');

let seen = loadInitial();

function loadInitial() {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (_) {
    // Missing file or bad JSON → start empty.
    return new Set();
  }
}

const has = (id) => seen.has(id);

const add = (id) => {
  seen.add(id);
};

const persist = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify([...seen], null, 2), 'utf8');
};

module.exports = { has, add, persist };
