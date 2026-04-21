import { useState } from 'react';
import { Modal, Button, Input } from './ui/index.js';
import { reportBug } from '../api/index.js';

const AREAS = [
  'Dashboard',
  'Schedule / Games',
  'Teams / Rosters',
  'Players',
  'Standings',
  'Announcements',
  'User Management',
  'Data Manager / Import',
  'Organizations',
  'Officials / Umpires',
  'Fields / Locations',
  'Travel Matrix',
  'My Account',
  'Login / Registration',
  'Other',
];

export default function BugReportModal({ onClose }) {
  const [form, setForm] = useState({ description: '', area: '', steps: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.description.trim()) return;
    setSubmitting(true); setError(null);
    try {
      await reportBug({
        description: form.description.trim(),
        area: form.area || null,
        steps: form.steps.trim() || null,
        url: window.location.href,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Failed to send. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Report a Bug" size="md">
      {submitted ? (
        <div className="py-6 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h3 className="text-lg font-semibold text-white mb-1">Thanks for the report!</h3>
          <p className="text-sm text-gray-400 mb-6">Your bug report has been sent to the development team.</p>
          <Button onClick={onClose}>Close</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-400">Spotted something broken? Let us know and we'll get it fixed.</p>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Area / Page</label>
            <select
              name="area"
              value={form.area}
              onChange={handleChange}
              className="lh-input"
            >
              <option value="">Select an area…</option>
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              What went wrong? <span className="text-signal-400">*</span>
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              required
              rows={4}
              placeholder="Describe the bug — what did you see vs. what you expected…"
              className="lh-input resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Steps to reproduce <span className="text-gray-500 font-normal">(optional)</span></label>
            <textarea
              name="steps"
              value={form.steps}
              onChange={handleChange}
              rows={3}
              placeholder="1. Go to…&#10;2. Click on…&#10;3. See error"
              className="lh-input resize-none"
            />
          </div>

          {error && <div className="lh-alert lh-alert-error">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting || !form.description.trim()} loading={submitting}>
              {submitting ? 'Sending…' : 'Send Report'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
