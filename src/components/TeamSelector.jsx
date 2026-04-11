import { useState, useEffect, useCallback } from 'react';
import { fetchTeams, fetchOrganizations, fetchAgeGroups, fetchLevels, fetchDivisions, fetchSeasons, createTeam, updateTeam, deleteTeam, uploadTeamLogo, removeTeamLogo } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600";
const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";

export default function TeamSelector({ selectedTeam, onSelectTeam, onTeamsChanged }) {
  const { isAdmin } = useAuth();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  if (loading) return <div className="p-4 text-center text-gray-500">Loading teams…</div>;
  if (error) return <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>;

  const grouped = {};
  const ungrouped = [];
  for (const team of teams) {
    if (team.org_name) {
      if (!grouped[team.org_name]) grouped[team.org_name] = [];
      grouped[team.org_name].push(team);
    } else {
      ungrouped.push(team);
    }
  }
  const orgNames = Object.keys(grouped).sort();

  return (
    <div>
      <label htmlFor="team-select" className={labelCls}>Select Team</label>
      <select
        id="team-select"
        value={selectedTeam || ''}
        onChange={(e) => {
          const id = e.target.value ? Number(e.target.value) : null;
          const team = id ? teams.find(t => t.id === id) : null;
          onSelectTeam(id, team?.org_id || null);
        }}
        className={inputCls}
      >
        <option value="">— Choose a team —</option>
        {orgNames.map((orgName) => (
          <optgroup key={orgName} label={orgName}>
            {grouped[orgName].map((team) => (
              <option key={team.id} value={team.id}>{team.name}{team.age_group ? ` ${team.age_group}` : ''}{team.level ? ` ${team.level}` : ''}</option>
            ))}
          </optgroup>
        ))}
        {ungrouped.length > 0 && orgNames.length > 0 && (
          <optgroup label="Unassigned">
            {ungrouped.map((team) => (
              <option key={team.id} value={team.id}>{team.name}{team.age_group ? ` ${team.age_group}` : ''}{team.level ? ` ${team.level}` : ''}</option>
            ))}
          </optgroup>
        )}
        {ungrouped.length > 0 && orgNames.length === 0 && ungrouped.map((team) => (
          <option key={team.id} value={team.id}>{team.name}{team.age_group ? ` ${team.age_group}` : ''}{team.level ? ` ${team.level}` : ''}</option>
        ))}
      </select>

      {/* Selected team details */}
      {selected && (
        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-sm space-y-1">
            <div className="flex items-center gap-2">
              {(selected.logo_url || selected.org_logo_url) && (
                <img src={selected.logo_url || selected.org_logo_url} alt="" className="w-10 h-10 object-contain rounded shrink-0" />
              )}
              <div>
                <div className="font-semibold text-gray-800">{selected.name}</div>
                {selected.logo_url ? null : selected.org_logo_url ? <span className="text-[10px] text-gray-400">Org logo</span> : null}
              </div>
            </div>
            {selected.age_group && <div className="text-gray-500"><span className="font-medium text-gray-600">Age Group:</span> {selected.age_group}</div>}
            {selected.level && <div className="text-gray-500"><span className="font-medium text-gray-600">Level:</span> {selected.level}</div>}
            {selected.divisions && selected.divisions.length > 0 && (
              <div className="text-gray-500"><span className="font-medium text-gray-600">Division{selected.divisions.length > 1 ? 's' : ''}:</span> {selected.divisions.map(d => d.name).join(', ')}</div>
            )}
            {!selected.divisions?.length && selected.division && (
              <div className="text-gray-500"><span className="font-medium text-gray-600">Division:</span> {selected.division}</div>
            )}
            <div className="text-gray-500">
              <span className="font-medium text-gray-600">Org:</span> {selected.org_name || 'Unassigned'}
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-2 mt-3 pt-2 border-t border-gray-200">
              <button
                onClick={() => { setEditing(true); setShowForm(true); }}
                className="flex-1 px-2 py-1.5 text-xs font-semibold bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >Edit</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-2 py-1.5 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60"
              >{deleting ? '…' : 'Delete'}</button>
            </div>
          )}
        </div>
      )}

      {/* Add Team / Import buttons for admins */}
      {isAdmin && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => { setEditing(false); setShowForm(true); }}
            className="flex-1 px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 transition-colors"
          >+ Add Team</button>
        </div>
      )}

      {teams.length === 0 && !isAdmin && (
        <div className="p-4 text-center text-gray-500">No teams found.</div>
      )}

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
    name: team?.name || '',
    age_group: team?.age_group || '',
    level: team?.level || '',
    org_id: team?.org_id || '',
    division_ids: team?.divisions ? team.divisions.map(d => d.id) : [],
  });

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
      name: form.name.trim(),
      age_group: form.age_group || null,
      level: form.level || null,
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 sm:p-6 my-4">
        <h2 className="text-xl font-bold mb-4">{isEditing ? 'Edit Team' : 'Add Team'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="team-name" className={labelCls}>Team Name *</label>
            <input id="team-name" name="name" type="text" value={form.name} onChange={handleChange} required placeholder="e.g. Thunder 12U" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Team Logo</label>
            <div className="flex items-center gap-3">
              {logoPreview && <img src={logoPreview} alt="Logo preview" className="w-14 h-14 object-contain rounded border border-gray-200" />}
              <div className="flex flex-col gap-1">
                <label className="px-3 py-1.5 text-xs font-semibold bg-gray-200 text-gray-800 rounded hover:bg-gray-300 cursor-pointer inline-block w-fit">
                  {logoPreview ? 'Change' : 'Upload'}
                  <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                </label>
                {logoPreview && (
                  <button type="button" onClick={handleRemoveLogo} className="px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-700 rounded hover:bg-red-200 w-fit">Remove</button>
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
                  <div className="border border-gray-300 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
                    {divisions.map(dv => (
                      <label key={dv.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-sm"
                        style={{ paddingLeft: `${(dv.depth || 0) * 16 + 8}px` }}>
                        <input
                          type="checkbox"
                          checked={form.division_ids.includes(dv.id)}
                          onChange={() => toggleDivision(dv.id)}
                          className="rounded border-gray-300"
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
              <p className="text-xs text-gray-500 mt-1">
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
          {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-200 text-gray-800 text-sm font-semibold rounded-lg hover:bg-gray-300">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 disabled:opacity-60">
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Add Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
