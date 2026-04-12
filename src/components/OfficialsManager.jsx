import { useState, useEffect, useCallback } from 'react';
import {
  fetchOfficials,
  createOfficial,
  updateOfficial,
  deleteOfficial,
  fetchOrganizations,
  fetchUmpireUsers,
  fetchAgeGroups,
  updateOfficialAgeGroups,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import OfficialDetail from './OfficialDetail.jsx';

const inputCls = 'w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';
const labelCls = 'block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1';
const btnPrimary = 'px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60';
const btnSecondary = 'px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600 transition-colors';
const btnDanger = 'px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 disabled:opacity-60';
const btnSm = 'px-3 py-1.5 text-xs font-semibold rounded';

export default function OfficialsManager({ onBack }) {
  const { isSuperAdmin, permissions, canEditOrg } = useAuth();
  const [officials, setOfficials] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [scopeFilter, setScopeFilter] = useState('all');
  const [ageGroupFilter, setAgeGroupFilter] = useState('');
  const [ageGroups, setAgeGroups] = useState([]);
  const [selectedOfficialId, setSelectedOfficialId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [officialRows, orgRows, agRows] = await Promise.all([fetchOfficials(), fetchOrganizations(), fetchAgeGroups()]);
      setOfficials(officialRows || []);
      setOrgs(orgRows || []);
      setAgeGroups(agRows || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleDelete(official) {
    if (!window.confirm(`Delete official \"${official.name}\"?`)) return;
    setDeleting(official.id);
    try {
      await deleteOfficial(official.id);
      setOfficials((prev) => prev.filter((o) => o.id !== official.id));
    } catch (err) {
      alert(`Failed to delete: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  }

  const agMap = Object.fromEntries(ageGroups.map(ag => [ag.id, ag.name]));

  const filtered = officials.filter((official) => {
    if (scopeFilter === 'league' && official.org_id) return false;
    if (scopeFilter === 'org' && !official.org_id) return false;
    if (ageGroupFilter) {
      const ids = official.age_group_ids || [];
      if (!ids.includes(Number(ageGroupFilter))) return false;
    }
    return true;
  });

  if (loading) return <div className="py-8 text-center text-gray-400">Loading officials…</div>;
  if (error) return <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">Error: {error}</div>;

  if (selectedOfficialId) {
    return <OfficialDetail officialId={selectedOfficialId} onBack={() => { setSelectedOfficialId(null); loadData(); }} />;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-heading font-bold text-white">Officials ({filtered.length})</h2>
        <div className="flex gap-2">
          <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className={btnSecondary}>
            <option value="all">All</option>
            <option value="league">League</option>
            <option value="org">Organization</option>
          </select>
          {ageGroups.length > 0 && (
            <select value={ageGroupFilter} onChange={(e) => setAgeGroupFilter(e.target.value)} className={btnSecondary}>
              <option value="">All Age Groups</option>
              {ageGroups.filter(ag => ag.ump_required !== false).map(ag => (
                <option key={ag.id} value={ag.id}>{ag.name}</option>
              ))}
            </select>
          )}
          <button onClick={() => { setEditing(null); setShowForm(true); }} className={btnPrimary}>+ Add Official</button>
          {onBack && <button onClick={onBack} className={btnSecondary}>← Dashboard</button>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-gray-400">No officials found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((official) => (
            <div key={official.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-100 truncate cursor-pointer hover:text-blue-300 hover:underline" onClick={() => setSelectedOfficialId(official.id)}>{official.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${official.org_id ? 'bg-blue-900/40 text-blue-200' : 'bg-purple-900/35 text-purple-200'}`}>
                      {official.org_id ? official.org_name || 'Organization' : 'League'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-900/35 text-green-300">{official.rate_per_game != null ? `$${Number(official.rate_per_game).toFixed(2)}/game` : 'Level Rate'}</span>
                    {official.linked_username && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-900/35 text-teal-200">@{official.linked_username}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    {Number(official.total_owed) > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-900/35 text-amber-300">
                        ${Number(official.total_owed).toFixed(2)} owed
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-900/30 text-blue-300">
                      {official.assigned_games} assigned
                    </span>
                    {Number(official.interested_games) > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-cyan-900/30 text-cyan-300">
                        {official.interested_games} interested
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-700 text-gray-300">
                      {official.completed_games} completed
                    </span>
                  </div>
                  {official.age_group_ids?.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      <span className="text-[11px] text-gray-500">Ages:</span>
                      {official.age_group_ids.map(id => agMap[id]).filter(Boolean).map(name => (
                        <span key={name} className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-900/30 text-indigo-300">{name}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-sm text-gray-400 mt-1">
                    {[official.email, official.phone, official.venmo_id ? `Venmo: ${official.venmo_id}` : null].filter(Boolean).join(' • ') || 'No contact details'}
                  </div>
                  {(official.address || official.city || official.state || official.zip) && (
                    <div className="text-xs text-gray-400 mt-1">{[official.address, official.city, official.state, official.zip].filter(Boolean).join(', ')}</div>
                  )}
                  {official.notes && <div className="text-sm text-gray-300 mt-1">{official.notes}</div>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => { setEditing(official); setShowForm(true); }} className={`${btnSm} bg-gray-700 text-gray-200 hover:bg-gray-600`}>Edit</button>
                  <button onClick={() => handleDelete(official)} disabled={deleting === official.id} className={btnDanger}>
                    {deleting === official.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <OfficialForm
          official={editing}
          orgs={orgs}
          isSuperAdmin={isSuperAdmin}
          permissions={permissions}
          canEditOrg={canEditOrg}
          onDone={() => { setShowForm(false); setEditing(null); loadData(); }}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function OfficialForm({ official, orgs, isSuperAdmin, permissions, canEditOrg, onDone, onCancel }) {
  const isEditing = !!official;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [umpireUsers, setUmpireUsers] = useState([]);
  const [ageGroups, setAgeGroups] = useState([]);
  const [selectedAgeGroups, setSelectedAgeGroups] = useState(official?.age_group_ids || []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchUmpireUsers().then(setUmpireUsers).catch(() => {});
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchAgeGroups().then(setAgeGroups).catch(() => {});
  }, []);

  const editableOrgs = (orgs || []).filter((org) => canEditOrg(org.id));
  const defaultScope = official?.org_id ? 'org' : (isSuperAdmin ? 'league' : 'org');
  const [scope, setScope] = useState(defaultScope);

  const [form, setForm] = useState({
    org_id: official?.org_id || (editableOrgs[0]?.id || ''),
    name: official?.name || '',
    email: official?.email || '',
    phone: official?.phone || '',
    address: official?.address || '',
    city: official?.city || '',
    state: official?.state || '',
    zip: official?.zip || '',
    venmo_id: official?.venmo_id || '',
    rate_per_game: official?.rate_per_game != null ? String(official.rate_per_game) : '',
    notes: official?.notes || '',
    date_of_birth: official?.date_of_birth || '',
    is_certified: official?.is_certified || false,
    years_of_experience: official?.years_of_experience != null ? String(official.years_of_experience) : '',
    user_id: official?.user_id || '',
  });

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const data = {
        org_id: scope === 'league' ? null : (form.org_id ? Number(form.org_id) : null),
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip: form.zip.trim() || null,
        venmo_id: form.venmo_id.trim() || null,
        rate_per_game: form.rate_per_game,
        notes: form.notes.trim() || null,
        date_of_birth: form.date_of_birth.trim() || null,
        is_certified: form.is_certified === true,
        years_of_experience: form.years_of_experience ? Number(form.years_of_experience) : null,
        user_id: form.user_id ? Number(form.user_id) : null,
      };
      if (!data.name) throw new Error('Name is required');
      if (scope === 'org' && !data.org_id) throw new Error('Organization is required for org-scoped officials');

      if (isEditing) {
        await updateOfficial(official.id, data);
        await updateOfficialAgeGroups(official.id, selectedAgeGroups);
      } else {
        const created = await createOfficial(data);
        if (created?.id) await updateOfficialAgeGroups(created.id, selectedAgeGroups);
      }
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl p-5 sm:p-6 my-4 text-gray-200">
        <h2 className="text-xl font-heading font-bold text-white mb-4">{isEditing ? 'Edit Official' : 'Add Official'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSuperAdmin && (
            <div>
              <label className={labelCls}>Scope</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setScope('league')} className={`${btnSm} ${scope === 'league' ? 'bg-purple-700 text-white' : 'bg-gray-700 text-gray-200'}`}>League</button>
                <button type="button" onClick={() => setScope('org')} className={`${btnSm} ${scope === 'org' ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-200'}`}>Organization</button>
              </div>
            </div>
          )}

          {scope === 'org' && (
            <div>
              <label htmlFor="official-org" className={labelCls}>Organization *</label>
              <select id="official-org" name="org_id" value={form.org_id} onChange={handleChange} required className={inputCls}>
                <option value="">— Select Organization —</option>
                {editableOrgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="official-name" className={labelCls}>Name *</label>
              <input id="official-name" name="name" value={form.name} onChange={handleChange} required className={inputCls} />
            </div>
            <div>
              <label htmlFor="official-rate" className={labelCls}>Rate Per Game</label>
              <input id="official-rate" name="rate_per_game" type="number" min="0" step="0.01" value={form.rate_per_game} onChange={handleChange} className={inputCls} placeholder="Level rate" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="official-email" className={labelCls}>Email</label>
              <input id="official-email" name="email" type="email" value={form.email} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label htmlFor="official-phone" className={labelCls}>Phone</label>
              <input id="official-phone" name="phone" value={form.phone} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label htmlFor="official-venmo" className={labelCls}>Venmo ID</label>
              <input id="official-venmo" name="venmo_id" value={form.venmo_id} onChange={handleChange} className={inputCls} placeholder="@username" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="official-dob" className={labelCls}>Date of Birth</label>
              <input id="official-dob" name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label htmlFor="official-experience" className={labelCls}>Years of Experience</label>
              <input id="official-experience" name="years_of_experience" type="number" min="0" max="99" value={form.years_of_experience} onChange={handleChange} className={inputCls} />
            </div>
            <div className="flex items-end">
              <label htmlFor="official-certified" className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input id="official-certified" name="is_certified" type="checkbox" checked={form.is_certified} onChange={handleChange} className="w-4 h-4 rounded bg-gray-700 border-gray-500 accent-blue-600 cursor-pointer" />
                Certified
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_80px_100px] gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="official-address" className={labelCls}>Mailing Address</label>
              <input id="official-address" name="address" value={form.address} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label htmlFor="official-city" className={labelCls}>City</label>
              <input id="official-city" name="city" value={form.city} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label htmlFor="official-state" className={labelCls}>State</label>
              <input id="official-state" name="state" value={form.state} onChange={handleChange} maxLength={2} className={inputCls} />
            </div>
            <div>
              <label htmlFor="official-zip" className={labelCls}>ZIP</label>
              <input id="official-zip" name="zip" value={form.zip} onChange={handleChange} maxLength={10} className={inputCls} />
            </div>
          </div>

          {isSuperAdmin && (
            <div>
              <label htmlFor="official-user" className={labelCls}>Linked User Account</label>
              <select id="official-user" name="user_id" value={form.user_id} onChange={handleChange} className={inputCls}>
                <option value="">— Not linked —</option>
                {umpireUsers.map((u) => (
                  <option key={u.id} value={u.id} disabled={u.official_id != null && u.official_id !== official?.id}>
                    @{u.username}{u.name ? ` (${u.name})` : ''}{u.official_id != null && u.official_id !== official?.id ? ' — already linked' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Only umpire-role accounts are shown. Link this profile to a user so they see assigned games on their dashboard.</p>
            </div>
          )}

          {ageGroups.length > 0 && (
            <div>
              <label className={labelCls}>Eligible Age Groups</label>
              <div className="flex flex-wrap gap-2">
                {ageGroups.filter(ag => ag.ump_required !== false).map((ag) => {
                  const checked = selectedAgeGroups.includes(ag.id);
                  return (
                    <label key={ag.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition-colors ${checked ? 'bg-blue-900/40 border-blue-500 text-blue-200' : 'bg-gray-900 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedAgeGroups(prev => checked ? prev.filter(id => id !== ag.id) : [...prev, ag.id])}
                        className="sr-only"
                      />
                      {ag.name}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1">Select the age groups this official is eligible to umpire. Leave empty for all.</p>
            </div>
          )}

          <div>
            <label htmlFor="official-notes" className={labelCls}>Notes</label>
            <textarea id="official-notes" name="notes" value={form.notes} onChange={handleChange} rows={3} className={inputCls} />
          </div>

          {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : (isEditing ? 'Update' : 'Add Official')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
