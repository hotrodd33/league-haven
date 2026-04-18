import { useState } from 'react';
import { resetPassword } from '../api/index.js';
import { Button, Card, CardBody, Input } from './ui';

export default function ResetPassword({ token, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError(null);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
      <Card variant="signal" className="w-full max-w-md">
        <CardBody className="p-8">
          <h1 className="font-display text-3xl font-bold mb-1 tracking-wide text-chrome-300">LeagueHaven</h1>

          {success ? (
            <div>
              <div className="lh-alert lh-alert-success mb-4">
                Password has been reset successfully!
              </div>
              <Button size="sm" onClick={onDone} className="w-full">
                Go to Sign In
              </Button>
            </div>
          ) : (
            <>
              <p className="text-gray-400 mb-6 text-sm">Choose a new password</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="New Password"
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8+ chars, upper, lower, number"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  helper="At least 8 characters with uppercase, lowercase, and a number"
                />
                <Input
                  label="Confirm Password"
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                {error && <div className="lh-alert lh-alert-error">{error}</div>}
                <Button type="submit" size="sm" loading={loading} className="w-full">
                  {loading ? 'Resetting…' : 'Reset Password'}
                </Button>
                <Button variant="ghost" size="sm" onClick={onDone} className="w-full">
                  Back to sign in
                </Button>
              </form>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
