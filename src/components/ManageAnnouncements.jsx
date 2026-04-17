import { useState, useEffect, useCallback } from 'react';
import { cn } from '../lib/cn.js';
import { fetchAllAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../api/index.js';
import { Button, Modal, Badge } from './ui/index.js';
import { PlusIcon, MegaphoneIcon, TrashIcon, PencilIcon } from './ui/icons.jsx';

const inputCls = 'w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-control text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-action-500/30 focus:border-action-600';
const labelCls = 'block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'text-gray-400' },
  { value: 'normal', label: 'Normal', color: 'text-blue-400' },
  { value: 'high', label: 'High', color: 'text-amber-400' },
  { value: 'urgent', label: 'Urgent', color: 'text-red-400' },
];

const PRIORITY_BADGE = {
  low: 'bg-gray-700 text-gray-300',
  normal: 'bg-blue-900/40 text-blue-300',
  high: 'bg-amber-900/40 text-amber-300',
  urgent: 'bg-red-900/40 text-red-300',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ManageAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('normal');
  const [isActive, setIsActive] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchAllAnnouncements();
      setAnnouncements(data || []);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setTitle('');
    setBody('');
    setPriority('normal');
    setIsActive(true);
    setExpiresAt('');
    setError('');
    setShowForm(true);
  }

  function openEdit(a) {
    setEditing(a);
    setTitle(a.title);
    setBody(a.body);
    setPriority(a.priority);
    setIsActive(a.is_active);
    setExpiresAt(a.expires_at ? new Date(a.expires_at).toISOString().slice(0, 16) : '');
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        priority,
        is_active: isActive,
        expires_at: expiresAt || null,
      };
      if (editing) {
        await updateAnnouncement(editing.id, payload);
      } else {
        await createAnnouncement(payload);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save announcement.');
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    setSaving(true);
    try {
      await deleteAnnouncement(id);
      setDeleting(null);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete announcement.');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MegaphoneIcon className="w-6 h-6 text-blue-400" />
          <h2 className="text-xl font-heading font-bold text-gray-100">Announcements</h2>
          <span className="text-xs text-gray-500">({announcements.length})</span>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate}>
          <PlusIcon className="w-4 h-4 mr-1.5" />
          New Announcement
        </Button>
      </div>

      {/* List */}
      {announcements.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <MegaphoneIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No announcements yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map(a => {
            const expired = a.expires_at && new Date(a.expires_at) < new Date();
            return (
              <div
                key={a.id}
                className={cn(
                  'rounded-xl border px-5 py-4 bg-gray-800/60',
                  !a.is_active || expired ? 'border-gray-700 opacity-60' : 'border-gray-600',
                )}
              >
                <div className="flex items-start gap-3">
                  <MegaphoneIcon className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-gray-100">{a.title}</h4>
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', PRIORITY_BADGE[a.priority])}>
                        {a.priority}
                      </span>
                      {!a.is_active && (
                        <Badge variant="neutral" size="sm">Inactive</Badge>
                      )}
                      {expired && (
                        <Badge variant="neutral" size="sm">Expired</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap line-clamp-3">{a.body}</p>
                    <p className="text-[10px] text-gray-500 mt-2">
                      {a.author_name && `By ${a.author_name} · `}
                      {timeAgo(a.created_at)}
                      {a.expires_at && ` · Expires ${new Date(a.expires_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(a)}
                      className="p-1.5 text-gray-400 hover:text-blue-400 rounded-lg hover:bg-gray-700 transition-colors"
                      title="Edit"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleting(a)}
                      className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-gray-700 transition-colors"
                      title="Delete"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        size="lg"
        title={editing ? 'Edit Announcement' : 'New Announcement'}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Publish'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</div>
          )}

          <div>
            <label className={labelCls}>Title</label>
            <input
              className={inputCls}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Announcement title"
              maxLength={200}
              required
            />
          </div>

          <div>
            <label className={labelCls}>Body</label>
            <textarea
              className={cn(inputCls, 'min-h-[120px] resize-y')}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Announcement content…"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Priority</label>
              <select
                className={inputCls}
                value={priority}
                onChange={e => setPriority(e.target.value)}
              >
                {PRIORITY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Expires At (optional)</label>
              <input
                type="datetime-local"
                className={inputCls}
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500/30"
            />
            <span className="text-sm text-gray-300">Active (visible to users)</span>
          </label>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        size="sm"
        title="Delete Announcement"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={() => handleDelete(deleting?.id)} disabled={saving}>
              {saving ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-300">
          Are you sure you want to delete "<strong>{deleting?.title}</strong>"? This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
