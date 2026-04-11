import { useState, useEffect, useCallback } from 'react';
import {
  fetchOrganizations, createOrganization, updateOrganization, deleteOrganization,
  fetchTeams, fetchGames, createTeam, updateTeam, uploadOrgLogo, removeOrgLogo,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import FieldLocations from './FieldLocations.jsx';

const inputCls = "w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1";
const btnPrimary = "px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60";
const btnSecondary = "px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600 transition-colors";
const btnDanger = "px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 disabled:opacity-60";
const btnSm = "px-3 py-1.5 text-xs font-semibold rounded";

function summarizeOrgTeams(org, upcomingByTeam = {}) {
  const teams = org.teams || [];
  const ageGroups = Object.values(
    teams.reduce((acc, team) => {
      if (!team.age_group) return acc;
      const key = team.age_group;
      const parsedOrder = Number(team.age_group_sort_order);
      const incomingOrder = Number.isFinite(parsedOrder) ? parsedOrder : Number.MAX_SAFE_INTEGER;
      if (!acc[key] || incomingOrder < acc[key].sortOrder) {
        acc[key] = { name: key, sortOrder: incomingOrder };
      }
      return acc;
    }, {})
  )
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
    .map((entry) => entry.name);
  const levels = [...new Set(teams.map((team) => team.level).filter(Boolean))].sort();
  const featuredTeams = teams
    .slice()
    .sort((left, right) => {
      const leftUpcoming = upcomingByTeam[left.id]?.count || 0;
      const rightUpcoming = upcomingByTeam[right.id]?.count || 0;
      if (rightUpcoming !== leftUpcoming) return rightUpcoming - leftUpcoming;
      const leftNext = upcomingByTeam[left.id]?.nextDate || '9999-12-31';
      const rightNext = upcomingByTeam[right.id]?.nextDate || '9999-12-31';
      if (leftNext !== rightNext) return leftNext.localeCompare(rightNext);
      return (left.long_name || left.name).localeCompare(right.long_name || right.name);
    })
    .slice(0, 3)
    .map((team) => ({
      id: team.id,
      orgId: team.org_id,
      name: team.long_name || team.name,
      upcomingCount: upcomingByTeam[team.id]?.count || 0,
    }));

  return {
    ageGroups,
    levels,
    featuredTeams,
    remainingTeams: Math.max(teams.length - featuredTeams.length, 0),
  };
}
export default function OrgManager({ onBack, onNavigateToTeam }) {
  const { isAdmin, canEditOrg } = useAuth();
  const [orgs, setOrgs] = useState([]);
  const [upcomingByTeam, setUpcomingByTeam] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const loadOrgs = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [orgData, games] = await Promise.all([fetchOrganizations(), fetchGames()]);
      setOrgs(orgData);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().slice(0, 10);
      const upcomingStatuses = new Set(['scheduled', 'in_progress', 'postponed']);
      const map = {};
      for (const g of games || []) {
        if (!g?.game_date || !upcomingStatuses.has(g.status)) continue;
        if (g.game_date < todayStr) continue;
        for (const teamId of [g.home_team_id, g.away_team_id]) {
          if (!teamId) continue;
          const current = map[teamId] || { count: 0, nextDate: null };
          current.count += 1;
          if (!current.nextDate || g.game_date < current.nextDate) current.nextDate = g.game_date;
          map[teamId] = current;
        }
      }
      setUpcomingByTeam(map);
    }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  async function handleDelete(org) {
    if (!window.confirm(`Delete "${org.name}" and all its field locations? Teams will be unlinked.`)) return;
    setDeleting(org.id);
    try { await deleteOrganization(org.id); setOrgs((prev) => prev.filter((o) => o.id !== org.id)); if (selectedOrg?.id === org.id) setSelectedOrg(null); }
    catch (err) { alert(`Failed to delete: ${err.message}`); }
    finally { setDeleting(null); }
  }

  function handleFormDone() { setShowForm(false); setEditing(null); loadOrgs(); }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading organizations…</div>;
  if (error) return <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">Error: {error}</div>;

  if (selectedOrg) {
    return <OrgDetailView org={selectedOrg} onBack={() => { setSelectedOrg(null); loadOrgs(); }} onNavigateToTeam={onNavigateToTeam} />;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold text-gray-100">Organizations ({orgs.length})</h2>
        <div className="flex gap-2">
          {isAdmin && <button onClick={() => { setEditing(null); setShowForm(true); }} className={btnPrimary}>+ Add Organization</button>}
          {onBack && <button onClick={onBack} className={btnSecondary}>← Teams</button>}
        </div>
      </div>

      {orgs.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          No organizations yet.
          {isAdmin && (
            <>
              <br />
              <button onClick={() => setShowForm(true)} className="text-field-300 underline mt-1 inline-block">Add the first organization</button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map((org) => (
            <OrgListCard
              key={org.id}
              org={org}
              upcomingByTeam={upcomingByTeam}
              canEdit={canEditOrg(org.id)}
              deleting={deleting === org.id}
              isAdmin={isAdmin}
              onOpen={() => setSelectedOrg(org)}
              onEdit={() => { setEditing(org); setShowForm(true); }}
              onDelete={() => handleDelete(org)}
            />
          ))}
        </div>
      )}

      {showForm && <OrgForm org={editing} onDone={handleFormDone} onCancel={() => { setShowForm(false); setEditing(null); }} />}
    </div>
  );
}

function OrgListCard({ org, upcomingByTeam, canEdit, deleting, isAdmin, onOpen, onEdit, onDelete }) {
  const { ageGroups, levels, featuredTeams, remainingTeams } = summarizeOrgTeams(org, upcomingByTeam);

  return (
    <div
      onClick={onOpen}
      className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-gray-200 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {org.logo_url && <img src={org.logo_url} alt="" className="w-9 h-9 object-contain rounded shrink-0" />}
          <div className="min-w-0">
            <h3 className="font-bold text-base text-gray-100 truncate">{org.name}</h3>
            {org.contact_name && <p className="text-sm text-gray-300 truncate">{org.contact_name}</p>}
          </div>
        </div>
        <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shrink-0">
          {org.team_count} team{org.team_count !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
          <div className="text-gray-400 uppercase tracking-wide font-semibold">Fields</div>
          <div className="text-gray-100 font-bold mt-0.5">{org.locations.length}</div>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
          <div className="text-gray-400 uppercase tracking-wide font-semibold">Programs</div>
          <div className="text-gray-100 font-bold mt-0.5">{ageGroups.length || 0} age group{ageGroups.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      {(org.city || org.state) && (
        <p className="text-sm text-gray-400 mb-3">{[org.city, org.state].filter(Boolean).join(', ')}</p>
      )}

      {ageGroups.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Age Groups</div>
          <div className="flex flex-wrap gap-1.5">
            {ageGroups.slice(0, 5).map((ageGroup) => (
              <span key={ageGroup} className="px-2 py-0.5 rounded-full bg-blue-900/35 text-blue-200 text-xs font-semibold">
                {ageGroup}
              </span>
            ))}
            {ageGroups.length > 5 && (
              <span className="px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 text-xs font-semibold">+{ageGroups.length - 5}</span>
            )}
          </div>
        </div>
      )}

      {levels.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Levels</div>
          <div className="flex flex-wrap gap-1.5">
            {levels.slice(0, 4).map((level) => (
              <span key={level} className="px-2 py-0.5 rounded-full bg-field-900/30 text-field-300 text-xs font-semibold">
                {level}
              </span>
            ))}
            {levels.length > 4 && (
              <span className="px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 text-xs font-semibold">+{levels.length - 4}</span>
            )}
          </div>
        </div>
      )}

      {featuredTeams.length > 0 && (
        <div>
          <div className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Featured Teams</div>
          <div className="space-y-1 text-sm text-gray-300">
            {featuredTeams.map((team) => (
              <div key={team.id} className="truncate">
                {team.name}
                {team.upcomingCount > 0 && <span className="text-[11px] text-gray-400 ml-1">({team.upcomingCount} upcoming)</span>}
              </div>
            ))}
            {remainingTeams > 0 && <div className="text-gray-400 text-xs">+ {remainingTeams} more team{remainingTeams === 1 ? '' : 's'}</div>}
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700" onClick={(e) => e.stopPropagation()}>
        {canEdit && <button onClick={onEdit} className={`${btnSm} bg-gray-700 text-gray-200 hover:bg-gray-600`}>Edit</button>}
        {isAdmin && (
          <button onClick={onDelete} disabled={deleting} className={btnDanger}>
            {deleting ? '…' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  );
}

function OrgCard({ org }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-4 text-gray-200">
      <div className="flex items-center gap-3 mb-3">
        {org.logo_url && <img src={org.logo_url} alt="" className="w-12 h-12 object-contain rounded" />}
        <h2 className="text-xl font-bold text-gray-100">{org.name}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {org.contact_name && <div><span className="font-semibold">Contact:</span> {org.contact_name}</div>}
        {org.contact_email && <div><span className="font-semibold">Email:</span> {org.contact_email}</div>}
        {org.contact_phone && <div><span className="font-semibold">Phone:</span> {org.contact_phone}</div>}
        {(org.address || org.city) && <div><span className="font-semibold">Address:</span> {[org.address, org.city, org.state, org.zip].filter(Boolean).join(', ')}</div>}
        {org.notes && <div className="col-span-full"><span className="font-semibold">Notes:</span> {org.notes}</div>}
      </div>
    </div>
  );
}

function OrgForm({ org, onDone, onCancel }) {
  const isEditing = !!org;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(org?.logo_url || null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [form, setForm] = useState({
    name: org?.name || '', contact_name: org?.contact_name || '',
    contact_email: org?.contact_email || '', contact_phone: org?.contact_phone || '',
    address: org?.address || '', city: org?.city || '',
    state: org?.state || '', zip: org?.zip || '', notes: org?.notes || '',
  });

  function handleChange(e) { setForm((prev) => ({ ...prev, [e.target.name]: e.target.value })); }

  function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setRemoveLogo(false);
    setLogoPreview(URL.createObjectURL(file));
  }

  function handleRemoveLogo() {
    setLogoFile(null);
    setRemoveLogo(true);
    setLogoPreview(null);
  }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError(null);
    const data = {};
    for (const [key, value] of Object.entries(form)) data[key] = value.trim() || null;
    try {
      let savedOrg;
      if (isEditing) {
        savedOrg = await updateOrganization(org.id, data);
      } else {
        savedOrg = await createOrganization(data);
      }
      const orgId = savedOrg.id;
      if (logoFile) {
        await uploadOrgLogo(orgId, logoFile);
      } else if (removeLogo && isEditing) {
        await removeOrgLogo(orgId);
      }
      onDone();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-xl p-5 sm:p-6 my-4 text-gray-200">
        <h2 className="text-xl font-bold text-gray-100 mb-4">{isEditing ? 'Edit Organization' : 'Add Organization'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="org-name" className={labelCls}>Organization Name *</label>
            <input id="org-name" name="name" type="text" value={form.name} onChange={handleChange} required placeholder="e.g. Lake City Baseball" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Logo</label>
            <div className="flex items-center gap-3">
              {logoPreview && <img src={logoPreview} alt="Logo preview" className="w-16 h-16 object-contain rounded border border-gray-700" />}
              <div className="flex flex-col gap-1">
                <label className="px-3 py-1.5 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600 cursor-pointer inline-block w-fit">
                  {logoPreview ? 'Change' : 'Upload'}
                  <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                </label>
                {logoPreview && (
                  <button type="button" onClick={handleRemoveLogo} className="px-3 py-1.5 text-xs font-semibold bg-red-900/35 text-red-300 rounded hover:bg-red-800/60 w-fit">Remove</button>
                )}
                <p className="text-xs text-gray-400">Max 500 KB. PNG, JPEG, GIF, WebP, or SVG.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="org-contact-name" className={labelCls}>Contact Name</label>
              <input id="org-contact-name" name="contact_name" type="text" value={form.contact_name} onChange={handleChange} placeholder="John Doe" className={inputCls} />
            </div>
            <div>
              <label htmlFor="org-contact-email" className={labelCls}>Contact Email</label>
              <input id="org-contact-email" name="contact_email" type="email" value={form.contact_email} onChange={handleChange} placeholder="contact@example.com" className={inputCls} />
            </div>
            <div>
              <label htmlFor="org-contact-phone" className={labelCls}>Contact Phone</label>
              <input id="org-contact-phone" name="contact_phone" type="tel" value={form.contact_phone} onChange={handleChange} placeholder="(555) 123-4567" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_80px_100px] gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="org-address" className={labelCls}>Address</label>
              <input id="org-address" name="address" type="text" value={form.address} onChange={handleChange} placeholder="123 Main St" className={inputCls} />
            </div>
            <div>
              <label htmlFor="org-city" className={labelCls}>City</label>
              <input id="org-city" name="city" type="text" value={form.city} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label htmlFor="org-state" className={labelCls}>State</label>
              <input id="org-state" name="state" type="text" value={form.state} onChange={handleChange} maxLength={2} placeholder="OH" className={inputCls} />
            </div>
            <div>
              <label htmlFor="org-zip" className={labelCls}>ZIP</label>
              <input id="org-zip" name="zip" type="text" value={form.zip} onChange={handleChange} maxLength={10} placeholder="44107" className={inputCls} />
            </div>
          </div>

          <div>
            <label htmlFor="org-notes" className={labelCls}>Notes</label>
            <textarea id="org-notes" name="notes" value={form.notes} onChange={handleChange} rows={3} placeholder="Any additional info…"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>

          {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Add Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OrgDetailView({ org: initialOrg, onBack, onNavigateToTeam }) {
  const [org, setOrg] = useState(initialOrg);
  const [allTeams, setAllTeams] = useState([]);

  const reload = useCallback(async () => {
    const [orgs, teams] = await Promise.all([fetchOrganizations(), fetchTeams()]);
    const fresh = orgs.find((o) => o.id === initialOrg.id);
    if (fresh) setOrg(fresh);
    setAllTeams(teams);
  }, [initialOrg.id]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <div>
      <button onClick={onBack} className="px-3 py-1.5 text-sm font-semibold bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 mb-4">
        ← Back to Organizations
      </button>
      <OrgCard org={org} />
      <OrgTeams org={org} allTeams={allTeams} onChanged={reload} onNavigateToTeam={onNavigateToTeam} />
      <FieldLocations orgId={org.id} orgName={org.name} />
    </div>
  );
}

function OrgTeams({ org, allTeams, onChanged, onNavigateToTeam }) {
  const { isAdmin } = useAuth();
  const canManage = isAdmin;
  const [assigning, setAssigning] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [newTeam, setNewTeam] = useState({ team_city: '', team_mascot: '', team_color: '', age_group: '', level: '' });

  const orgTeams = org.teams || [];
  const unassignedTeams = allTeams.filter((t) => !t.org_id);

  async function handleAssign() {
    if (!selectedTeamId) return;
    setAssigning(true);
    try {
      const team = allTeams.find((t) => t.id === Number(selectedTeamId));
      await updateTeam(selectedTeamId, { name: team.name, age_group: team.age_group, division: team.division, org_id: org.id });
      setSelectedTeamId(''); onChanged();
    } catch (err) { alert(`Failed to assign: ${err.message}`); }
    finally { setAssigning(false); }
  }

  async function handleUnassign(team) {
    if (!window.confirm(`Remove "${team.name}" from this organization?`)) return;
    try { await updateTeam(team.id, { name: team.name, age_group: team.age_group, division: team.division, org_id: null }); onChanged(); }
    catch (err) { alert(`Failed to unassign: ${err.message}`); }
  }

  function handleCreateChange(e) {
    const { name, value } = e.target;
    setNewTeam((prev) => ({ ...prev, [name]: value }));
  }

  async function handleCreateTeam(e) {
    e.preventDefault();
    if (!newTeam.team_city.trim()) {
      setCreateError('Team city is required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createTeam({
        team_city: newTeam.team_city.trim(),
        team_mascot: newTeam.team_mascot.trim() || null,
        team_color: newTeam.team_color.trim() || null,
        age_group: newTeam.age_group.trim() || null,
        level: newTeam.level.trim() || null,
        org_id: org.id,
      });
      setNewTeam({ team_city: '', team_mascot: '', team_color: '', age_group: '', level: '' });
      setShowCreate(false);
      onChanged();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-base font-bold text-gray-100">Teams ({orgTeams.length})</h3>
        {canManage && (
          <button onClick={() => { setShowCreate(true); setCreateError(null); }} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700">
            + Add Team
          </button>
        )}
      </div>

      {orgTeams.length > 0 ? (
        <>
          {/* Desktop */}
          <div className="hidden sm:block">
            <table className="w-full bg-gray-800 rounded-lg shadow-sm overflow-hidden text-sm text-gray-200">
              <thead>
                <tr className="bg-gray-800 border-b-2 border-gray-700">
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400">Team Name</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400">Age Group</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400">Level</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400">Division(s)</th>
                  {isAdmin && <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 w-24">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {orgTeams.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-900">
                    <td className="px-3 py-2 font-semibold">
                      <button onClick={() => onNavigateToTeam?.(t.id, t.org_id)} className="text-field-300 hover:text-field-100 hover:underline text-left">
                        {t.long_name || t.name}
                      </button>
                    </td>
                    <td className="px-3 py-2">{t.age_group || '—'}</td>
                    <td className="px-3 py-2">{t.level || '—'}</td>
                    <td className="px-3 py-2">{t.divisions?.length ? t.divisions.map(d => d.name).join(', ') : (t.division || '—')}</td>
                    {isAdmin && <td className="px-3 py-2"><button onClick={() => handleUnassign(t)} className={btnDanger}>Remove</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile */}
          <div className="sm:hidden space-y-2">
            {orgTeams.map((t) => (
              <div key={t.id} className="bg-gray-800 rounded-lg border border-gray-700 p-3 flex items-center justify-between text-gray-200">
                <div>
                  <button onClick={() => onNavigateToTeam?.(t.id, t.org_id)} className="font-semibold text-sm text-field-300 hover:text-field-100 hover:underline text-left">
                    {t.long_name || t.name}
                  </button>
                  <div className="text-xs text-gray-400">{[t.age_group, t.level, t.divisions?.length ? t.divisions.map(d => d.name).join(', ') : t.division].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                {isAdmin && <button onClick={() => handleUnassign(t)} className={btnDanger}>Remove</button>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="py-4 text-center text-gray-400 text-sm">No teams assigned yet.</div>
      )}

      {showCreate && canManage && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-xl p-5 sm:p-6 my-4 text-gray-200 border border-gray-700">
            <h4 className="text-lg font-bold text-gray-100 mb-3">Add Team to {org.name}</h4>
            <form onSubmit={handleCreateTeam} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-team-city" className={labelCls}>City *</label>
                  <input id="new-team-city" name="team_city" value={newTeam.team_city} onChange={handleCreateChange} required className={inputCls} placeholder="Lake City" />
                </div>
                <div>
                  <label htmlFor="new-team-mascot" className={labelCls}>Mascot</label>
                  <input id="new-team-mascot" name="team_mascot" value={newTeam.team_mascot} onChange={handleCreateChange} className={inputCls} placeholder="Tigers" />
                </div>
                <div>
                  <label htmlFor="new-team-color" className={labelCls}>Color</label>
                  <input id="new-team-color" name="team_color" value={newTeam.team_color} onChange={handleCreateChange} className={inputCls} placeholder="Blue" />
                </div>
                <div>
                  <label htmlFor="new-team-age" className={labelCls}>Age Group</label>
                  <input id="new-team-age" name="age_group" value={newTeam.age_group} onChange={handleCreateChange} className={inputCls} placeholder="12U" />
                </div>
                <div>
                  <label htmlFor="new-team-level" className={labelCls}>Level</label>
                  <input id="new-team-level" name="level" value={newTeam.level} onChange={handleCreateChange} className={inputCls} placeholder="A" />
                </div>
              </div>

              {createError && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{createError}</div>}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className={btnSecondary}>Cancel</button>
                <button type="submit" disabled={creating} className={btnPrimary}>{creating ? 'Adding…' : 'Add Team'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAdmin && unassignedTeams.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-3">
          <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}
            className="flex-1 sm:flex-none sm:min-w-[220px] px-3 py-2 border border-gray-600 rounded-lg text-sm text-gray-100 bg-gray-800">
            <option value="">— Assign a team —</option>
            {unassignedTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={handleAssign} disabled={!selectedTeamId || assigning}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {assigning ? '…' : 'Assign'}
          </button>
        </div>
      )}
    </div>
  );
}
