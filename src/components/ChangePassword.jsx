import { useState } from 'react';
import { changePassword } from '../api/index.js';

const inputCls = "lh-input";
const labelCls = "eyebrow block mb-1";

export default function ChangePassword({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPassword !== confirm) { setError('New passwords do not match'); return; }
    setLoading(true); setError(null);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-5 sm:p-6 my-4">
        <h2 className="text-xl font-heading font-bold text-white mb-4">Change Password</h2>

        {success ? (
          <div className="lh-alert lh-alert-success">
            Password changed successfully!
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="cur-pwd" className={labelCls}>Current Password</label>
              <input id="cur-pwd" type="password" value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required autoComplete="current-password" className={inputCls} />
            </div>
            <div>
              <label htmlFor="new-pwd" className={labelCls}>New Password</label>
              <input id="new-pwd" type="password" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="8+ chars, upper, lower, number" required minLength={8}
                autoComplete="new-password" className={inputCls} />
              <p className="text-xs text-gray-500 mt-1">At least 8 characters with uppercase, lowercase, and a number</p>
            </div>
            <div>
              <label htmlFor="confirm-pwd" className={labelCls}>Confirm New Password</label>
              <input id="confirm-pwd" type="password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required minLength={8} autoComplete="new-password" className={inputCls} />
            </div>
            {error && <div className="lh-alert lh-alert-error">{error}</div>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="btn btn-sm btn-primary disabled:opacity-50">
                {loading ? 'Changing…' : 'Change Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
