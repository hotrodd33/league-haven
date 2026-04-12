import { useState } from 'react';
import { resetPassword } from '../api/index.js';

const inputCls = "w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1";

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
      <div className="bg-gray-800 rounded-lg shadow-card p-8 w-full max-w-md border-t-4 border-baseball-600">
        <h1 className="font-heading text-3xl font-bold mb-1 tracking-wide text-blue-300">⚾ ZVBL</h1>

        {success ? (
          <div>
            <div className="bg-green-900/30 text-green-400 text-sm px-3 py-2 rounded-lg mb-4">
              Password has been reset successfully!
            </div>
            <button onClick={onDone}
              className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors text-sm">
              Go to Sign In
            </button>
          </div>
        ) : (
          <>
            <p className="text-gray-400 mb-6 text-sm">Choose a new password</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="new-password" className={labelCls}>New Password</label>
                <input id="new-password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8+ chars, upper, lower, number" required minLength={8}
                  autoComplete="new-password" className={inputCls} />
                <p className="text-xs text-gray-500 mt-1">At least 8 characters with uppercase, lowercase, and a number</p>
              </div>
              <div>
                <label htmlFor="confirm-password" className={labelCls}>Confirm Password</label>
                <input id="confirm-password" type="password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter password" required minLength={8}
                  autoComplete="new-password" className={inputCls} />
              </div>
              {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm">
                {loading ? 'Resetting…' : 'Reset Password'}
              </button>
              <button type="button" onClick={onDone}
                className="w-full text-center text-sm text-blue-400 hover:underline">
                Back to sign in
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
