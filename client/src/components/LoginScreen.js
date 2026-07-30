import React, { useState } from 'react'
import axios, { API } from '../api'

export default function LoginScreen({ onSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.post(`${API}/auth/login`, {
        email,
        password,
      })
      localStorage.setItem('token', data.token)
      axios.defaults.headers.common['Authorization'] = 'Bearer ' + data.token
      onSuccess()
    } catch {
      setError('Invalid email or password')
    }
    setLoading(false)
  }

  return (
    <div className='login-screen'>
      <div className='login-card'>
        <div className='login-logo'>
          <span className='logo-d'>D</span>
          <div className='login-logo-text'>
            <span>Devtronics</span>
            <small>Outreach</small>
          </div>
        </div>
        <h2 className='login-title'>Sign in</h2>
        <form onSubmit={handleLogin} className='login-form'>
          <div className='login-field'>
            <label>Email</label>
            <input
              type='email'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder='admin@example.com'
              required
              autoFocus
            />
          </div>
          <div className='login-field'>
            <label>Password</label>
            <input
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder='••••••••'
              required
            />
          </div>
          {error && <div className='login-error'>{error}</div>}
          <button
            className='btn-start login-btn'
            type='submit'
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
