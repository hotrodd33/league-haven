import { useState } from 'react';
import { changePassword } from '../api/index.js';
import { Button, Input, Modal } from './ui';

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
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Change Password"
      footer={
        !success && (
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={loading} onClick={() => document.getElementById('change-pwd-form').requestSubmit()}>
              {loading ? 'Changing…' : 'Change Password'}
            </Button>
          </div>
        )
      }
    >
      {success ? (
        <div className="lh-alert lh-alert-success">
          Password changed successfully!
        </div>
      ) : (
        <form id="change-pwd-form" onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Current Password"
            id="cur-pwd"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Input
            label="New Password"
            id="new-pwd"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="8+ chars, upper, lower, number"
            required
            minLength={8}
            autoComplete="new-password"
            helper="At least 8 characters with uppercase, lowercase, and a number"
          />
          <Input
            label="Confirm New Password"
            id="confirm-pwd"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          {error && <div className="lh-alert lh-alert-error">{error}</div>}
        </form>
      )}
    </Modal>
  );
}
