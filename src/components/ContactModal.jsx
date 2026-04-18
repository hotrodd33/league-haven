import { useState, useEffect } from 'react';
import { fetchContactRecipients, sendContactEmail } from '../api';
import { Button, Input, Modal } from './ui';

const SCOPE_LABELS = {
  individual: 'Individual',
  team: 'Team',
  org: 'Organization',
  league: 'Entire League',
};

export default function ContactModal({ scope, scopeId, scopeLabel, onClose }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRecipients, setShowRecipients] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchContactRecipients(scope, scopeId)
      .then(data => setRecipients(data.recipients || []))
      .catch(() => setError('Failed to load recipients'))
      .finally(() => setLoading(false));
  }, [scope, scopeId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      const result = await sendContactEmail({ scope, scopeId, subject, body });
      if (result.error) { setError(result.error); return; }
      setSuccess(`Email sent to ${result.recipientCount} recipient${result.recipientCount === 1 ? '' : 's'}`);
    } catch {
      setError('Failed to send email');
    } finally {
      setSending(false);
    }
  }

  const roleLabel = (r) => {
    if (!r) return '';
    return r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Send Email"
      footer={
        success ? (
          <div className="flex justify-end">
            <Button size="sm" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              loading={sending}
              disabled={sending || recipients.length === 0}
              onClick={() => document.getElementById('contact-form').requestSubmit()}
            >
              Send Email
            </Button>
          </div>
        )
      }
    >
      <p className="text-sm text-gray-400 mb-4">
        To: {scopeLabel || SCOPE_LABELS[scope]}
      </p>

      {success ? (
        <div className="lh-alert lh-alert-success flex items-center gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {success}
        </div>
      ) : (
        <form id="contact-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Recipient preview */}
          <div>
            <button type="button"
              onClick={() => setShowRecipients(!showRecipients)}
              className="text-sm text-chrome-400 hover:text-chrome-200 font-medium flex items-center gap-1">
              <svg className={`w-4 h-4 transition-transform ${showRecipients ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {loading ? 'Loading recipients…' : `${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`}
            </button>
            {showRecipients && recipients.length > 0 && (
              <div className="mt-2 bg-gray-900 rounded-lg p-3 max-h-40 overflow-y-auto">
                {recipients.map((r, i) => (
                  <div key={i} className="text-sm py-0.5 flex items-center justify-between">
                    <span className="text-gray-200">{r.name}</span>
                    {r.role && <span className="text-xs text-gray-400 ml-2">{roleLabel(r.role)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Input
            label="Subject"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            required
            placeholder="Email subject"
          />

          <div>
            <label className="eyebrow block mb-1">Message</label>
            <textarea
              className="lh-input min-h-[140px] resize-y"
              value={body}
              onChange={e => setBody(e.target.value)}
              required
              placeholder="Type your message…"
              rows={6}
            />
          </div>

          {error && (
            <div className="lh-alert lh-alert-error">{error}</div>
          )}
        </form>
      )}
    </Modal>
  );
}
