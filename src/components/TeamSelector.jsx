import { useState, useEffect, useCallback } from 'react';
import { fetchTeams, fetchOrganizations, fetchAgeGroups, fetchLevels, fetchDivisions, fetchSeasons, createTeam, updateTeam, deleteTeam, uploadTeamLogo, removeTeamLogo } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import TeamLogo, { HomePlate, plateLabel } from './TeamLogo.jsx';
import { cn } from '../lib/cn.js';

const inputCls = "lh-input";
const labelCls = "eyebrow block mb-1";

export default function TeamSelector({ selectedTeam, onSelectTeam, onTeamsChanged }) {
  const { isAdmin, permissions } = useAuth();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [collapsed, setCollapsed] = useState(null); // null = not yet initialized
  const [mobileOpen, setMobileOpen] = useState(false);

  const loadTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTeams();
      setTeams(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTeams(); }, [loadTeams]);

  const selected = selectedTeam ? teams.find(t => t.id === selectedTeam) : null;

  async function handleDelete() {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.name}"? This will remove all players and staff on this team.`)) return;
    setDeleting(true);
    try {
      await deleteTeam(selected.id);
      onSelectTeam(null, null);
      await loadTeams();
      if (onTeamsChanged) onTeamsChanged();
    } catch (err) {
      alert(`Failed to delete: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  function handleFormDone() {
    setShowForm(false);
    setEditing(false);
    loadTeams();
    if (onTeamsChanged) onTeamsChanged();
  }

  function handleSelectTeam(id, orgId) {
    onSelectTeam(id, orgId);
    // Auto-collapse on mobile after selection
    if (window.innerWidth < 1024) setMobileOpen(false);
  }

  function toggleOrg(orgName) {
    setCollapsed(prev => ({ ...prev, [orgName]: !prev[orgName] }));
  }

  if (loading) return <div className="p-4 text-center text-gray-400">Loading teams…</div>;
  if (error) return <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>;

  // Group teams by organization
  const grouped = {};
  const ungrouped = [];
  for (const team of teams) {
    if (team.org_name) {
      if (!grouped[team.org_name]) grouped[team.org_name] = { orgId: team.org_id, logo: team.org_logo_url, teams: [] };
      grouped[team.org_name].teams.push(team);
    } else {
      ungrouped.push(team);
    }
  }
  const orgNames = Object.keys(grouped).sort();

  // Initialize collapsed state: all collapsed, auto-expand the user's org(s) and the selected team's org
  if (collapsed === null && orgNames.length > 0) {
    const init = {};
    for (const name of orgNames) init[name] = true;
    // Expand orgs the current user is assigned to (admin or team member)
    const userOrgIds = new Set([
      ...(permissions?.org_ids || []),
      ...(permissions?.team_org_ids || []),
    ]);
    if (userOrgIds.size > 0) {
      for (const name of orgNames) {
        if (userOrgIds.has(grouped[name].orgId)) init[name] = false;
      }
    }
    // Also expand the org that contains the selected team
    if (selectedTeam) {
      const selTeam = teams.find(t => t.id === selectedTeam);
      if (selTeam?.org_name) init[selTeam.org_name] = false;
    }
    setCollapsed(init);
  }

  // Effective collapsed state (treat null as all-expanded fallback)
  const col = collapsed || {};

  const teamList = (
    <>
      {/* Hierarchical org → team tree */}
      {orgNames.map((orgName) => {
        const org = grouped[orgName];
        const isCollapsed = col[orgName];
        const hasSelected = org.teams.some(t => t.id === selectedTeam);

        return (
          <div key={orgName} className="mb-1">
            <button
              onClick={() => toggleOrg(orgName)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs font-bold uppercase tracking-wide transition-colors',
                hasSelected ? 'text-field-200 bg-field-900/20' : 'text-gray-400 hover:bg-gray-900'
              )}
            >
              {org.logo && (
                <img src={org.logo} alt="" className="w-4 h-4 object-contain rounded shrink-0" />
              )}
              <span className="flex-1 truncate">{orgName}</span>
              <svg className={cn('w-3.5 h-3.5 shrink-0 transition-transform', isCollapsed ? '-rotate-90' : '')} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>

            {!isCollapsed && (
              <div className="ml-2 border-l border-gray-700 pl-1 mt-0.5 space-y-0.5">
                {org.teams.map((team) => (
                  <TeamItem
                    key={team.id}
                    team={team}
                    isSelected={team.id === selectedTeam}
                    onSelect={() => handleSelectTeam(team.id, team.org_id || null)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Ungrouped teams */}
      {ungrouped.length > 0 && orgNames.length > 0 && (
        <div className="mb-1">
          <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Unassigned</p>
          <div className="space-y-0.5">
            {ungrouped.map((team) => (
              <TeamItem
                key={team.id}
                team={team}
                isSelected={team.id === selectedTeam}
                onSelect={() => handleSelectTeam(team.id, team.org_id || null)}
              />
            ))}
          </div>
        </div>
      )}
      {ungrouped.length > 0 && orgNames.length === 0 && (
        <div className="space-y-0.5">
          {ungrouped.map((team) => (
            <TeamItem
              key={team.id}
              team={team}
              isSelected={team.id === selectedTeam}
              onSelect={() => handleSelectTeam(team.id, team.org_id || null)}
            />
          ))}
        </div>
      )}

      {teams.length === 0 && !isAdmin && (
        <div className="p-4 text-center text-gray-400 text-sm">No teams found.</div>
      )}

    </>
  );

  return (
    <div className="space-y-1">
      {/* Mobile: compact toggle bar */}
      <div className="lg:hidden">
        <button
          onClick={() => setMobileOpen(prev => !prev)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-gray-900 rounded-lg border border-gray-700 text-left"
        >
          {selected ? (
            <>
              {(selected.logo_url || selected.org_logo_url) ? (
                <img src={selected.logo_url || selected.org_logo_url} alt="" className="w-7 h-7 object-contain rounded shrink-0" />
              ) : (
                <HomePlate
                  label={plateLabel(selected.age_group, selected.level)}
                  cityAbbr={selected.city_abbr || selected.abbreviation?.slice(0, 3) || ''}
                  primaryColor={selected.primary_color || '#003366'}
                  secondaryColor={selected.secondary_color || '#CC0000'}
                  size="w-7 h-7"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-200 truncate">{selected.name}</p>
                {selected.age_group && <p className="text-[10px] text-gray-400">{selected.age_group}{selected.level ? ` · ${selected.level}` : ''}</p>}
              </div>
            </>
          ) : (
            <span className="flex-1 text-sm text-gray-400">Select a team…</span>
          )}
          <svg className={cn('w-4 h-4 text-gray-400 shrink-0 transition-transform', mobileOpen ? 'rotate-180' : '')} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        {isAdmin && (
          <div className="mt-2">
            <button
              onClick={() => { setEditing(false); setShowForm(true); }}
              className="w-full px-2 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >+ Add Team</button>
          </div>
        )}
        {isAdmin && selected && (
          <div className="mt-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest">Selected Team</p>
                <p className="text-sm font-semibold text-gray-200 truncate">{selected.name}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => { setEditing(true); setShowForm(true); }}
                  className="px-2 py-1.5 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
                >Edit</button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-2 py-1.5 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >{deleting ? '…' : 'Delete'}</button>
              </div>
            </div>
          </div>
        )}
        {mobileOpen && (
          <div className="mt-2 max-h-80 overflow-y-auto">
            {teamList}
          </div>
        )}
      </div>

      {/* Desktop: always visible */}
      <div className="hidden lg:block">
        <div className="flex items-center justify-between gap-2 mb-2 px-1">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Teams</p>
          {isAdmin && (
            <div className="flex gap-1">
              <button
                onClick={() => { setEditing(false); setShowForm(true); }}
                className="px-2 py-1 text-[11px] font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >+ Add Team</button>
            </div>
          )}
        </div>
        {isAdmin && selected && (
          <div className="mb-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest">Selected Team</p>
                <p className="text-sm font-semibold text-gray-200 truncate">{selected.name}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => { setEditing(true); setShowForm(true); }}
                  className="px-2 py-1 text-[11px] font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
                >Edit</button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-2 py-1 text-[11px] font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >{deleting ? '…' : 'Delete'}</button>
              </div>
            </div>
          </div>
        )}
        {teamList}
      </div>

      {showForm && (
        <TeamForm
          team={editing ? selected : null}
          onDone={handleFormDone}
          onCancel={() => { setShowForm(false); setEditing(false); }}
        />
      )}
    </div>
  );
}

function TeamItem({ team, isSelected, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors text-sm',
        isSelected
          ? 'bg-field-900/30 text-field-200 font-semibold shadow-sm ring-1 ring-field-300'
          : 'text-gray-300 hover:bg-gray-900'
      )}
    >
      {(team.logo_url || team.org_logo_url) ? (
        <img src={team.logo_url || team.org_logo_url} alt="" className="w-6 h-6 object-contain rounded shrink-0" />
      ) : (
        <HomePlate
          label={plateLabel(team.age_group, team.level)}
          cityAbbr={team.city_abbr || team.abbreviation?.slice(0, 3) || ''}
          primaryColor={team.primary_color || '#003366'}
          secondaryColor={team.secondary_color || '#CC0000'}
          size="w-6 h-6"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="truncate leading-tight">{team.name}</p>
        {team.age_group && (
          <p className="text-[10px] text-gray-400 leading-tight">{team.age_group}{team.level ? ` · ${team.level}` : ''}</p>
        )}
      </div>
    </button>
  );
}

function TeamForm({ team, onDone, onCancel }) {
  const isEditing = !!team;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [ageGroups, setAgeGroups] = useState([]);
  const [levels, setLevels] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(team?.logo_url || null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [form, setForm] = useState({
    team_city: team?.team_city || '',
    team_color: team?.team_color || '',
    team_mascot: team?.team_mascot || '',
    age_group: team?.age_group || '',
    level: team?.level || '',
    org_id: team?.org_id || '',
    primary_color: team?.primary_color || '#003366',
    secondary_color: team?.secondary_color || '#CC0000',
    division_ids: team?.divisions ? team.divisions.map(d => d.id) : [],
  });

  // Computed name previews
  const shortName = [form.team_city, form.team_color, form.age_group, form.level].filter(Boolean).join(' ');
  const longName = [form.team_city, form.team_mascot, form.team_color, form.age_group, form.level].filter(Boolean).join(' ');
  const abbreviation = (() => {
    let abbr = '';
    if (form.team_city) {
      const words = form.team_city.trim().split(/\s+/);
      abbr = words.length > 1 ? words.map(w => w[0]).join('') : form.team_city.substring(0, 3);
    }
    if (form.team_mascot) abbr += form.team_mascot[0];
    if (form.team_color) abbr += form.team_color[0];
    if (form.age_group) abbr += form.age_group.replace(/\s+/g, '');
    if (form.level) abbr += form.level.replace(/\s+/g, '');
    return abbr.toUpperCase();
  })();
  const cityAbbr = (() => {
    if (!form.team_city) return '';
    const words = form.team_city.trim().split(/\s+/);
    return (words.length > 1 ? words.map(w => w[0]).join('') : form.team_city.substring(0, 3)).toUpperCase();
  })();

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

  useEffect(() => {
    (async () => {
      try {
        const [orgData, agData, lvData, ssData] = await Promise.all([
          fetchOrganizations(), fetchAgeGroups(), fetchLevels(), fetchSeasons(),
        ]);
        setOrgs(orgData);
        setAgeGroups(agData);
        setLevels(lvData);
        setSeasons(ssData);
        // Default to active season
        const active = ssData.find(s => s.is_active);
        const sid = active ? active.id : (ssData.length > 0 ? ssData[0].id : null);
        setSelectedSeasonId(sid);
        if (sid) {
          setDivisions(await fetchDivisions(sid));
        }
      } catch {}
    })();
  }, []);

  async function handleSeasonChange(e) {
    const sid = e.target.value ? Number(e.target.value) : null;
    setSelectedSeasonId(sid);
    if (sid) {
      try { setDivisions(await fetchDivisions(sid)); }
      catch { setDivisions([]); }
    } else {
      setDivisions([]);
    }
  }

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function toggleDivision(divId) {
    setForm(prev => ({
      ...prev,
      division_ids: prev.division_ids.includes(divId)
        ? prev.division_ids.filter(id => id !== divId)
        : [...prev.division_ids, divId],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const data = {
      team_city: form.team_city.trim(),
      team_color: form.team_color.trim(),
      team_mascot: form.team_mascot.trim(),
      age_group: form.age_group || null,
      level: form.level || null,
      primary_color: form.primary_color || null,
      secondary_color: form.secondary_color || null,
      division_ids: form.division_ids,
      org_id: form.org_id ? Number(form.org_id) : null,
    };
    try {
      let savedTeam;
      if (isEditing) {
        savedTeam = await updateTeam(team.id, data);
      } else {
        savedTeam = await createTeam(data);
      }
      const teamId = savedTeam.id;
      if (logoFile) {
        await uploadTeamLogo(teamId, logoFile);
      } else if (removeLogo && isEditing) {
        await removeTeamLogo(teamId);
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
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-5 sm:p-6 my-4">
        <h2 className="text-xl font-heading font-bold text-white mb-4">{isEditing ? 'Edit Team' : 'Add Team'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="team-city" className={labelCls}>Team City *</label>
              <input id="team-city" name="team_city" type="text" value={form.team_city} onChange={handleChange} required placeholder="e.g. Austin" className={inputCls} />
            </div>
            <div>
              <label htmlFor="team-mascot" className={labelCls}>Team Mascot</label>
              <input id="team-mascot" name="team_mascot" type="text" value={form.team_mascot} onChange={handleChange} placeholder="e.g. Thunder" className={inputCls} />
            </div>
            <div>
              <label htmlFor="team-color" className={labelCls}>Team Color</label>
              <input id="team-color" name="team_color" type="text" value={form.team_color} onChange={handleChange} placeholder="e.g. Red" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="primary-color" className={labelCls}>Primary Color</label>
              <div className="flex items-center gap-2">
                <input id="primary-color" type="color" value={form.primary_color} onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))} className="w-10 h-8 rounded border border-gray-600 cursor-pointer p-0.5" />
                <input type="text" value={form.primary_color} onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))} className={inputCls + ' flex-1 font-mono text-xs'} maxLength={7} />
              </div>
            </div>
            <div>
              <label htmlFor="secondary-color" className={labelCls}>Secondary Color</label>
              <div className="flex items-center gap-2">
                <input id="secondary-color" type="color" value={form.secondary_color} onChange={e => setForm(prev => ({ ...prev, secondary_color: e.target.value }))} className="w-10 h-8 rounded border border-gray-600 cursor-pointer p-0.5" />
                <input type="text" value={form.secondary_color} onChange={e => setForm(prev => ({ ...prev, secondary_color: e.target.value }))} className={inputCls + ' flex-1 font-mono text-xs'} maxLength={7} />
              </div>
            </div>
          </div>
          {shortName && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex items-center gap-3">
                <HomePlate cityAbbr={cityAbbr} label={plateLabel(form.age_group, form.level)} primaryColor={form.primary_color} secondaryColor={form.secondary_color} size="w-12 h-12" />
                <div className="space-y-1">
                  <div><span className="text-xs font-semibold text-gray-400 uppercase">Long Name:</span> <span className="font-semibold text-gray-200">{longName}</span></div>
                  <div><span className="text-xs font-semibold text-gray-400 uppercase">Short Name:</span> <span className="font-semibold text-gray-200">{shortName}</span></div>
                  <div><span className="text-xs font-semibold text-gray-400 uppercase">Abbreviation:</span> <span className="font-mono font-semibold text-gray-200">{abbreviation}</span></div>
                </div>
              </div>
            </div>
          )}
          <div>
            <label className={labelCls}>Team Logo</label>
            <div className="flex items-center gap-3">
              {logoPreview && <img src={logoPreview} alt="Logo preview" className="w-14 h-14 object-contain rounded border border-gray-700" />}
              <div className="flex flex-col gap-1">
                <label className="px-3 py-1.5 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600 cursor-pointer inline-block w-fit">
                  {logoPreview ? 'Change' : 'Upload'}
                  <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                </label>
                {logoPreview && (
                  <button type="button" onClick={handleRemoveLogo} className="px-3 py-1.5 text-xs font-semibold bg-red-900/35 text-red-300 rounded hover:bg-red-800/60 w-fit">Remove</button>
                )}
                <p className="text-xs text-gray-400">Max 500 KB. If none, uses org logo.</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="team-age-group" className={labelCls}>Age Group</label>
              {ageGroups.length > 0 ? (
                <select id="team-age-group" name="age_group" value={form.age_group} onChange={handleChange} className={inputCls}>
                  <option value="">— Select —</option>
                  {ageGroups.map(ag => <option key={ag.id} value={ag.name}>{ag.name}</option>)}
                </select>
              ) : (
                <input id="team-age-group" name="age_group" type="text" value={form.age_group} onChange={handleChange} placeholder="e.g. 12U" className={inputCls} />
              )}
            </div>
            <div>
              <label htmlFor="team-level" className={labelCls}>Level</label>
              {levels.length > 0 ? (
                <select id="team-level" name="level" value={form.level} onChange={handleChange} className={inputCls}>
                  <option value="">— Select —</option>
                  {levels.map(lv => <option key={lv.id} value={lv.name}>{lv.name}</option>)}
                </select>
              ) : (
                <input id="team-level" name="level" type="text" value={form.level} onChange={handleChange} placeholder="e.g. Competitive" className={inputCls} />
              )}
            </div>
          </div>
          <div>
            <label className={labelCls}>Season / Divisions</label>
            {seasons.length > 0 ? (
              <>
                <select value={selectedSeasonId || ''} onChange={handleSeasonChange} className={inputCls + ' mb-2'}>
                  {seasons.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
                  ))}
                </select>
                {divisions.length > 0 ? (
                  <div className="border border-gray-600 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
                    {divisions.map(dv => (
                      <label key={dv.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-900 cursor-pointer text-sm"
                        style={{ paddingLeft: `${(dv.depth || 0) * 16 + 8}px` }}>
                        <input
                          type="checkbox"
                          checked={form.division_ids.includes(dv.id)}
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
            {form.division_ids.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {form.division_ids.length} selected: {divisions.filter(d => form.division_ids.includes(d.id)).map(d => d.path || d.name).join(', ')}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="team-org" className={labelCls}>Organization</label>
            <select id="team-org" name="org_id" value={form.org_id} onChange={handleChange} className={inputCls}>
              <option value="">— None —</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Add Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
