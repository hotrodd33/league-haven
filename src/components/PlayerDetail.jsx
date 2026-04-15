import { useState, useEffect, useCallback } from 'react';
import {
  fetchPlayerContacts, createPlayerContact, updatePlayerContact, deletePlayerContact,
  fetchPlayerNotes, createPlayerNote, updatePlayerNote, deletePlayerNote,
  fetchPlayerDocuments, uploadPlayerDocument, downloadPlayerDocument, deletePlayerDocument,
  fetchPlayerStats, fetchStatDefinitions,
} from '../api/index.js';
import { ChevronLeftIcon, PlusIcon, TrashIcon, PencilIcon, DocumentIcon, ChatBubbleIcon, UserIcon, ChartBarIcon } from './ui/icons.jsx';

const TABS = [
  { key: 'info', label: 'Info' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'stats', label: 'Stats' },
  { key: 'documents', label: 'Documents' },
  { key: 'notes', label: 'Notes' },
];

export default function PlayerDetail({ player, onBack, onNavigateToTeam, canEdit = true }) {
  const [tab, setTab] = useState('info');

  if (!player) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
          <ChevronLeftIcon className="w-5 h-5 text-gray-400" />
        </button>
        <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
          <UserIcon className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{player.first_name} {player.last_name}</h2>
          <p className="text-sm text-gray-400">
            {player.teams?.length ? player.teams.map(t => t.name || t.team_name).join(', ') : 'No team'}
          </p>
        </div>
        {!canEdit && (
          <span className="ml-auto text-xs bg-gray-700 text-gray-400 px-2 py-1 rounded-full">View Only</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-700 pb-px">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'info' && <InfoTab player={player} onNavigateToTeam={onNavigateToTeam} />}
      {tab === 'contacts' && <ContactsTab playerId={player.id} canEdit={canEdit} />}
      {tab === 'stats' && <StatsTab playerId={player.id} />}
      {tab === 'documents' && <DocumentsTab playerId={player.id} canEdit={canEdit} />}
      {tab === 'notes' && <NotesTab playerId={player.id} canEdit={canEdit} />}
    </div>
  );
}

/* ─── Info Tab ─── */
function InfoTab({ player, onNavigateToTeam }) {
  function calculateAge(dob) {
    if (!dob) return null;
    const birth = new Date(dob);
    return Math.floor((Date.now() - birth.getTime()) / (365.25 * 86400000));
  }

  const age = calculateAge(player.date_of_birth);

  const fields = [
    { label: 'Date of Birth', value: player.date_of_birth || '—' },
    { label: 'Age', value: age != null ? age : '—' },
    { label: 'Grade', value: player.grade || '—' },
    { label: 'Bats / Throws', value: `${player.batting_hand || '—'} / ${player.throwing_hand || '—'}` },
    { label: 'Positions', value: player.positions?.length ? player.positions.map(p => p.abbreviation).join(', ') : '—' },
    { label: 'Parent Email', value: player.parent_email || '—' },
    { label: 'Parent Phone', value: player.parent_phone || '—' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Player Info</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {fields.map(f => (
            <div key={f.label}>
              <dt className="text-xs text-gray-500">{f.label}</dt>
              <dd className="text-sm text-white">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Teams */}
      {player.teams?.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Teams</h3>
          <div className="space-y-2">
            {player.teams.map(t => (
              <button
                key={t.team_id || t.id}
                className="flex items-center justify-between w-full px-3 py-2 bg-gray-700/40 rounded-lg hover:bg-gray-700/60 transition-colors text-left"
                onClick={() => onNavigateToTeam?.(t.team_id || t.id, t.org_id)}
              >
                <span className="text-sm text-white">{t.team_name || t.name}</span>
                {t.jersey_number && (
                  <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">#{t.jersey_number}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Contacts Tab ─── */
function ContactsTab({ playerId, canEdit }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetchPlayerContacts(playerId).then(setContacts).catch(console.error).finally(() => setLoading(false));
  }, [playerId]);

  useEffect(load, [load]);

  function handleSaved() { setShowForm(false); setEditing(null); load(); }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Contacts</h3>
        {canEdit && (
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>

      {!contacts.length && !showForm && (
        <p className="text-sm text-gray-500 py-4 text-center">No contacts added yet</p>
      )}

      {contacts.map(c => (
        <div key={c.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-white">{c.first_name} {c.last_name}</p>
                <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full capitalize">{c.relationship}</span>
                {c.is_primary && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full">Primary</span>}
              </div>
              {c.email && <p className="text-sm text-gray-400 mt-1">{c.email}</p>}
              {c.phone && <p className="text-sm text-gray-400">{c.phone}</p>}
              {c.notes && <p className="text-xs text-gray-500 mt-1 italic">{c.notes}</p>}
            </div>
            {canEdit && (
              <div className="flex gap-1">
                <button onClick={() => { setEditing(c); setShowForm(true); }} className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors">
                  <PencilIcon className="w-4 h-4 text-gray-400" />
                </button>
                <button onClick={async () => {
                  if (!confirm('Remove this contact?')) return;
                  await deletePlayerContact(playerId, c.id);
                  load();
                }} className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors">
                  <TrashIcon className="w-4 h-4 text-red-400" />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}

      {showForm && (
        <ContactForm
          playerId={playerId}
          contact={editing}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function ContactForm({ playerId, contact, onSaved, onCancel }) {
  const [form, setForm] = useState({
    first_name: contact?.first_name || '',
    last_name: contact?.last_name || '',
    relationship: contact?.relationship || 'parent',
    email: contact?.email || '',
    phone: contact?.phone || '',
    is_primary: contact?.is_primary || false,
    notes: contact?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (contact) {
        await updatePlayerContact(playerId, contact.id, form);
      } else {
        await createPlayerContact(playerId, form);
      }
      onSaved();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input placeholder="First Name *" required value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} className={inputCls} />
        <input placeholder="Last Name *" required value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className={inputCls} />
        <select value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))} className={inputCls}>
          <option value="parent">Parent</option>
          <option value="guardian">Guardian</option>
          <option value="emergency">Emergency Contact</option>
          <option value="other">Other</option>
        </select>
        <input placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
        <input placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={form.is_primary} onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))} className="rounded border-gray-600 bg-gray-700 text-blue-500" />
          Primary Contact
        </label>
      </div>
      <input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} w-full`} />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
        <button type="submit" disabled={saving} className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium disabled:opacity-50">
          {saving ? 'Saving...' : contact ? 'Update' : 'Add Contact'}
        </button>
      </div>
    </form>
  );
}

/* ─── Stats Tab ─── */
function StatsTab({ playerId }) {
  const [stats, setStats] = useState([]);
  const [definitions, setDefinitions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchPlayerStats(playerId),
      fetchStatDefinitions({ active_only: true }),
    ]).then(([s, d]) => {
      setStats(s);
      setDefinitions(d);
    }).catch(console.error).finally(() => setLoading(false));
  }, [playerId]);

  if (loading) return <Spinner />;

  // Group stats by game
  const gameMap = {};
  for (const s of stats) {
    const key = s.game_id;
    if (!gameMap[key]) gameMap[key] = { game_id: key, game_date: s.game_date, home_team_name: s.home_team_name, away_team_name: s.away_team_name, stats: [] };
    gameMap[key].stats.push(s);
  }
  const games = Object.values(gameMap).sort((a, b) => new Date(b.game_date) - new Date(a.game_date));

  // Season totals by stat (for numeric stats)
  const totals = {};
  for (const s of stats) {
    if (!totals[s.stat_definition_id]) totals[s.stat_definition_id] = { ...s, total: 0, count: 0 };
    const num = Number(s.value);
    if (!isNaN(num)) {
      totals[s.stat_definition_id].total += num;
      totals[s.stat_definition_id].count++;
    }
  }

  return (
    <div className="space-y-4">
      {/* Season totals */}
      {Object.keys(totals).length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Season Totals</h3>
          <div className="flex flex-wrap gap-4">
            {Object.values(totals).map(t => (
              <div key={t.stat_definition_id} className="text-center">
                <p className="text-lg font-bold text-white">{t.total}</p>
                <p className="text-xs text-gray-400">{t.abbreviation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-game stats */}
      {games.length > 0 ? games.map(g => (
        <div key={g.game_id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-medium text-white">{g.home_team_name} vs {g.away_team_name}</p>
            <p className="text-xs text-gray-400">{new Date(g.game_date).toLocaleDateString()}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {g.stats.map(s => (
              <div key={s.id} className="bg-gray-700/40 rounded-lg px-3 py-1.5 text-center">
                <p className="text-sm font-medium text-white">{s.value}</p>
                <p className="text-xs text-gray-400">{s.abbreviation}</p>
              </div>
            ))}
          </div>
        </div>
      )) : (
        <p className="text-sm text-gray-500 py-4 text-center">No stats recorded yet</p>
      )}

      {definitions.length === 0 && (
        <p className="text-xs text-gray-500 text-center">No stat fields configured. Go to League Config to set up stat definitions.</p>
      )}
    </div>
  );
}

/* ─── Documents Tab ─── */
function DocumentsTab({ playerId, canEdit }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    fetchPlayerDocuments(playerId).then(setDocs).catch(console.error).finally(() => setLoading(false));
  }, [playerId]);

  useEffect(load, [load]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const docType = file.name.toLowerCase().includes('birth') ? 'birth_certificate' : 'other';
      await uploadPlayerDocument(playerId, file, docType);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDownload(doc) {
    try {
      const result = await downloadPlayerDocument(playerId, doc.id);
      const a = document.createElement('a');
      a.href = result.data_url;
      a.download = result.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDelete(docId) {
    if (!confirm('Delete this document?')) return;
    try {
      await deletePlayerDocument(playerId, docId);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <Spinner />;

  const docTypeLabels = {
    birth_certificate: 'Birth Certificate',
    medical: 'Medical',
    waiver: 'Waiver',
    other: 'Other',
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Documents</h3>
        {canEdit && (
          <label className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors cursor-pointer">
            <PlusIcon className="w-3.5 h-3.5" />
            {uploading ? 'Uploading...' : 'Upload'}
            <input type="file" className="hidden" accept=".png,.jpg,.jpeg,.gif,.webp,.pdf" onChange={handleUpload} disabled={uploading} />
          </label>
        )}
      </div>

      {!docs.length && (
        <p className="text-sm text-gray-500 py-4 text-center">No documents uploaded yet</p>
      )}

      {docs.map(d => (
        <div key={d.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DocumentIcon className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-white">{d.file_name}</p>
              <p className="text-xs text-gray-400">{docTypeLabels[d.doc_type] || d.doc_type} &middot; {new Date(d.created_at).toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => handleDownload(d)} className="px-3 py-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">Download</button>
            {canEdit && (
              <button onClick={() => handleDelete(d.id)} className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors">
                <TrashIcon className="w-4 h-4 text-red-400" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Notes Tab ─── */
function NotesTab({ playerId, canEdit }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetchPlayerNotes(playerId).then(setNotes).catch(console.error).finally(() => setLoading(false));
  }, [playerId]);

  useEffect(load, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      await createPlayerNote(playerId, newNote);
      setNewNote('');
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(noteId) {
    if (!editText.trim()) return;
    try {
      await updatePlayerNote(playerId, noteId, editText);
      setEditingId(null);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDelete(noteId) {
    if (!confirm('Delete this note?')) return;
    try {
      await deletePlayerNote(playerId, noteId);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      {/* Add note form */}
      {canEdit && (
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Add a note..."
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button type="submit" disabled={saving || !newNote.trim()} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
            {saving ? '...' : 'Add'}
          </button>
        </form>
      )}

      {!notes.length && (
        <p className="text-sm text-gray-500 py-4 text-center">No notes yet</p>
      )}

      {notes.map(n => (
        <div key={n.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          {editingId === n.id ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                <button onClick={() => handleUpdate(n.id)} className="text-xs text-blue-400 hover:text-blue-300">Save</button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1">
                <p className="text-sm text-white whitespace-pre-wrap">{n.note}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {n.author_name || 'System'} &middot; {new Date(n.created_at).toLocaleString()}
                  {n.updated_at !== n.created_at && ' (edited)'}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setEditingId(n.id); setEditText(n.note); }} className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors">
                    <PencilIcon className="w-4 h-4 text-gray-400" />
                  </button>
                  <button onClick={() => handleDelete(n.id)} className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors">
                    <TrashIcon className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Shared ─── */
function Spinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-400 border-t-transparent" />
    </div>
  );
}
