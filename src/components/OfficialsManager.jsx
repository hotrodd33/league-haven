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
import { Button, Badge, Input, Select, Card, CardBody, Modal } from './ui';

export default function OfficialsManager({ onBack }) {
  const { isSuperAdmin, isAccountant, isOrgAdmin, permissions, canEditOrg } = useAuth();
  const canViewFinancials = isSuperAdmin || isAccountant || isOrgAdmin;
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
    if (scopeFilter === 'league' && official.org_ids?.length) return false;
    if (scopeFilter === 'org' && !official.org_ids?.length) return false;
    if (ageGroupFilter) {
      const ids = official.age_group_ids || [];
      if (!ids.includes(Number(ageGroupFilter))) return false;
    }
    return true;
  });

  if (loading) return <div className="py-8 text-center text-gray-400">Loading officials…</div>;
  if (error) return <div className="lh-alert lh-alert-error">Error: {error}</div>;

  if (selectedOfficialId) {
    return <OfficialDetail officialId={selectedOfficialId} onBack={() => { setSelectedOfficialId(null); loadData(); }} />;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-display font-bold text-white">Officials ({filtered.length})</h2>
        <div className="flex gap-2">
          <Select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className="min-w-[100px]">
            <option value="all">All</option>
            <option value="league">League</option>
            <option value="org">Organization</option>
          </Select>
          {ageGroups.length > 0 && (
            <Select value={ageGroupFilter} onChange={(e) => setAgeGroupFilter(e.target.value)}>
              <option value="">All Age Groups</option>
              {ageGroups.filter(ag => ag.ump_required !== false).map(ag => (
                <option key={ag.id} value={ag.id}>{ag.name}</option>
              ))}
            </Select>
          )}
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>+ Add Official</Button>
          {onBack && <Button variant="secondary" onClick={onBack}>← Dashboard</Button>}
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
                    <h3 className="font-semibold text-gray-100 truncate cursor-pointer hover:text-chrome-300 hover:underline" onClick={() => setSelectedOfficialId(official.id)}>{official.name}</h3>
                    {official.org_ids?.length ? official.org_names.map((name, i) => (
                      <Badge key={official.org_ids[i]} variant="info">{name}</Badge>
                    )) : (
                      <Badge variant="info">League</Badge>
                    )}
                    {canViewFinancials && (
                      <Badge variant="success">{official.rate_per_game != null ? `$${Number(official.rate_per_game).toFixed(2)}/game` : 'Level Rate'}</Badge>
                    )}
                    {official.linked_username && (
                      <Badge variant="info">@{official.linked_username}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    {canViewFinancials && Number(official.total_owed) > 0 && (
                      <Badge variant="warning">
                        ${Number(official.total_owed).toFixed(2)} owed
                      </Badge>
                    )}
                    <Badge variant="info">
                      {official.assigned_games} assigned
                    </Badge>
                    {Number(official.interested_games) > 0 && (
                      <Badge variant="info">
                        {official.interested_games} interested
                      </Badge>
                    )}
                    <Badge variant="neutral">
                      {official.completed_games} completed
                    </Badge>
                  </div>
                  {official.age_group_ids?.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      <span className="text-[11px] text-gray-500">Ages:</span>
                      {official.age_group_ids.map(id => agMap[id]).filter(Boolean).map(name => (
                        <Badge key={name} variant="info">{name}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="text-sm text-gray-400 mt-1">
                    {[official.email, official.phone, canViewFinancials && official.venmo_id ? `Venmo: ${official.venmo_id}` : null].filter(Boolean).join(' • ') || 'No contact details'}
                  </div>
                  {(official.address || official.city || official.state || official.zip) && (
                    <div className="text-xs text-gray-400 mt-1">{[official.address, official.city, official.state, official.zip].filter(Boolean).join(', ')}</div>
                  )}
                  {official.notes && <div className="text-sm text-gray-300 mt-1">{official.notes}</div>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="xs" variant="secondary" onClick={() => { setEditing(official); setShowForm(true); }}>Edit</Button>
                  <Button size="xs" variant="danger" onClick={() => handleDelete(official)} disabled={deleting === official.id}>
                    {deleting === official.id ? '…' : 'Delete'}
                  </Button>
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
  const defaultScope = official?.org_ids?.length ? 'org' : (isSuperAdmin ? 'league' : 'org');
  const [scope, setScope] = useState(defaultScope);
  const [selectedOrgIds, setSelectedOrgIds] = useState(
    official?.org_ids?.length ? official.org_ids : (editableOrgs[0]?.id ? [editableOrgs[0].id] : [])
  );

  const [form, setForm] = useState({
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
        org_ids: scope === 'league' ? [] : selectedOrgIds.map(Number),
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
      if (scope === 'org' && !data.org_ids.length) throw new Error('At least one organization is required for org-scoped officials');

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
    <Modal open onClose={onCancel} size="lg" title={isEditing ? 'Edit Official' : 'Add Official'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSuperAdmin && (
            <div>
              <label className="lh-eyebrow">Scope</label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={scope === 'league' ? 'primary' : 'ghost'} onClick={() => setScope('league')}>League</Button>
                <Button type="button" size="sm" variant={scope === 'org' ? 'chrome' : 'ghost'} onClick={() => setScope('org')}>Organization</Button>
              </div>
            </div>
          )}

          {scope === 'org' && (
            <div>
              <label className="lh-eyebrow">Organizations *</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {editableOrgs.map((org) => {
                  const checked = selectedOrgIds.includes(org.id);
                  return (
                    <label key={org.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer text-sm ${checked ? 'bg-chrome-700 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedOrgIds(prev => checked ? prev.filter(id => id !== org.id) : [...prev, org.id])}
                        className="sr-only"
                      />
                      {org.name}
                    </label>
                  );
                })}
              </div>
              {editableOrgs.length === 0 && <div className="text-sm text-gray-500 mt-1">No organizations available</div>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Name *" id="official-name" name="name" value={form.name} onChange={handleChange} required />
            <Input label="Rate Per Game" id="official-rate" name="rate_per_game" type="number" min="0" step="0.01" value={form.rate_per_game} onChange={handleChange} placeholder="Level rate" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Email" id="official-email" name="email" type="email" value={form.email} onChange={handleChange} />
            <Input label="Phone" id="official-phone" name="phone" value={form.phone} onChange={handleChange} />
            <Input label="Venmo ID" id="official-venmo" name="venmo_id" value={form.venmo_id} onChange={handleChange} placeholder="@username" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Date of Birth" id="official-dob" name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} />
            <Input label="Years of Experience" id="official-experience" name="years_of_experience" type="number" min="0" max="99" value={form.years_of_experience} onChange={handleChange} />
            <div className="flex items-end">
              <label htmlFor="official-certified" className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input id="official-certified" name="is_certified" type="checkbox" checked={form.is_certified} onChange={handleChange} className="w-4 h-4 rounded bg-gray-700 border-gray-500 accent-chrome-600 cursor-pointer" />
                Certified
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_80px_100px] gap-3">
            <Input label="Mailing Address" id="official-address" name="address" value={form.address} onChange={handleChange} wrapperClassName="col-span-2 sm:col-span-1" />
            <Input label="City" id="official-city" name="city" value={form.city} onChange={handleChange} />
            <Input label="State" id="official-state" name="state" value={form.state} onChange={handleChange} maxLength={2} />
            <Input label="ZIP" id="official-zip" name="zip" value={form.zip} onChange={handleChange} maxLength={10} />
          </div>

          {isSuperAdmin && (
            <Select label="Linked User Account" id="official-user" name="user_id" value={form.user_id} onChange={handleChange} helper="Only umpire-role accounts are shown. Link this profile to a user so they see assigned games on their dashboard.">
              <option value="">— Not linked —</option>
              {umpireUsers.map((u) => (
                <option key={u.id} value={u.id} disabled={u.official_id != null && u.official_id !== official?.id}>
                  @{u.username}{u.name ? ` (${u.name})` : ''}{u.official_id != null && u.official_id !== official?.id ? ' — already linked' : ''}
                </option>
              ))}
            </Select>
          )}

          {ageGroups.length > 0 && (
            <div>
              <label className="lh-eyebrow">Eligible Age Groups</label>
              <div className="flex flex-wrap gap-2">
                {ageGroups.filter(ag => ag.ump_required !== false).map((ag) => {
                  const checked = selectedAgeGroups.includes(ag.id);
                  return (
                    <label key={ag.id} className={`flex items-center gap-1.5 lh-tab cursor-pointer border transition-colors ${checked ? 'lh-tab-active border-action-500' : 'bg-gray-900 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
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
            <label htmlFor="official-notes" className="lh-eyebrow">Notes</label>
            <textarea id="official-notes" name="notes" value={form.notes} onChange={handleChange} rows={3} className="lh-input mt-1" />
          </div>

          {error && <div className="lh-alert lh-alert-error">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="submit" loading={saving}>{isEditing ? 'Update' : 'Add Official'}</Button>
          </div>
        </form>
    </Modal>
  );
}
