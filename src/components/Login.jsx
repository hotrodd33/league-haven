import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { forgotPassword } from '../api/index.js';

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600";
const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";

export default function Login({ onResetPassword }) {
  const { login, register, loading, error } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    try { await login(username, password); } catch { /* context sets error */ }
  }

  async function handleRegister(e) {
    e.preventDefault();
    try { await register(username, password, name, email); } catch { /* context sets error */ }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setForgotLoading(true); setForgotMsg('');
    try {
      const result = await forgotPassword(forgotEmail);
      setForgotMsg(result.message || 'If that email exists, a reset link has been sent.');
    } catch (err) { setForgotMsg(err.message); }
    finally { setForgotLoading(false); }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-md border-t-4 border-baseball-600">
        <h1 className="font-heading text-3xl font-bold mb-1 tracking-wide text-blue-800">⚾ ZVBL</h1>
        <p className="text-gray-500 mb-6 text-sm">
          {mode === 'login' ? 'Sign in to manage your team' : mode === 'register' ? 'Create your account' : 'Reset your password'}
        </p>

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="username" className={labelCls}>Username or Email</label>
              <input id="username" type="text" value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your username or email" required autoComplete="username"
                className={inputCls} />
            </div>
            <div>
              <label htmlFor="password" className={labelCls}>Password</label>
              <input id="password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password" required autoComplete="current-password"
                className={inputCls} />
            </div>
            {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-blue-800 text-white font-semibold rounded-lg hover:bg-blue-900 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <div className="flex justify-between text-sm">
              <button type="button" onClick={() => { setMode('forgot'); setForgotMsg(''); }} className="text-blue-700 hover:underline">
                Forgot password?
              </button>
              <button type="button" onClick={() => setMode('register')} className="text-blue-700 hover:underline">
                Create account
              </button>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-name" className={labelCls}>Full Name</label>
                <input id="reg-name" type="text" value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe" required className={inputCls} />
              </div>
              <div>
                <label htmlFor="reg-email" className={labelCls}>Email</label>
                <input id="reg-email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" required className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="reg-username" className={labelCls}>Username</label>
              <input id="reg-username" type="text" value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username" required autoComplete="username"
                className={inputCls} />
            </div>
            <div>
              <label htmlFor="reg-password" className={labelCls}>Password</label>
              <input id="reg-password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters" required minLength={6} autoComplete="new-password"
                className={inputCls} />
            </div>
            {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-blue-800 text-white font-semibold rounded-lg hover:bg-blue-900 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm">
              {loading ? 'Creating account…' : 'Register'}
            </button>
            <p className="text-xs text-gray-400 text-center">
              You'll start as a Score Reporter. An admin will assign your team permissions.
            </p>
            <button type="button" onClick={() => setMode('login')} className="w-full text-center text-sm text-blue-700 hover:underline">
              Already have an account? Sign in
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className={labelCls}>Email Address</label>
              <input id="forgot-email" type="email" value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com" required className={inputCls} />
            </div>
            {forgotMsg && (
              <div className="bg-blue-50 text-blue-700 text-sm px-3 py-2 rounded-lg">{forgotMsg}</div>
            )}
            <button type="submit" disabled={forgotLoading}
              className="w-full py-2.5 bg-blue-800 text-white font-semibold rounded-lg hover:bg-blue-900 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm">
              {forgotLoading ? 'Sending…' : 'Send Reset Link'}
            </button>
            <button type="button" onClick={() => setMode('login')} className="w-full text-center text-sm text-blue-700 hover:underline">
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
