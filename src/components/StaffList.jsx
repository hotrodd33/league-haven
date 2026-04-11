import { useState, useEffect, useCallback } from 'react';
import { fetchStaffByTeam, createStaff, updateStaff, deleteStaff, searchStaff, assignStaffToTeam, unassignStaffFromTeam } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import ContactModal from './ContactModal.jsx';

const ROLE_OPTIONS = [
  { value: 'head_coach', label: 'Head Coach' },
  { value: 'assistant_coach', label: 'Assistant Coach' },
  { value: 'travel_director', label: 'Travel Director' },
];

const inputCls = "w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1";

export default function StaffList({ teamId, teamOrgId, refreshKey }) {
  const { canEditTeam: canEdit } = useAuth();
  const editable = teamId ? canEdit(teamId, teamOrgId) : false;
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState(null);
  const [assignRole, setAssignRole] = useState('assistant_coach');
  const [contactModal, setContactModal] = useState(null);

  const loadStaff = useCallback(async () => {
    if (!teamId) return;
    setLoading(true); setError(null);
    try { setStaff(await fetchStaffByTeam(teamId)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [teamId]);

  useEffect(() => { setStaff([]); loadStaff(); }, [loadStaff, refreshKey]);

  async function handleRemoveFromTeam(member) {
    if (!window.confirm(`Remove ${member.name} from this team? They will still exist in the system.`)) return;
    setDeleting(member.id);
    try {
      await unassignStaffFromTeam(teamId, member.id);
      setStaff((prev) => prev.filter((s) => s.id !== member.id));
    } catch (err) { alert(`Failed to remove: ${err.message}`); }
    finally { setDeleting(null); }
  }

  async function handleDeleteStaff(member) {
    if (!window.confirm(`Permanently delete ${member.name}? This removes them from ALL teams.`)) return;
    setDeleting(member.id);
    try {
      await deleteStaff(member.id);
      setStaff((prev) => prev.filter((s) => s.id !== member.id));
    } catch (err) { alert(`Failed to delete: ${err.message}`); }
    finally { setDeleting(null); }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchStaff(searchQuery.trim());
      const currentIds = new Set(staff.map(s => s.id));
      setSearchResults(results.filter(s => !currentIds.has(s.id)));
    } catch (err) { alert(`Search failed: ${err.message}`); }
    finally { setSearching(false); }
  }

  async function handleAssignExisting(staffId) {
    setAssigning(staffId);
    try {
      await assignStaffToTeam(teamId, staffId, assignRole);
      setSearchResults(prev => prev.filter(s => s.id !== staffId));
      await loadStaff();
    } catch (err) { alert(`Failed to add: ${err.message}`); }
    finally { setAssigning(null); }
  }

  if (!teamId) return null;
  if (loading) return <div className="py-8 text-center text-gray-400">Loading staff…</div>;
  if (error) return <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-gray-100">Coaches &amp; Staff ({staff.length})</h2>
        {editable && (
          <div className="flex gap-2">
            <button onClick={() => setShowAddExisting(!showAddExisting)}
              className="px-3 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600 transition-colors">
              + Existing Staff
            </button>
            <button onClick={() => { setEditing(null); setShowForm(true); }}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              + New Staff
            </button>
          </div>
        )}
      </div>

      {/* Search existing staff to add to this team */}
      {showAddExisting && editable && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 mb-4">
          <p className="text-xs text-gray-400 mb-2">Search for an existing staff member to add to this team:</p>
          <div className="flex gap-2 mb-2">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name…" className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }} />
            <select value={assignRole} onChange={(e) => setAssignRole(e.target.value)}
              className="px-2 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100">
              {ROLE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <button onClick={handleSearch} disabled={searching || !searchQuery.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {searching ? '…' : 'Search'}
            </button>
            <button onClick={() => { setShowAddExisting(false); setSearchQuery(''); setSearchResults([]); }}
              className="px-3 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600">
              Close
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {searchResults.map(s => (
                <div key={s.id} className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200">
                  <div>
                    <span className="font-semibold">{s.name}</span>
                    {s.email && <span className="text-gray-400 ml-2">{s.email}</span>}
                  </div>
                  <button onClick={() => handleAssignExisting(s.id)} disabled={assigning === s.id}
                    className="px-3 py-1 text-xs font-semibold bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-60">
                    {assigning === s.id ? '…' : 'Add to Team'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {searchResults.length === 0 && searchQuery && !searching && (
            <p className="text-xs text-gray-400">No matching staff found. Try a different search or add a new staff member.</p>
          )}
        </div>
      )}

      {staff.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          No coaches or staff assigned yet.
          {editable && (
            <>
              <br />
              <button onClick={() => { setEditing(null); setShowForm(true); }} className="text-field-300 underline mt-1 inline-block">Add a new staff member</button>
              {' or '}
              <button onClick={() => setShowAddExisting(true)} className="text-field-300 underline mt-1 inline-block">add an existing one</button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full bg-gray-800 rounded-lg shadow-sm overflow-hidden text-sm text-gray-200">
              <thead>
                <tr className="bg-gray-800 border-b-2 border-gray-700">
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Role</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Email</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Phone</th>
                  {editable && <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {staff.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-900">
                    <td className="px-3 py-2">{m.role_label}</td>
                    <td className="px-3 py-2 font-semibold">{m.name}</td>
                    <td className="px-3 py-2 break-all">
                      <div className="flex items-center gap-1.5">
                        <span>{m.email || '—'}</span>
                        {m.email && (
                          <button onClick={() => setContactModal({ scope: 'individual', scopeId: m.id, scopeLabel: m.name })}
                            className="p-1 text-gray-400 hover:text-blue-400 hover:bg-blue-900/30 rounded transition-colors" title="Email">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">{m.phone || '—'}</td>
                    {editable && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex gap-1">
                          <button onClick={() => { setEditing(m); setShowForm(true); }} className="px-2 py-1 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600">Edit</button>
                          <button onClick={() => handleRemoveFromTeam(m)} disabled={deleting === m.id}
                            className="px-2 py-1 text-xs font-semibold bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-60"
                            title="Remove from this team only">
                            {deleting === m.id ? '…' : 'Remove'}
                          </button>
                          <button onClick={() => handleDeleteStaff(m)} disabled={deleting === m.id}
                            className="px-2 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60"
                            title="Delete staff from all teams">
                            {deleting === m.id ? '…' : 'Del'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {staff.map((m) => (
              <div key={m.id} className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-4 text-gray-200">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <div className="font-semibold">{m.name}</div>
                    <div className="text-sm text-gray-400">{m.role_label}</div>
                  </div>
                  {editable && (
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => { setEditing(m); setShowForm(true); }} className="px-2.5 py-1 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600">Edit</button>
                      <button onClick={() => handleRemoveFromTeam(m)} disabled={deleting === m.id}
                        className="px-2.5 py-1 text-xs font-semibold bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-60">
                        {deleting === m.id ? '…' : 'Remove'}
                      </button>
                      <button onClick={() => handleDeleteStaff(m)} disabled={deleting === m.id}
                        className="px-2.5 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60">
                        {deleting === m.id ? '…' : 'Del'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-sm text-gray-300 space-y-0.5">
                  {m.email && (
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{m.email}</span>
                      <button onClick={() => setContactModal({ scope: 'individual', scopeId: m.id, scopeLabel: m.name })}
                        className="p-1 text-gray-400 hover:text-blue-400 hover:bg-blue-900/30 rounded transition-colors shrink-0" title="Email">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {m.phone && <div>{m.phone}</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showForm && (
        <StaffForm
          teamId={teamId} staff={editing}
          onDone={() => { setShowForm(false); setEditing(null); loadStaff(); }}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {contactModal && (
        <ContactModal
          scope={contactModal.scope}
          scopeId={contactModal.scopeId}
          scopeLabel={contactModal.scopeLabel}
          onClose={() => setContactModal(null)}
        />
      )}
    </div>
  );
}

function StaffForm({ teamId, staff, onDone, onCancel }) {
  const isEditing = !!staff;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: staff?.name || '', role: staff?.role || 'head_coach',
    email: staff?.email || '', phone: staff?.phone || '',
  });

  function handleChange(e) { setForm((prev) => ({ ...prev, [e.target.name]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError(null);
    const data = { team_id: teamId, name: form.name.trim(), role: form.role, email: form.email.trim() || null, phone: form.phone.trim() || null };
    try {
      if (isEditing) await updateStaff(staff.id, data);
      else await createStaff(data);
      onDone();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-5 sm:p-6 my-4">
        <h2 className="text-xl font-bold mb-4">{isEditing ? 'Edit Staff' : 'Add Staff'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="staff-name" className={labelCls}>Name *</label>
              <input id="staff-name" name="name" type="text" value={form.name} onChange={handleChange} required placeholder="Full name" className={inputCls} />
            </div>
            <div>
              <label htmlFor="staff-role" className={labelCls}>Role *</label>
              <select id="staff-role" name="role" value={form.role} onChange={handleChange} className={inputCls}>
                {ROLE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="staff-email" className={labelCls}>Email</label>
              <input id="staff-email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="coach@example.com" className={inputCls} />
            </div>
            <div>
              <label htmlFor="staff-phone" className={labelCls}>Phone</label>
              <input id="staff-phone" name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder="(555) 123-4567" className={inputCls} />
            </div>
          </div>

          {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Add Staff'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
