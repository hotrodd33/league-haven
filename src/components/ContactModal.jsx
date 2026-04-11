import { useState, useEffect } from 'react';
import { fetchContactRecipients, sendContactEmail } from '../api';

const labelCls = 'block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1';
const inputCls = 'w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';

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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-5 sm:p-6 my-4">

        <h2 className="text-xl font-bold mb-1">
          Send Email
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          To: {scopeLabel || SCOPE_LABELS[scope]}
        </p>

        {success ? (
          <div>
            <div className="bg-green-900/30 text-green-400 text-sm px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {success}
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={onClose}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Recipient preview */}
            <div>
              <button type="button"
                onClick={() => setShowRecipients(!showRecipients)}
                className="text-sm text-blue-400 hover:text-blue-200 font-medium flex items-center gap-1">
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

            <div>
              <label className={labelCls}>Subject</label>
              <input className={inputCls} value={subject}
                onChange={e => setSubject(e.target.value)} required placeholder="Email subject" />
            </div>

            <div>
              <label className={labelCls}>Message</label>
              <textarea className={`${inputCls} min-h-[140px] resize-y`} value={body}
                onChange={e => setBody(e.target.value)} required placeholder="Type your message…" rows={6} />
            </div>

            {error && (
              <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600">
                Cancel
              </button>
              <button type="submit"
                disabled={sending || recipients.length === 0}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                {sending && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                Send Email
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
