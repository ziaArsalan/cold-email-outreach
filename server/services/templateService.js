// Pure template rendering — no Mongo, no side effects.
// Vars are supplied by the caller; substitution is dumb string replacement.

const VAR_RE = /{{\s*(\w+)\s*}}/g

// Replace every {{ var }} with vars[var]; missing/unknown → ''
const render = (body, vars = {}) =>
  String(body ?? '').replace(VAR_RE, (_, key) => vars[key] ?? '')

// De-duplicated list of var names referenced in a template body
const extractVars = (body) => {
  const names = []
  const text = String(body ?? '')
  let m
  VAR_RE.lastIndex = 0
  while ((m = VAR_RE.exec(text)) !== null) {
    if (!names.includes(m[1])) names.push(m[1])
  }
  return names
}

module.exports = { render, extractVars }
