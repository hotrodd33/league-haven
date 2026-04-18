import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { forgotPassword, resendConfirmation } from '../api/index.js';
import { Button, Card, CardBody, Input } from './ui';

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
      <Card variant="signal" className="w-full max-w-md">
        <CardBody className="p-8">
          <h1 className="font-display text-3xl font-bold mb-1 tracking-wide text-chrome-300">⚾ LeagueHaven</h1>
          <p className="text-gray-400 mb-6 text-sm">
            {mode === 'login' ? 'Sign in to manage your team' : 'Reset your password'}
          </p>

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                label="Username or Email"
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your username or email"
                required
                autoComplete="username"
              />
              <Input
                label="Password"
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                autoComplete="current-password"
              />
              {error && (
                <div className="lh-alert lh-alert-error">
                  {error}
                  {isUnconfirmed && (
                    <button type="button" onClick={handleResendConfirmation}
                      className="block mt-2 text-xs text-chrome-400 hover:underline">
                      Resend confirmation email
                    </button>
                  )}
                </div>
              )}
              {resendMsg && (
                <div className="lh-alert lh-alert-info">{resendMsg}</div>
              )}
              <Button type="submit" size="sm" loading={loading} className="w-full">
                {loading ? 'Signing in…' : 'Sign In'}
              </Button>
              <div className="flex justify-between text-sm">
                <Button variant="ghost" size="xs" onClick={() => { setMode('forgot'); setForgotMsg(''); }}>
                  Forgot password?
                </Button>
                <Button variant="ghost" size="xs" onClick={() => { window.location.href = '?register'; }}>
                  Create an account →
                </Button>
              </div>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <Input
                label="Email Address"
                id="forgot-email"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
              {forgotMsg && (
                <div className="lh-alert lh-alert-info">{forgotMsg}</div>
              )}
              <Button type="submit" size="sm" loading={forgotLoading} className="w-full">
                {forgotLoading ? 'Sending…' : 'Send Reset Link'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMode('login')} className="w-full">
                Back to sign in
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
