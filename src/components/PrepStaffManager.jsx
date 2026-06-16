import { useState, useEffect, useCallback } from 'react';
import {
  fetchPrepStaff,
  createPrepStaff,
  updatePrepStaff,
  deletePrepStaff,
  fetchOrganizations,
  fetchPrepUsers,
  fetchPrepTaskTypes,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import PrepStaffDetail from './PrepStaffDetail.jsx';
import { Button, Badge, Input, Select, Modal } from './ui';

export default function PrepStaffManager({ onBack }) {
  const { isSuperAdmin, isAccountant, isOrgAdmin, permissions, canEditOrg } = useAuth();
  const canViewFinancials = isSuperAdmin || isAccountant || isOrgAdmin;
  const [staff, setStaff] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [taskTypes, setTaskTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [scopeFilter, setScopeFilter] = useState('all');
  const [selectedStaffId, setSelectedStaffId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [rows, orgRows, ttRows] = await Promise.all([fetchPrepStaff(), fetchOrganizations(), fetchPrepTaskTypes()]);
      setStaff(rows || []);
      setOrgs(orgRows || []);
      setTaskTypes(ttRows || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleDelete(person) {
    if (!window.confirm(`Delete prep staff "${person.name}"?`)) return;
    setDeleting(person.id);
    try {
      await deletePrepStaff(person.id);
      setStaff((prev) => prev.filter((s) => s.id !== person.id));
    } catch (err) { alert(`Failed to delete: ${err.message}`); }
    finally { setDeleting(null); }
  }

  const ttMap = Object.fromEntries(taskTypes.map(t => [t.id, t.name]));

  const filtered = staff.filter((p) => {
    if (scopeFilter === 'league' && p.org_ids?.length) return false;
    if (scopeFilter === 'org' && !p.org_ids?.length) return false;
    return true;
  });

  if (loading) return <div className="py-8 text-center text-gray-400">Loading prep staff…</div>;
  if (error) return <div className="lh-alert lh-alert-error">Error: {error}</div>;

  if (selectedStaffId) {
    return <PrepStaffDetail staffId={selectedStaffId} taskTypes={taskTypes} onBack={() => { setSelectedStaffId(null); loadData(); }} />;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-display font-bold text-white">Field Prep Crew ({filtered.length})</h2>
        <div className="flex gap-2">
          <Select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className="min-w-[100px]">
            <option value="all">All</option>
            <option value="league">League</option>
            <option value="org">Organization</option>
          </Select>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>+ Add Crew Member</Button>
          {onBack && <Button variant="secondary" onClick={onBack}>← Dashboard</Button>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-gray-400">No crew members yet.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((person) => (
            <div key={person.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-100 truncate cursor-pointer hover:text-chrome-300 hover:underline" onClick={() => setSelectedStaffId(person.id)}>{person.name}</h3>
                    {person.org_ids?.length ? person.org_names.map((name, i) => (
                      <Badge key={person.org_ids[i]} variant="info">{name}</Badge>
                    )) : (
                      <Badge variant="info">League</Badge>
                    )}
                    {canViewFinancials && person.default_rate_override != null && (
                      <Badge variant="success">${Number(person.default_rate_override).toFixed(2)} override</Badge>
                    )}
                    {person.linked_username && (
                      <Badge variant="info">@{person.linked_username}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    {canViewFinancials && Number(person.total_owed) > 0 && (
                      <Badge variant="warning">${Number(person.total_owed).toFixed(2)} owed</Badge>
                    )}
                    <Badge variant="info">{person.assigned_games} assigned</Badge>
                    {Number(person.interested_games) > 0 && (
                      <Badge variant="info">{person.interested_games} interested</Badge>
                    )}
                    <Badge variant="neutral">{person.completed_games} completed</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <span className="text-[11px] text-gray-500">Tasks:</span>
                    {person.task_type_ids?.length
                      ? person.task_type_ids.map(id => ttMap[id]).filter(Boolean).map(name => (
                          <Badge key={name} variant="info">{name}</Badge>
                        ))
                      : <Badge variant="neutral">All</Badge>}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    {[person.email, person.phone, canViewFinancials && person.venmo_id ? `Venmo: ${person.venmo_id}` : null].filter(Boolean).join(' • ') || 'No contact details'}
                  </div>
                  {person.notes && <div className="text-sm text-gray-300 mt-1">{person.notes}</div>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="xs" variant="secondary" onClick={() => { setEditing(person); setShowForm(true); }}>Edit</Button>
                  <Button size="xs" variant="danger" onClick={() => handleDelete(person)} disabled={deleting === person.id}>
                    {deleting === person.id ? '…' : 'Delete'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <PrepStaffForm
          person={editing}
          orgs={orgs}
          taskTypes={taskTypes}
          isSuperAdmin={isSuperAdmin}
          canEditOrg={canEditOrg}
          onDone={() => { setShowForm(false); setEditing(null); loadData(); }}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function PrepStaffForm({ person, orgs, taskTypes, isSuperAdmin, canEditOrg, onDone, onCancel }) {
  const isEditing = !!person;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [prepUsers, setPrepUsers] = useState([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchPrepUsers().then(setPrepUsers).catch(() => {});
  }, [isSuperAdmin]);

  const editableOrgs = (orgs || []).filter((org) => canEditOrg(org.id));
  const defaultScope = person?.org_ids?.length ? 'org' : (isSuperAdmin ? 'league' : 'org');
  const [scope, setScope] = useState(defaultScope);
  const [selectedOrgIds, setSelectedOrgIds] = useState(
    person?.org_ids?.length ? person.org_ids : (editableOrgs[0]?.id ? [editableOrgs[0].id] : [])
  );
  const [selectedTaskTypeIds, setSelectedTaskTypeIds] = useState(person?.task_type_ids || []);

  const [form, setForm] = useState({
    name: person?.name || '',
    email: person?.email || '',
    phone: person?.phone || '',
    venmo_id: person?.venmo_id || '',
    default_rate_override: person?.default_rate_override != null ? String(person.default_rate_override) : '',
    notes: person?.notes || '',
    user_id: person?.user_id || '',
  });

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const data = {
        org_ids: scope === 'league' ? [] : selectedOrgIds.map(Number),
        task_type_ids: selectedTaskTypeIds.map(Number),
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        venmo_id: form.venmo_id.trim() || null,
        default_rate_override: form.default_rate_override === '' ? null : Number(form.default_rate_override),
        notes: form.notes.trim() || null,
        user_id: form.user_id ? Number(form.user_id) : null,
      };
      if (!data.name) throw new Error('Name is required');
      if (scope === 'org' && !data.org_ids.length) throw new Error('At least one organization is required for org-scoped crew');

      if (isEditing) await updatePrepStaff(person.id, data);
      else await createPrepStaff(data);
      onDone();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onCancel} size="lg" title={isEditing ? 'Edit Crew Member' : 'Add Crew Member'}>
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
                    <input type="checkbox" checked={checked}
                      onChange={() => setSelectedOrgIds(prev => checked ? prev.filter(id => id !== org.id) : [...prev, org.id])}
                      className="sr-only" />
                    {org.name}
                  </label>
                );
              })}
            </div>
            {editableOrgs.length === 0 && <div className="text-sm text-gray-500 mt-1">No organizations available</div>}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Name *" id="ps-name" name="name" value={form.name} onChange={handleChange} required />
          <Input label="Rate Override ($)" id="ps-rate" name="default_rate_override" type="number" min="0" step="0.01"
            value={form.default_rate_override} onChange={handleChange}
            placeholder="Use task rate" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Email" id="ps-email" name="email" type="email" value={form.email} onChange={handleChange} />
          <Input label="Phone" id="ps-phone" name="phone" value={form.phone} onChange={handleChange} />
          <Input label="Venmo ID" id="ps-venmo" name="venmo_id" value={form.venmo_id} onChange={handleChange} placeholder="@username" />
        </div>

        {taskTypes.length > 0 && (
          <div>
            <label className="lh-eyebrow">Eligible Tasks</label>
            <div className="flex flex-wrap gap-2">
              {taskTypes.filter(t => t.active).map((t) => {
                const checked = selectedTaskTypeIds.includes(t.id);
                return (
                  <label key={t.id} className={`flex items-center gap-1.5 lh-tab cursor-pointer border transition-colors ${checked ? 'lh-tab-active border-action-500' : 'bg-gray-900 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                    <input type="checkbox" checked={checked}
                      onChange={() => setSelectedTaskTypeIds(prev => checked ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                      className="sr-only" />
                    {t.name}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-1">Select which tasks this crew member is qualified to perform. Leave empty to allow all (e.g. for older crew who can drag and line).</p>
          </div>
        )}

        {isSuperAdmin && (
          <Select label="Linked User Account" id="ps-user" name="user_id" value={form.user_id} onChange={handleChange}
            helper="Only users flagged as Prep Staff appear here. Link this profile to a user so they can self-signup for games.">
            <option value="">— Not linked —</option>
            {prepUsers.map((u) => (
              <option key={u.id} value={u.id} disabled={u.staff_id != null && u.staff_id !== person?.id}>
                @{u.username}{u.name ? ` (${u.name})` : ''}{u.staff_id != null && u.staff_id !== person?.id ? ' — already linked' : ''}
              </option>
            ))}
          </Select>
        )}

        <div>
          <label htmlFor="ps-notes" className="lh-eyebrow">Notes</label>
          <textarea id="ps-notes" name="notes" value={form.notes} onChange={handleChange} rows={3} className="lh-input mt-1" />
        </div>

        {error && <div className="lh-alert lh-alert-error">{error}</div>}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" loading={saving}>{isEditing ? 'Update' : 'Add Crew Member'}</Button>
        </div>
      </form>
    </Modal>
  );
}
