import { useState, useEffect, useCallback } from 'react';
import {
  fetchOrganizations, createOrganization, updateOrganization, deleteOrganization,
  fetchTeams, fetchGames, createTeam, updateTeam, uploadOrgLogo, removeOrgLogo,
  fetchAgeGroups, fetchLevels, fetchSeasons, fetchDivisions, uploadTeamLogo, removeTeamLogo,
  fetchRegistrations,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import FieldLocations from './FieldLocations.jsx';
import { HomePlate, plateLabel } from './TeamLogo.jsx';
import { Button, Badge, Input, Modal } from './ui/index.js';

function summarizeOrgTeams(org) {
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
  return { ageGroups, levels };
}
export default function OrgManager({ onBack, onNavigateToTeam }) {
  const { isAdmin, isAccountant, canEditOrg } = useAuth();
  const [orgs, setOrgs] = useState([]);
  const [orgStats, setOrgStats] = useState({});
  const [orgPayments, setOrgPayments] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const loadOrgs = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [orgData, games, regData] = await Promise.all([fetchOrganizations(), fetchGames(), fetchRegistrations().catch(() => ({ registrations: [] }))]);
      setOrgs(orgData);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().slice(0, 10);
      // Build team → org map
      const teamToOrg = {};
      for (const org of orgData) {
        for (const team of org.teams || []) teamToOrg[team.id] = org.id;
      }
      // Build per-org game stats
      const stats = {};
      for (const org of orgData) stats[org.id] = { scheduled: 0, played: 0, missingScores: 0 };
      for (const g of games || []) {
        if (!g?.game_date) continue;
        const involvedOrgs = new Set();
        for (const teamId of [g.home_team_id, g.away_team_id]) {
          if (teamId && teamToOrg[teamId]) involvedOrgs.add(teamToOrg[teamId]);
        }
        for (const orgId of involvedOrgs) {
          if (!stats[orgId]) continue;
          if (g.status === 'completed') {
            stats[orgId].played += 1;
          } else if (g.game_date < todayStr && !['cancelled', 'completed'].includes(g.status)) {
            stats[orgId].missingScores += 1;
          } else if (g.game_date >= todayStr && ['scheduled', 'in_progress', 'postponed'].includes(g.status)) {
            stats[orgId].scheduled += 1;
          }
        }
      }
      setOrgStats(stats);

      // Build per-org payment summary from registrations
      const payments = {};
      const teamPaymentMap = {};
      for (const reg of regData.registrations || []) {
        const oid = reg.org_id;
        if (!oid) continue;
        if (!payments[oid]) payments[oid] = { total_fees: 0, collected: 0, outstanding: 0, teams_paid: 0, teams_unpaid: 0 };
        const fee = reg.effective_fee || 0;
        payments[oid].total_fees += fee;
        if (reg.is_paid) {
          payments[oid].collected += (reg.paid_amount != null ? Number(reg.paid_amount) : fee);
          payments[oid].teams_paid += 1;
        } else {
          payments[oid].outstanding += fee;
          payments[oid].teams_unpaid += 1;
        }
        teamPaymentMap[reg.team_id] = { is_paid: reg.is_paid, fee: reg.effective_fee };
      }
      setOrgPayments({ summary: payments, teams: teamPaymentMap });
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
  if (error) return <div className="lh-alert lh-alert-error">Error: {error}</div>;

  if (selectedOrg) {
    return <OrgDetailView org={selectedOrg} onBack={() => { setSelectedOrg(null); loadOrgs(); }} onNavigateToTeam={onNavigateToTeam} teamPayments={orgPayments.teams || {}} />;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-display font-bold text-white">Organizations ({orgs.length})</h2>
        <div className="flex gap-2">
          {isAdmin && <Button onClick={() => { setEditing(null); setShowForm(true); }}>+ Add Organization</Button>}
          {onBack && <Button variant="secondary" onClick={onBack}>← Teams</Button>}
        </div>
      </div>

      {orgs.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          No organizations yet.
          {isAdmin && (
            <>
              <br />
              <button onClick={() => setShowForm(true)} className="text-action-300 underline mt-1 inline-block">Add the first organization</button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map((org) => (
            <OrgListCard
              key={org.id}
              org={org}
              orgStats={orgStats[org.id]}
              orgPayment={orgPayments.summary?.[org.id]}
              canEdit={canEditOrg(org.id)}
              canViewFinancials={isAdmin || isAccountant || canEditOrg(org.id)}
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

function OrgListCard({ org, orgStats, orgPayment, canEdit, canViewFinancials, deleting, isAdmin, onOpen, onEdit, onDelete }) {
  const { ageGroups, levels } = summarizeOrgTeams(org);
  const { scheduled = 0, played = 0, missingScores = 0 } = orgStats || {};
  const hasPayment = canViewFinancials && orgPayment && (orgPayment.total_fees > 0 || orgPayment.teams_unpaid > 0);

  return (
    <div
      onClick={onOpen}
      className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-gray-200 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {org.logo_url && <img src={org.logo_url} alt="" className="w-9 h-9 object-contain rounded shrink-0" />}
          <div className="min-w-0">
            <h3 className="font-display font-bold text-base text-white truncate">{org.name}</h3>
            {org.contact_name && <p className="text-sm text-gray-300 truncate">{org.contact_name}</p>}
          </div>
        </div>
        <Badge variant="sport" className="shrink-0">
          {org.team_count} team{org.team_count !== 1 ? 's' : ''}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-center">
          <div className="text-gray-400 uppercase tracking-wide font-semibold">Scheduled</div>
          <div className="text-chrome-300 font-bold text-sm mt-0.5">{scheduled}</div>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-center">
          <div className="text-gray-400 uppercase tracking-wide font-semibold">Played</div>
          <div className="text-action-400 font-bold text-sm mt-0.5">{played}</div>
        </div>
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-center">
          <div className="text-gray-400 uppercase tracking-wide font-semibold">Missing</div>
          <div className={`font-bold text-sm mt-0.5 ${missingScores > 0 ? 'text-signal-400' : 'text-gray-400'}`}>{missingScores}</div>
        </div>
      </div>

      {hasPayment && (
        <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
          <div className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-center">
            <div className="text-gray-400 uppercase tracking-wide font-semibold">Fees</div>
            <div className="text-white font-bold text-sm mt-0.5">${orgPayment.total_fees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-center">
            <div className="text-gray-400 uppercase tracking-wide font-semibold">Paid</div>
            <div className="text-action-400 font-bold text-sm mt-0.5">${orgPayment.collected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-center">
            <div className="text-gray-400 uppercase tracking-wide font-semibold">Owed</div>
            <div className={`font-bold text-sm mt-0.5 ${orgPayment.outstanding > 0 ? 'text-signal-400' : 'text-action-400'}`}>
              ${orgPayment.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      )}

      {(org.city || org.state) && (
        <p className="text-sm text-gray-400 mb-3">{[org.city, org.state].filter(Boolean).join(', ')}</p>
      )}

      {ageGroups.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Age Groups</div>
          <div className="flex flex-wrap gap-1.5">
            {ageGroups.slice(0, 5).map((ageGroup) => (
              <span key={ageGroup} className="px-2 py-0.5 rounded-full bg-chrome-900/35 text-chrome-200 text-xs font-semibold">
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
              <span key={level} className="px-2 py-0.5 rounded-full bg-action-900/30 text-action-300 text-xs font-semibold">
                {level}
              </span>
            ))}
            {levels.length > 4 && (
              <span className="px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 text-xs font-semibold">+{levels.length - 4}</span>
            )}
          </div>
        </div>
      )}



      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700" onClick={(e) => e.stopPropagation()}>
        {canEdit && <Button size="xs" variant="secondary" onClick={onEdit}>Edit</Button>}
        {isAdmin && (
          <Button size="sm" variant="danger" onClick={onDelete} disabled={deleting}>
            {deleting ? '…' : 'Delete'}
          </Button>
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
        <h2 className="text-xl font-display font-bold text-white">{org.name}</h2>
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
  const [geocoding, setGeocoding] = useState(false);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [form, setForm] = useState({
    name: org?.name || '', contact_name: org?.contact_name || '',
    contact_email: org?.contact_email || '', contact_phone: org?.contact_phone || '',
    address: org?.address || '', city: org?.city || '',
    state: org?.state || '', zip: org?.zip || '', notes: org?.notes || '',
    latitude: org?.latitude ?? '', longitude: org?.longitude ?? '',
    officials_enabled: !!org?.officials_enabled,
  });

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

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

  async function handleGeocode() {
    const q = [form.address, form.city, form.state, form.zip].filter(Boolean).join(', ');
    if (!q.trim()) return setError('Enter an address, city, or zip first.');
    setGeocoding(true); setError(null);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`, {
        headers: { 'User-Agent': 'LeagueHaven/1.0' },
      });
      const data = await res.json();
      if (!data.length) return setError('No coordinates found for that address. Try a simpler query (city + state).');
      setForm(prev => ({ ...prev, latitude: parseFloat(data[0].lat).toFixed(6), longitude: parseFloat(data[0].lon).toFixed(6) }));
    } catch {
      setError('Geocoding request failed. Check your internet connection.');
    } finally {
      setGeocoding(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError(null);
    const data = {};
    for (const [key, value] of Object.entries(form)) {
      if (typeof value === 'boolean') data[key] = value;
      else if (key === 'latitude' || key === 'longitude') data[key] = value === '' ? null : parseFloat(value);
      else data[key] = value.trim() || null;
    }
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
    <Modal open onClose={onCancel} title={isEditing ? 'Edit Organization' : 'Add Organization'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Organization Name *" id="org-name" name="name" type="text" value={form.name} onChange={handleChange} required placeholder="e.g. Lake City Baseball" />

          <div>
            <label className="lh-eyebrow block mb-1">Logo</label>
            <div className="flex items-center gap-3">
              {logoPreview && <img src={logoPreview} alt="Logo preview" className="w-16 h-16 object-contain rounded border border-gray-700" />}
              <div className="flex flex-col gap-1">
                <label className="btn btn-xs btn-secondary cursor-pointer inline-block w-fit">
                  {logoPreview ? 'Change' : 'Upload'}
                  <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                </label>
                {logoPreview && (
                  <Button type="button" size="xs" variant="danger" onClick={handleRemoveLogo}>Remove</Button>
                )}
                <p className="text-xs text-gray-400">Max 500 KB. PNG, JPEG, GIF, WebP, or SVG.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Contact Name" id="org-contact-name" name="contact_name" type="text" value={form.contact_name} onChange={handleChange} placeholder="John Doe" />
            <Input label="Contact Email" id="org-contact-email" name="contact_email" type="email" value={form.contact_email} onChange={handleChange} placeholder="contact@example.com" />
            <Input label="Contact Phone" id="org-contact-phone" name="contact_phone" type="tel" value={form.contact_phone} onChange={handleChange} placeholder="(555) 123-4567" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_80px_100px] gap-3">
            <Input label="Address" wrapperClassName="col-span-2 sm:col-span-1" id="org-address" name="address" type="text" value={form.address} onChange={handleChange} placeholder="123 Main St" />
            <Input label="City" id="org-city" name="city" type="text" value={form.city} onChange={handleChange} />
            <Input label="State" id="org-state" name="state" type="text" value={form.state} onChange={handleChange} maxLength={2} placeholder="OH" />
            <Input label="ZIP" id="org-zip" name="zip" type="text" value={form.zip} onChange={handleChange} maxLength={10} placeholder="44107" />
          </div>

          <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <Input label="Latitude" id="org-latitude" name="latitude" type="number" step="any" value={form.latitude} onChange={handleChange} placeholder="44.0160" />
            <Input label="Longitude" id="org-longitude" name="longitude" type="number" step="any" value={form.longitude} onChange={handleChange} placeholder="-92.4802" />
            <button type="button" onClick={handleGeocode} disabled={geocoding}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap">
              {geocoding ? 'Looking up…' : 'Lookup from Address'}
            </button>
          </div>

          <div>
            <label htmlFor="org-notes" className="lh-eyebrow block mb-1">Notes</label>
            <textarea id="org-notes" name="notes" value={form.notes} onChange={handleChange} rows={3} placeholder="Any additional info…"
              className="lh-input" />
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              name="officials_enabled"
              checked={!!form.officials_enabled}
              onChange={handleChange}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-semibold text-gray-200">Enable Officials For This Organization</p>
              <p className="text-xs text-gray-400">When enabled, game forms can assign officials to games for this org.</p>
            </div>
          </label>

          {error && <div className="lh-alert lh-alert-error">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving} loading={saving}>
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Add Organization'}
            </Button>
          </div>
        </form>
    </Modal>
  );
}

function OrgDetailView({ org: initialOrg, onBack, onNavigateToTeam, teamPayments = {} }) {
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
      <Button variant="secondary" size="sm" onClick={onBack} className="mb-4">
        ← Back to Organizations
      </Button>
      <OrgCard org={org} />
      <OrgTeams org={org} allTeams={allTeams} onChanged={reload} onNavigateToTeam={onNavigateToTeam} teamPayments={teamPayments} />
      <FieldLocations orgId={org.id} orgName={org.name} />
    </div>
  );
}

function OrgTeams({ org, allTeams, onChanged, onNavigateToTeam, teamPayments = {} }) {
  const { isAdmin, canEditOrg } = useAuth();
  const canManage = isAdmin || canEditOrg(org.id);
  const [assigning, setAssigning] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [ageGroups, setAgeGroups] = useState([]);
  const [levels, setLevels] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [newTeam, setNewTeam] = useState({
    team_city: '',
    team_mascot: '',
    team_color: '',
    age_group: '',
    level: '',
    primary_color: '#003366',
    secondary_color: '#CC0000',
    division_ids: [],
  });

  const orgTeams = org.teams || [];
  const unassignedTeams = allTeams.filter((t) => !t.org_id);

  useEffect(() => {
    (async () => {
      try {
        const [agData, lvData, seasonData] = await Promise.all([
          fetchAgeGroups(),
          fetchLevels(),
          fetchSeasons(),
        ]);
        setAgeGroups(agData || []);
        setLevels(lvData || []);
        setSeasons(seasonData || []);
        const active = (seasonData || []).find((s) => s.is_active);
        const sid = active ? active.id : ((seasonData || []).length ? seasonData[0].id : null);
        setSelectedSeasonId(sid);
        if (sid) {
          const divData = await fetchDivisions(sid);
          setDivisions(divData || []);
        }
      } catch {
        setAgeGroups([]);
        setLevels([]);
        setSeasons([]);
        setDivisions([]);
      }
    })();
  }, []);

  async function handleSeasonChange(e) {
    const sid = e.target.value ? Number(e.target.value) : null;
    setSelectedSeasonId(sid);
    setNewTeam((prev) => ({ ...prev, division_ids: [] }));
    if (sid) {
      try {
        setDivisions(await fetchDivisions(sid));
      } catch {
        setDivisions([]);
      }
    } else {
      setDivisions([]);
    }
  }

  function toggleDivision(divId) {
    setNewTeam((prev) => ({
      ...prev,
      division_ids: prev.division_ids.includes(divId)
        ? prev.division_ids.filter((id) => id !== divId)
        : [...prev.division_ids, divId],
    }));
  }

  function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setRemoveLogo(false);
    setLogoPreview(URL.createObjectURL(file));
  }

  function handleRemoveLogo() {
    setLogoFile(null);
    setLogoPreview(null);
    setRemoveLogo(true);
  }

  function openCreateModal() {
    setEditingTeam(null);
    setCreateError(null);
    setNewTeam({
      team_city: '',
      team_mascot: '',
      team_color: '',
      age_group: '',
      level: '',
      primary_color: '#003366',
      secondary_color: '#CC0000',
      division_ids: [],
    });
    setLogoFile(null);
    setLogoPreview(null);
    setRemoveLogo(false);
    setShowCreate(true);
  }

  function openEditModal(team) {
    setEditingTeam(team);
    setCreateError(null);
    setNewTeam({
      team_city: team.team_city || '',
      team_mascot: team.team_mascot || '',
      team_color: team.team_color || '',
      age_group: team.age_group || '',
      level: team.level || '',
      primary_color: team.primary_color || '#003366',
      secondary_color: team.secondary_color || '#CC0000',
      division_ids: team.divisions ? team.divisions.map((d) => d.id) : [],
    });
    setLogoFile(null);
    setLogoPreview(team.logo_url || null);
    setRemoveLogo(false);
    setShowCreate(true);
  }

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
      const payload = {
        team_city: newTeam.team_city.trim(),
        team_mascot: newTeam.team_mascot.trim() || null,
        team_color: newTeam.team_color.trim() || null,
        age_group: newTeam.age_group.trim() || null,
        level: newTeam.level.trim() || null,
        primary_color: newTeam.primary_color || null,
        secondary_color: newTeam.secondary_color || null,
        division_ids: newTeam.division_ids,
        org_id: org.id,
      };

      let savedTeam;
      if (editingTeam) {
        savedTeam = await updateTeam(editingTeam.id, payload);
      } else {
        savedTeam = await createTeam(payload);
      }

      if (logoFile) {
        await uploadTeamLogo(savedTeam.id, logoFile);
      } else if (editingTeam && removeLogo) {
        await removeTeamLogo(savedTeam.id);
      }
      setNewTeam({
        team_city: '',
        team_mascot: '',
        team_color: '',
        age_group: '',
        level: '',
        primary_color: '#003366',
        secondary_color: '#CC0000',
        division_ids: [],
      });
      setLogoFile(null);
      setLogoPreview(null);
      setRemoveLogo(false);
      setEditingTeam(null);
      setShowCreate(false);
      onChanged();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  const shortName = [newTeam.team_city, newTeam.team_color, newTeam.age_group, newTeam.level].filter(Boolean).join(' ');
  const longName = [newTeam.team_city, newTeam.team_mascot, newTeam.team_color, newTeam.age_group, newTeam.level].filter(Boolean).join(' ');
  const cityAbbr = (() => {
    if (!newTeam.team_city) return '';
    const words = newTeam.team_city.trim().split(/\s+/);
    return (words.length > 1 ? words.map((w) => w[0]).join('') : newTeam.team_city.substring(0, 3)).toUpperCase();
  })();

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-base font-display font-bold text-white">Teams ({orgTeams.length})</h3>
        {canManage && (
          <Button size="xs" onClick={openCreateModal}>
            + Add Team
          </Button>
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
                  {canManage && <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 w-36">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {orgTeams.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-900">
                    <td className="px-3 py-2 font-semibold">
                      <div className="flex items-center gap-2">
                        <button onClick={() => onNavigateToTeam?.(t.id, t.org_id)} className="text-action-300 hover:text-action-100 hover:underline text-left">
                          {t.long_name || t.name}
                        </button>
                        {teamPayments[t.id] && !teamPayments[t.id].is_paid && (
                          <Badge variant="danger" className="whitespace-nowrap">Unpaid</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">{t.age_group || '—'}</td>
                    <td className="px-3 py-2">{t.level || '—'}</td>
                    <td className="px-3 py-2">{t.divisions?.length ? t.divisions.map(d => d.name).join(', ') : (t.division || '—')}</td>
                    {canManage && (
                      <td className="px-3 py-2">
                        <div className="flex gap-1.5">
                          <Button size="xs" variant="secondary" onClick={() => openEditModal(t)}>Edit</Button>
                          <Button size="sm" variant="danger" onClick={() => handleUnassign(t)}>Remove</Button>
                        </div>
                      </td>
                    )}
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
                  <div className="flex items-center gap-2">
                    <button onClick={() => onNavigateToTeam?.(t.id, t.org_id)} className="font-semibold text-sm text-action-300 hover:text-action-100 hover:underline text-left">
                      {t.long_name || t.name}
                    </button>
                    {teamPayments[t.id] && !teamPayments[t.id].is_paid && (
                      <Badge variant="danger">Unpaid</Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">{[t.age_group, t.level, t.divisions?.length ? t.divisions.map(d => d.name).join(', ') : t.division].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                {canManage && (
                  <div className="flex gap-1.5">
                    <Button size="xs" variant="secondary" onClick={() => openEditModal(t)}>Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => handleUnassign(t)}>Remove</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="py-4 text-center text-gray-400 text-sm">No teams assigned yet.</div>
      )}

      {showCreate && canManage && (
        <Modal open onClose={() => { setShowCreate(false); setEditingTeam(null); }} title={`${editingTeam ? 'Edit Team' : 'Add Team to'} ${org.name}`} size="lg">
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Input label="Team City *" id="new-team-city" name="team_city" value={newTeam.team_city} onChange={handleCreateChange} required placeholder="e.g. Austin" />
                <Input label="Team Mascot" id="new-team-mascot" name="team_mascot" value={newTeam.team_mascot} onChange={handleCreateChange} placeholder="e.g. Thunder" />
                <Input label="Team Color" id="new-team-color" name="team_color" value={newTeam.team_color} onChange={handleCreateChange} placeholder="e.g. Red" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-team-primary" className="lh-eyebrow block mb-1">Primary Color</label>
                  <div className="flex items-center gap-2">
                    <input id="new-team-primary" type="color" value={newTeam.primary_color} onChange={(e) => setNewTeam((prev) => ({ ...prev, primary_color: e.target.value }))} className="w-10 h-8 rounded border border-gray-600 cursor-pointer p-0.5" />
                    <input type="text" value={newTeam.primary_color} onChange={(e) => setNewTeam((prev) => ({ ...prev, primary_color: e.target.value }))} className="lh-input flex-1 font-mono text-xs" maxLength={7} />
                  </div>
                </div>
                <div>
                  <label htmlFor="new-team-secondary" className="lh-eyebrow block mb-1">Secondary Color</label>
                  <div className="flex items-center gap-2">
                    <input id="new-team-secondary" type="color" value={newTeam.secondary_color} onChange={(e) => setNewTeam((prev) => ({ ...prev, secondary_color: e.target.value }))} className="w-10 h-8 rounded border border-gray-600 cursor-pointer p-0.5" />
                    <input type="text" value={newTeam.secondary_color} onChange={(e) => setNewTeam((prev) => ({ ...prev, secondary_color: e.target.value }))} className="lh-input flex-1 font-mono text-xs" maxLength={7} />
                  </div>
                </div>
              </div>

              {shortName && (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex items-center gap-3">
                    <HomePlate cityAbbr={cityAbbr} label={plateLabel(newTeam.age_group, newTeam.level)} primaryColor={newTeam.primary_color} secondaryColor={newTeam.secondary_color} size="w-12 h-12" />
                    <div className="space-y-1">
                      <div><span className="text-xs font-semibold text-gray-400 uppercase">Long Name:</span> <span className="font-semibold text-gray-200">{longName}</span></div>
                      <div><span className="text-xs font-semibold text-gray-400 uppercase">Short Name:</span> <span className="font-semibold text-gray-200">{shortName}</span></div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="lh-eyebrow block mb-1">Team Logo</label>
                <div className="flex items-center gap-3">
                  {logoPreview && <img src={logoPreview} alt="Logo preview" className="w-14 h-14 object-contain rounded border border-gray-700" />}
                  <div className="flex flex-col gap-1">
                    <label className="btn btn-xs btn-secondary cursor-pointer inline-block w-fit">
                      {logoPreview ? 'Change' : 'Upload'}
                      <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                    </label>
                    {logoPreview && (
                      <Button type="button" size="xs" variant="danger" onClick={handleRemoveLogo}>Remove</Button>
                    )}
                    <p className="text-xs text-gray-400">Max 500 KB. If none, uses org logo.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-team-age" className="lh-eyebrow block mb-1">Age Group</label>
                  {ageGroups.length > 0 ? (
                    <select id="new-team-age" name="age_group" value={newTeam.age_group} onChange={handleCreateChange} className="lh-select">
                      <option value="">— Select —</option>
                      {ageGroups.map((ag) => <option key={ag.id} value={ag.name}>{ag.name}</option>)}
                    </select>
                  ) : (
                    <input id="new-team-age" name="age_group" value={newTeam.age_group} onChange={handleCreateChange} className="lh-input" placeholder="e.g. 12U" />
                  )}
                </div>
                <div>
                  <label htmlFor="new-team-level" className="lh-eyebrow block mb-1">Level</label>
                  {levels.length > 0 ? (
                    <select id="new-team-level" name="level" value={newTeam.level} onChange={handleCreateChange} className="lh-select">
                      <option value="">— Select —</option>
                      {levels.map((lvl) => <option key={lvl.id} value={lvl.name}>{lvl.name}</option>)}
                    </select>
                  ) : (
                    <input id="new-team-level" name="level" value={newTeam.level} onChange={handleCreateChange} className="lh-input" placeholder="e.g. Competitive" />
                  )}
                </div>
              </div>

              <div>
                <label className="lh-eyebrow block mb-1">Season / Divisions</label>
                {seasons.length > 0 ? (
                  <>
                    <select value={selectedSeasonId || ''} onChange={handleSeasonChange} className="lh-select mb-2">
                      {seasons.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
                      ))}
                    </select>
                    {divisions.length > 0 ? (
                      <div className="border border-gray-600 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
                        {divisions.map((dv) => (
                          <label key={dv.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-900 cursor-pointer text-sm"
                            style={{ paddingLeft: `${(dv.depth || 0) * 16 + 8}px` }}>
                            <input
                              type="checkbox"
                              checked={newTeam.division_ids.includes(dv.id)}
                              onChange={() => toggleDivision(dv.id)}
                              className="rounded border-gray-600"
                            />
                            <span className="truncate">{dv.name}</span>
                            {dv.depth > 0 && <span className="text-xs text-gray-400 shrink-0">({dv.path})</span>}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No divisions for this season. Add them in League Config.</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400">No seasons configured. Add them in League Config.</p>
                )}
                {newTeam.division_ids.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {newTeam.division_ids.length} selected: {divisions.filter((d) => newTeam.division_ids.includes(d.id)).map((d) => d.path || d.name).join(', ')}
                  </p>
                )}
              </div>

              {createError && <div className="lh-alert lh-alert-error">{createError}</div>}

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => { setShowCreate(false); setEditingTeam(null); }}>Cancel</Button>
                <Button type="submit" disabled={creating} loading={creating}>{creating ? 'Saving…' : editingTeam ? 'Update Team' : 'Add Team'}</Button>
              </div>
            </form>
        </Modal>
      )}

      {canManage && unassignedTeams.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-3">
          <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}
            className="lh-select flex-1 sm:flex-none sm:min-w-[220px]">
            <option value="">— Assign a team —</option>
            {unassignedTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <Button size="sm" onClick={handleAssign} disabled={!selectedTeamId || assigning}>
            {assigning ? '…' : 'Assign'}
          </Button>
        </div>
      )}
    </div>
  );
}
