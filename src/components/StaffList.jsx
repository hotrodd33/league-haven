import { useState, useEffect, useCallback } from 'react';
import { fetchStaffByTeam, createStaff, updateStaff, deleteStaff } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';

const ROLE_OPTIONS = [
  { value: 'head_coach', label: 'Head Coach' },
  { value: 'assistant_coach', label: 'Assistant Coach' },
  { value: 'travel_director', label: 'Travel Director' },
];

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600";
const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";

export default function StaffList({ teamId, teamOrgId, refreshKey }) {
  const { canEditTeam: canEdit } = useAuth();
  const editable = teamId ? canEdit(teamId, teamOrgId) : false;
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const loadStaff = useCallback(async () => {
    if (!teamId) return;
    setLoading(true); setError(null);
    try { setStaff(await fetchStaffByTeam(teamId)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [teamId]);

  useEffect(() => { setStaff([]); loadStaff(); }, [loadStaff, refreshKey]);

  async function handleDelete(member) {
    if (!window.confirm(`Remove ${member.name}?`)) return;
    setDeleting(member.id);
    try { await deleteStaff(member.id); setStaff((prev) => prev.filter((s) => s.id !== member.id)); }
    catch (err) { alert(`Failed to delete: ${err.message}`); }
    finally { setDeleting(null); }
  }

  if (!teamId) return null;
  if (loading) return <div className="py-8 text-center text-gray-500">Loading staff…</div>;
  if (error) return <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Coaches &amp; Staff ({staff.length})</h2>
        {editable && (
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 transition-colors">
            + Add Staff
          </button>
        )}
      </div>

      {staff.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          No coaches or staff assigned yet.
          {editable && (
            <>
              <br />
              <button onClick={() => { setEditing(null); setShowForm(true); }} className="text-blue-700 underline mt-1 inline-block">Add the first staff member</button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full bg-white rounded-lg shadow-sm overflow-hidden text-sm">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-200">
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">Role</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">Email</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">Phone</th>
                  {editable && <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {staff.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{m.role_label}</td>
                    <td className="px-3 py-2 font-semibold">{m.name}</td>
                    <td className="px-3 py-2 break-all">{m.email || '—'}</td>
                    <td className="px-3 py-2">{m.phone || '—'}</td>
                    {editable && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex gap-1">
                          <button onClick={() => { setEditing(m); setShowForm(true); }} className="px-2 py-1 text-xs font-semibold bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Edit</button>
                          <button onClick={() => handleDelete(m)} disabled={deleting === m.id}
                            className="px-2 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60">
                            {deleting === m.id ? '…' : 'Remove'}
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
              <div key={m.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <div className="font-semibold">{m.name}</div>
                    <div className="text-sm text-gray-500">{m.role_label}</div>
                  </div>
                  {editable && (
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => { setEditing(m); setShowForm(true); }} className="px-2.5 py-1 text-xs font-semibold bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Edit</button>
                      <button onClick={() => handleDelete(m)} disabled={deleting === m.id}
                        className="px-2.5 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60">
                        {deleting === m.id ? '…' : 'Del'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-sm text-gray-600 space-y-0.5">
                  {m.email && <div className="truncate">{m.email}</div>}
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 sm:p-6 my-4">
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

          {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-200 text-gray-800 text-sm font-semibold rounded-lg hover:bg-gray-300">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 disabled:opacity-60">
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Add Staff'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
