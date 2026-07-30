import axios from 'axios'

// API base:
// - explicit override wins (REACT_APP_API_URL, set at build time), else
// - in production the frontend is served by the same server as the API, so use
//   a same-origin relative path, else
// - local dev hits the dev server on :8080.
const isLocalHost =
  typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)

export const API =
  process.env.REACT_APP_API_URL ||
  (isLocalHost ? 'http://localhost:8080/api' : '/api')

// Restore token on page load
const _savedToken = localStorage.getItem('token')
if (_savedToken)
  axios.defaults.headers.common['Authorization'] = 'Bearer ' + _savedToken

// 401 handler — registered by the App component (setUnauthorizedHandler).
let _onUnauthorized = null
export const setUnauthorizedHandler = (fn) => {
  _onUnauthorized = fn
}

// Request interceptor — re-reads token each call
axios.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('token')
  if (t) cfg.headers = cfg.headers || {}
  if (t) cfg.headers['Authorization'] = 'Bearer ' + t
  return cfg
})

// Response interceptor — redirect to login on 401 (except the login route itself)
axios.interceptors.response.use(
  (r) => r,
  (err) => {
    if (
      err.response?.status === 401 &&
      !err.config?.url?.endsWith('/auth/login')
    ) {
      localStorage.removeItem('token')
      delete axios.defaults.headers.common['Authorization']
      if (_onUnauthorized) _onUnauthorized()
    }
    return Promise.reject(err)
  },
)

export default axios
