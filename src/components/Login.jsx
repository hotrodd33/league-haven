import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { forgotPassword, resendConfirmation } from '../api/index.js';

const inputCls = "w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1";

export default function Login({ onResetPassword }) {
  const { login, loading, error } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'forgot'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  const isUnconfirmed = error && error.toLowerCase().includes('confirm your email');

  async function handleLogin(e) {
    e.preventDefault();
    setResendMsg('');
    try { await login(username, password); } catch { /* context sets error */ }
  }

  async function handleResendConfirmation() {
    const emailToResend = username.includes('@') ? username : '';
    if (!emailToResend) {
      setResendMsg('Please enter your email address in the username field to resend.');
      return;
    }
    try {
      const result = await resendConfirmation(emailToResend);
      setResendMsg(result.message || 'Confirmation email resent!');
    } catch (err) {
      setResendMsg(err.message);
    }
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
    <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
      <div className="bg-gray-800 rounded-lg shadow-card p-8 w-full max-w-md border-t-4 border-baseball-600">
        <h1 className="font-heading text-3xl font-bold mb-1 tracking-wide text-blue-300">⚾ ZVBL</h1>
        <p className="text-gray-400 mb-6 text-sm">
          {mode === 'login' ? 'Sign in to manage your team' : 'Reset your password'}
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
            {error && (
              <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">
                {error}
                {isUnconfirmed && (
                  <button type="button" onClick={handleResendConfirmation}
                    className="block mt-2 text-xs text-blue-400 hover:underline">
                    Resend confirmation email
                  </button>
                )}
              </div>
            )}
            {resendMsg && (
              <div className="bg-blue-900/30 text-blue-400 text-sm px-3 py-2 rounded-lg">{resendMsg}</div>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <div className="flex justify-between text-sm">
              <button type="button" onClick={() => { setMode('forgot'); setForgotMsg(''); }} className="text-blue-400 hover:underline">
                Forgot password?
              </button>
              <button type="button" onClick={() => { window.location.href = '?register'; }} className="text-blue-400 hover:underline">
                Create an account →
              </button>
            </div>
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
              <div className="bg-blue-900/30 text-blue-400 text-sm px-3 py-2 rounded-lg">{forgotMsg}</div>
            )}
            <button type="submit" disabled={forgotLoading}
              className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm">
              {forgotLoading ? 'Sending…' : 'Send Reset Link'}
            </button>
            <button type="button" onClick={() => setMode('login')} className="w-full text-center text-sm text-blue-400 hover:underline">
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
