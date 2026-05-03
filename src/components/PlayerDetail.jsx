import { useState, useEffect, useCallback } from 'react';
import {
  fetchPlayerContacts, createPlayerContact, updatePlayerContact, deletePlayerContact,
  fetchPlayerNotes, createPlayerNote, updatePlayerNote, deletePlayerNote,
  fetchPlayerDocuments, uploadPlayerDocument, downloadPlayerDocument, deletePlayerDocument,
  fetchPlayerStats, fetchStatDefinitions,
  updatePlayer, fetchPositions,
  fetchTeams, fetchOrganizations, assignPlayerToTeam, unassignPlayerFromTeam,
  updatePlayerJersey,
  fetchVolunteerRoles, fetchGuardianVolunteers, updateGuardianVolunteers,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ChevronLeftIcon, PlusIcon, TrashIcon, PencilIcon, DocumentIcon, ChatBubbleIcon, UserIcon, ChartBarIcon } from './ui/icons.jsx';
import { formatDOB, calculateAge } from '../utils/dob.js';
import { Button, Input, Select } from './ui';

// Roles that must NOT see guardian contact details (privacy boundary)
const NO_CONTACTS_ROLES = new Set(['score_reporter', 'umpire', 'accountant']);

const ALL_TABS = [
  { key: 'info', label: 'Info' },
  { key: 'contacts', label: 'Guardians' },
  { key: 'stats', label: 'Stats' },
  { key: 'documents', label: 'Documents' },
  { key: 'notes', label: 'Notes' },
];

function JerseyBadge({ num, label, canEdit, onClick }) {
  return (
    <button
      onClick={canEdit ? onClick : undefined}
      disabled={!canEdit}
      title={canEdit ? 'Click to edit jersey number' : undefined}
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border transition-colors
        ${num != null && num !== ''
          ? 'bg-action-900/50 text-action-300 border-action-700/60'
          : 'bg-gray-800 text-gray-500 border-gray-700'}
        ${canEdit ? 'hover:bg-action-800/70 hover:text-action-200 hover:border-action-600 cursor-pointer' : 'cursor-default'}`}
    >
      {num != null && num !== '' ? `#${num}` : '+#'}
      {label && <span className="text-[10px] font-normal text-action-500 ml-0.5">{label}</span>}
    </button>
  );
}

function JerseyInput({ value, onChange, onSave, onCancel, label }) {
  return (
    <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-action-900/60 border border-action-600 text-xs font-bold">
      <span className="text-action-500">#</span>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onSave}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') onCancel(); }}
        className="w-10 bg-transparent text-action-200 font-bold focus:outline-none placeholder-action-700"
        placeholder="—"
        maxLength={3}
      />
      {label && <span className="text-[10px] font-normal text-action-500">{label}</span>}
    </div>
  );
}

export default function PlayerDetail({ player, onBack, onNavigateToTeam, canEdit = true }) {
  const { role } = useAuth();
  const [tab, setTab] = useState('info');
  const [currentPlayer, setCurrentPlayer] = useState(player);
  const [jerseyEditTeamId, setJerseyEditTeamId] = useState(null);
  const [jerseyEditValue, setJerseyEditValue] = useState('');

  // Filter out Guardians tab for roles that shouldn't see contact PII
  const TABS = ALL_TABS.filter(t => t.key !== 'contacts' || !NO_CONTACTS_ROLES.has(role));

  useEffect(() => { setCurrentPlayer(player); }, [player]);

  async function saveHeaderJersey(teamIds) {
    const v = jerseyEditValue.trim();
    setJerseyEditTeamId(null);
    try {
      await Promise.all(teamIds.map(id => updatePlayerJersey(id, currentPlayer.id, v)));
      setCurrentPlayer(p => ({ ...p, teams: p.teams.map(t => teamIds.includes(t.team_id || t.id) ? { ...t, jersey_number: v || null } : t) }));
    } catch { alert('Failed to save jersey number'); }
  }

  if (!currentPlayer) return null;

  const teamJerseys = (currentPlayer.teams || []).map(t => ({ id: t.team_id || t.id, name: t.team_name || t.name, num: t.jersey_number }));
  const allTeamIds = teamJerseys.map(t => t.id);
  const uniqueNums = [...new Set(teamJerseys.map(t => t.num).filter(n => n != null && n !== ''))];
  // Single badge if 0 or 1 teams, or all teams share the same number
  const showSingleBadge = teamJerseys.length <= 1 || uniqueNums.length <= 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
          <ChevronLeftIcon className="w-5 h-5 text-gray-400" />
        </button>
        <div className="w-12 h-12 rounded-full bg-chrome-500/20 flex items-center justify-center">
          <UserIcon className="w-6 h-6 text-chrome-400" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-white">{currentPlayer.first_name} {currentPlayer.last_name}</h2>
            {showSingleBadge ? (
              jerseyEditTeamId === 'all' ? (
                <JerseyInput value={jerseyEditValue} onChange={setJerseyEditValue} onSave={() => saveHeaderJersey(allTeamIds)} onCancel={() => setJerseyEditTeamId(null)} />
              ) : (
                <JerseyBadge
                  num={uniqueNums[0]}
                  canEdit={canEdit && teamJerseys.length > 0}
                  onClick={() => { setJerseyEditValue(String(uniqueNums[0] ?? '')); setJerseyEditTeamId('all'); }}
                />
              )
            ) : (
              // Multiple teams with differing numbers — one badge each
              teamJerseys.map(t => (
                jerseyEditTeamId === t.id ? (
                  <JerseyInput key={t.id} label={t.name} value={jerseyEditValue} onChange={setJerseyEditValue} onSave={() => saveHeaderJersey([t.id])} onCancel={() => setJerseyEditTeamId(null)} />
                ) : (
                  <JerseyBadge key={t.id} num={t.num} label={t.name} canEdit={canEdit} onClick={() => { setJerseyEditValue(String(t.num ?? '')); setJerseyEditTeamId(t.id); }} />
                )
              ))
            )}
          </div>
          <p className="text-sm text-gray-400">
            {currentPlayer.teams?.length ? currentPlayer.teams.map(t => t.name || t.team_name).join(', ') : 'No team'}
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
                ? 'text-chrome-400 border-b-2 border-chrome-400 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'info' && <InfoTab player={currentPlayer} onNavigateToTeam={onNavigateToTeam} canEdit={canEdit} onPlayerUpdated={setCurrentPlayer} />}
      {tab === 'contacts' && <ContactsTab playerId={currentPlayer.id} canEdit={canEdit} />}
      {tab === 'stats' && <StatsTab playerId={currentPlayer.id} />}
      {tab === 'documents' && <DocumentsTab playerId={currentPlayer.id} canEdit={canEdit} />}
      {tab === 'notes' && <NotesTab playerId={currentPlayer.id} canEdit={canEdit} />}
    </div>
  );
}

/* ─── Info Tab ─── */
const BATTING_OPTIONS = ['R', 'L', 'S'];
const THROWING_OPTIONS = ['R', 'L'];
const GRADE_OPTIONS = ['Pre K', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const JERSEY_SIZE_OPTIONS = ['Youth - XS', 'Youth - S', 'Youth - SM', 'Youth - MD', 'Youth - M', 'Youth - L', 'Youth - LG', 'Youth - XL', 'Adult - SM', 'Adult - MD', 'Adult - LG', 'Adult - XL'];
const HAT_SIZE_OPTIONS = ['XS/S', 'S/M', 'M/L', 'L/XL', 'Snapback', 'Visor'];

function InfoTab({ player, onNavigateToTeam, canEdit, onPlayerUpdated }) {
  const [editing, setEditing] = useState(false);
  const [positions, setPositions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => {
    if (editing) fetchPositions().then(setPositions).catch(() => setPositions([]));
  }, [editing]);

  function startEdit() {
    setForm({
      first_name: player.first_name || '',
      last_name: player.last_name || '',
      date_of_birth: player.date_of_birth || '',
      grade: player.grade || '',
      batting_hand: player.batting_hand || '',
      throwing_hand: player.throwing_hand || '',
      email: player.email || '',
      phone: player.phone || '',
      jersey_size: player.jersey_size || '',
      hat_size: player.hat_size || '',
      needs_new_jersey: !!player.needs_new_jersey,
      needs_new_hat: !!player.needs_new_hat,
      position_ids: (player.positions || []).map(p => p.id),
    });
    setError(null);
    setEditing(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updatePlayer(player.id, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        date_of_birth: form.date_of_birth || null,
        grade: form.grade || null,
        batting_hand: form.batting_hand || null,
        throwing_hand: form.throwing_hand || null,
        email: form.email || null,
        phone: form.phone || null,
        jersey_size: form.jersey_size || null,
        hat_size: form.hat_size || null,
        needs_new_jersey: form.needs_new_jersey,
        needs_new_hat: form.needs_new_hat,
        position_ids: form.position_ids,
      });
      onPlayerUpdated({ ...player, ...updated });
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handlePositionToggle(posId) {
    const numId = Number(posId);
    setForm(f => ({
      ...f,
      position_ids: f.position_ids.includes(numId)
        ? f.position_ids.filter(id => id !== numId)
        : [...f.position_ids, numId],
    }));
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <form onSubmit={handleSave} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="eyebrow text-gray-300">Edit Player Info</h3>
          </div>

          {error && <p className="text-sm text-signal-400 bg-signal-900/20 px-3 py-2 rounded-lg">{error}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="First Name *" required value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
            <Input label="Last Name *" required value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
            <Input label="Date of Birth" type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
            <Select label="Grade" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}>
              <option value="">—</option>
              {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </Select>
            <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <Input label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            <Select label="Bats" value={form.batting_hand} onChange={e => setForm(f => ({ ...f, batting_hand: e.target.value }))}>
              <option value="">—</option>
              {BATTING_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
            </Select>
            <Select label="Throws" value={form.throwing_hand} onChange={e => setForm(f => ({ ...f, throwing_hand: e.target.value }))}>
              <option value="">—</option>
              {THROWING_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select label="Jersey Size" value={form.jersey_size} onChange={e => setForm(f => ({ ...f, jersey_size: e.target.value }))}>
              <option value="">—</option>
              {JERSEY_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select label="Hat Size" value={form.hat_size} onChange={e => setForm(f => ({ ...f, hat_size: e.target.value }))}>
              <option value="">—</option>
              {HAT_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div className="flex gap-6 mt-1">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.needs_new_jersey} onChange={e => setForm(f => ({ ...f, needs_new_jersey: e.target.checked }))} className="accent-action-500" />
              Needs New Jersey
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.needs_new_hat} onChange={e => setForm(f => ({ ...f, needs_new_hat: e.target.checked }))} className="accent-action-500" />
              Needs New Hat
            </label>
          </div>

          {positions.length > 0 && (
            <div>
              <label className="eyebrow block mb-2">Positions</label>
              <div className="flex flex-wrap gap-2">
                {positions.map(p => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => handlePositionToggle(p.id)}
                    className={`lh-tab border transition-colors ${
                      form.position_ids.includes(p.id)
                        ? 'lh-tab-active border-action-500'
                        : 'bg-gray-700/40 border-gray-600 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {p.abbreviation || p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" size="sm" loading={saving}>Save</Button>
          </div>
        </form>
      </div>
    );
  }

  const age = calculateAge(player.date_of_birth);

  const fields = [
    { label: 'Date of Birth', value: formatDOB(player.date_of_birth) },
    { label: 'Age', value: age != null ? age : '—' },
    { label: 'Grade', value: player.grade || '—' },
    { label: 'Email', value: player.email ? <a href={`mailto:${player.email}`} className="text-chrome-400 hover:text-chrome-300 underline">{player.email}</a> : '—' },
    { label: 'Phone', value: player.phone ? <a href={`tel:${player.phone}`} className="text-chrome-400 hover:text-chrome-300 underline">{player.phone}</a> : '—' },
    { label: 'Bats / Throws', value: `${player.batting_hand || '—'} / ${player.throwing_hand || '—'}` },
    { label: 'Positions', value: player.positions?.length ? player.positions.map(p => p.abbreviation).join(', ') : '—' },
    { label: 'Jersey Size', value: player.jersey_size ? `${player.jersey_size}${player.needs_new_jersey ? ' ⚠️ needs new' : ''}` : '—' },
    { label: 'Hat Size', value: player.hat_size ? `${player.hat_size}${player.needs_new_hat ? ' ⚠️ needs new' : ''}` : '—' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="eyebrow text-gray-300">Player Info</h3>
          {canEdit && (
            <button onClick={startEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors">
              <PencilIcon className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
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
      <TeamAssignments player={player} canEdit={canEdit} onNavigateToTeam={onNavigateToTeam} onPlayerUpdated={onPlayerUpdated} />
    </div>
  );
}

/* ─── Team Assignments ─── */
function TeamAssignments({ player, canEdit, onNavigateToTeam, onPlayerUpdated }) {
  const [editing, setEditing] = useState(false);
  const [allTeams, setAllTeams] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const currentTeamIds = new Set((player.teams || []).map(t => t.team_id || t.id));

  function startEdit() {
    setSelected(new Set(currentTeamIds));
    setLoading(true);
    Promise.all([fetchTeams(), fetchOrganizations()])
      .then(([t, o]) => { setAllTeams(t); setOrgs(o); })
      .catch(() => {})
      .finally(() => setLoading(false));
    setEditing(true);
  }

  function toggleTeam(teamId) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const toAdd = [...selected].filter(id => !currentTeamIds.has(id));
      const toRemove = [...currentTeamIds].filter(id => !selected.has(id));
      await Promise.all([
        ...toAdd.map(id => assignPlayerToTeam(id, player.id)),
        ...toRemove.map(id => unassignPlayerFromTeam(id, player.id)),
      ]);
      // Rebuild player.teams from the new selection
      const newTeams = [...selected].map(id => {
        const existing = (player.teams || []).find(t => (t.team_id || t.id) === id);
        if (existing) return existing;
        const t = allTeams.find(t => t.id === id);
        return t ? { team_id: t.id, team_name: t.name, org_id: t.org_id, org_name: t.org_name } : { team_id: id };
      });
      onPlayerUpdated({ ...player, teams: newTeams });
      setEditing(false);
    } catch (err) {
      alert('Failed to update teams: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  // Group teams by org
  const teamsByOrg = {};
  const unassignedTeams = [];
  for (const t of allTeams) {
    if (t.org_id) {
      if (!teamsByOrg[t.org_id]) teamsByOrg[t.org_id] = [];
      teamsByOrg[t.org_id].push(t);
    } else {
      unassignedTeams.push(t);
    }
  }

  if (editing) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="eyebrow text-gray-300">Edit Teams</h3>
        </div>
        {loading ? (
          <p className="text-sm text-gray-400">Loading teams…</p>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-3">Check the teams this player should be on.</p>
            <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
              {orgs.map(org => {
                const orgTeams = teamsByOrg[org.id] || [];
                if (!orgTeams.length) return null;
                return (
                  <div key={org.id}>
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{org.name}</div>
                    <div className="space-y-1 ml-2">
                      {orgTeams.map(t => (
                        <label key={t.id} className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-gray-900 cursor-pointer">
                          <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleTeam(t.id)}
                            className="w-4 h-4 text-action-600 rounded border-gray-600 focus:ring-action-500" />
                          <span className="text-sm text-gray-200">{t.name}</span>
                          {t.age_group && <span className="text-xs text-gray-400">{t.age_group}</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {unassignedTeams.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Unassigned</div>
                  <div className="space-y-1 ml-2">
                    {unassignedTeams.map(t => (
                      <label key={t.id} className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-gray-900 cursor-pointer">
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleTeam(t.id)}
                          className="w-4 h-4 text-action-600 rounded border-gray-600 focus:ring-action-500" />
                        <span className="text-sm text-gray-200">{t.name}</span>
                        {t.age_group && <span className="text-xs text-gray-400">{t.age_group}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-700">
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="btn btn-sm btn-primary">
                {saving ? 'Saving…' : 'Save Teams'}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="eyebrow text-gray-300">Teams</h3>
        {canEdit && (
          <button onClick={startEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors">
            <PencilIcon className="w-3.5 h-3.5" /> Edit
          </button>
        )}
      </div>
      {player.teams?.length > 0 ? (
        <div className="space-y-2">
          {player.teams.map(t => (
            <TeamRow key={t.team_id || t.id} team={t} player={player} canEdit={canEdit}
              onNavigateToTeam={onNavigateToTeam} onPlayerUpdated={onPlayerUpdated} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">Not assigned to any team.</p>
      )}
    </div>
  );
}

/* ─── Team Row with inline jersey edit ─── */
function TeamRow({ team: t, player, canEdit, onNavigateToTeam, onPlayerUpdated }) {
  const [jerseyEdit, setJerseyEdit] = useState(false);
  const [jersey, setJersey] = useState(t.jersey_number || '');
  const [saving, setSaving] = useState(false);
  const teamId = t.team_id || t.id;

  async function saveJersey() {
    const trimmed = jersey.trim();
    if (trimmed === (t.jersey_number || '')) { setJerseyEdit(false); return; }
    setSaving(true);
    try {
      await updatePlayerJersey(teamId, player.id, trimmed);
      const updatedTeams = (player.teams || []).map(pt =>
        (pt.team_id || pt.id) === teamId ? { ...pt, jersey_number: trimmed || null } : pt
      );
      onPlayerUpdated({ ...player, teams: updatedTeams });
      setJerseyEdit(false);
    } catch (err) {
      alert('Failed to save jersey number: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-700/40 rounded-lg">
      <button
        className="flex-1 text-left text-sm text-white hover:text-chrome-300 transition-colors truncate"
        onClick={() => onNavigateToTeam?.(teamId, t.org_id)}
      >
        {t.team_name || t.name}
      </button>
      {jerseyEdit ? (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">#</span>
          <input
            autoFocus
            type="text"
            value={jersey}
            onChange={e => setJersey(e.target.value)}
            onBlur={saveJersey}
            onKeyDown={e => { if (e.key === 'Enter') saveJersey(); if (e.key === 'Escape') { setJersey(t.jersey_number || ''); setJerseyEdit(false); } }}
            disabled={saving}
            className="w-14 px-1.5 py-0.5 text-xs bg-gray-900 border border-gray-600 rounded text-gray-100 focus:outline-none focus:ring-1 focus:ring-action-500"
            placeholder="—"
          />
        </div>
      ) : (
        <button
          onClick={() => canEdit && setJerseyEdit(true)}
          className={`text-xs px-2 py-0.5 rounded-full ${t.jersey_number ? 'bg-chrome-500/20 text-chrome-300' : 'bg-gray-600/30 text-gray-500'} ${canEdit ? 'hover:bg-chrome-500/30 cursor-pointer' : ''}`}
          title={canEdit ? 'Click to edit jersey number' : undefined}
          disabled={!canEdit}
        >
          {t.jersey_number ? `#${t.jersey_number}` : 'No #'}
        </button>
      )}
    </div>
  );
}

/* ─── Contacts Tab ─── */
function ContactsTab({ playerId, canEdit }) {
  const { user, role } = useAuth();
  const isStaff = ['super_admin', 'org_admin', 'team_manager'].includes(role);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [volunteerRoles, setVolunteerRoles] = useState([]);
  const [guardianVolunteers, setGuardianVolunteers] = useState({});

  const load = useCallback(() => {
    Promise.all([
      fetchPlayerContacts(playerId),
      fetchVolunteerRoles().catch(() => []),
    ]).then(([c, vr]) => {
      setContacts(c);
      setVolunteerRoles(vr);
      // Staff load all guardians' volunteer data; guardians only load their own linked record
      // Match by user_id OR by email (handles records not yet lazily linked)
      const toFetch = isStaff
        ? c
        : c.filter(g => g.user_id === user?.id || (user?.email && g.email && g.email.toLowerCase() === user.email.toLowerCase()));
      if (toFetch.length) {
        Promise.all(
          toFetch.map(g => fetchGuardianVolunteers(g.id).then(ids => [g.id, ids]).catch(() => [g.id, []]))
        ).then(results => {
          const map = {};
          for (const [gid, ids] of results) map[gid] = ids;
          setGuardianVolunteers(map);
        });
      }
    }).catch(err => {
      if (err.status === 403) setAccessDenied(true);
      else console.error(err);
    }).finally(() => setLoading(false));
  }, [playerId, isStaff, user?.id]);

  useEffect(load, [load]);

  async function toggleVolunteer(guardianId, roleId, checked) {
    const current = guardianVolunteers[guardianId] || [];
    const next = checked ? [...current, roleId] : current.filter(id => id !== roleId);
    setGuardianVolunteers(prev => ({ ...prev, [guardianId]: next }));
    try {
      await updateGuardianVolunteers(guardianId, next);
    } catch (err) {
      console.error(err);
      setGuardianVolunteers(prev => ({ ...prev, [guardianId]: current }));
    }
  }

  function handleSaved() { setShowForm(false); setEditing(null); load(); }

  if (loading) return <Spinner />;

  if (accessDenied) return (
    <p className="text-sm text-gray-500 py-4 text-center">You do not have access to this information</p>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="eyebrow text-gray-300">Guardians</h3>
        {canEdit && (
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="btn btn-xs btn-primary flex items-center gap-1"
          >
            <PlusIcon className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>

      {!contacts.length && !showForm && (
        <p className="text-sm text-gray-500 py-4 text-center">No guardians added yet</p>
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
              {c.email && <p className="text-sm text-gray-400 mt-1"><a href={`mailto:${c.email}`} className="text-chrome-400 hover:text-chrome-300 underline">{c.email}</a></p>}
              {c.phone && <p className="text-sm text-gray-400"><a href={`tel:${c.phone}`} className="text-chrome-400 hover:text-chrome-300 underline">{c.phone}</a></p>}
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
                  <TrashIcon className="w-4 h-4 text-signal-400" />
                </button>
              </div>
            )}
          </div>
          {volunteerRoles.length > 0 && guardianVolunteers[c.id] !== undefined && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-xs font-medium text-gray-400 mb-1.5">Volunteer Interests</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {volunteerRoles.map(role => {
                  const canEditThisGuardian = isStaff || c.user_id === user?.id || (user?.email && c.email && c.email.toLowerCase() === user.email.toLowerCase());
                  return (
                    <label key={role.id} className="flex items-center gap-1.5 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        checked={(guardianVolunteers[c.id] || []).includes(role.id)}
                        onChange={e => toggleVolunteer(c.id, role.id, e.target.checked)}
                        disabled={!canEditThisGuardian}
                        className="rounded border-gray-600 bg-gray-700 text-action-500"
                      />
                      {role.name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
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

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input placeholder="First Name *" required value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} className="lh-input" />
        <input placeholder="Last Name *" required value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className="lh-input" />
        <select value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))} className="lh-select">
          <option value="parent">Parent</option>
          <option value="guardian">Guardian</option>
          <option value="emergency">Emergency Contact</option>
          <option value="other">Other</option>
        </select>
        <input placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="lh-input" />
        <input placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="lh-input" />
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={form.is_primary} onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))} className="rounded border-gray-600 bg-gray-700 text-action-500" />
          Primary Contact
        </label>
      </div>
      <input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="lh-input w-full" />
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" loading={saving}>{contact ? 'Update' : 'Add Contact'}</Button>
      </div>
    </form>
  );
}

/* ─── Stats Tab ─── */
function StatsTab({ playerId }) {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchPlayerStats(playerId),
      fetchStatDefinitions({ active_only: true }),
    ]).then(([s]) => {
      setStats(s);
    }).catch(err => {
      if (err.status === 403) setAccessDenied(true);
      else console.error(err);
    }).finally(() => setLoading(false));
  }, [playerId]);

  if (loading) return <Spinner />;

  if (accessDenied) return (
    <p className="text-sm text-gray-500 py-4 text-center">You do not have access to this information</p>
  );

  if (!stats.length) {
    return <p className="text-sm text-gray-500 py-4 text-center">No stats recorded yet</p>;
  }

  // ── Group rows by game so we can count G (games played) per category ──
  const gamesById = {};
  for (const s of stats) {
    const g = gamesById[s.game_id] || (gamesById[s.game_id] = {
      game_id: s.game_id,
      game_date: s.game_date,
      season_id: s.season_id,
      season_name: s.season_name,
      season_year: s.season_year,
      home_team_name: s.home_team_name,
      away_team_name: s.away_team_name,
      batting: {},
      pitching: {},
    });
    const bucket = s.category === 'pitching' ? g.pitching : g.batting;
    const num = Number(s.value);
    bucket[s.abbreviation.toUpperCase()] = isNaN(num) ? s.value : num;
  }
  const allGames = Object.values(gamesById).sort(
    (a, b) => new Date(b.game_date) - new Date(a.game_date)
  );

  // ── Aggregate by season for the MLB-style summary table ──
  const seasonAgg = {}; // key: season_id || 'unknown'
  for (const g of allGames) {
    const key = g.season_id ?? 'unknown';
    const row = seasonAgg[key] || (seasonAgg[key] = {
      season_id: g.season_id,
      season_name: g.season_name || (g.season_year ? String(g.season_year) : 'Unassigned'),
      season_year: g.season_year || 0,
      battingGames: 0, pitchingGames: 0,
      batting: {}, pitching: {},
    });
    if (Object.keys(g.batting).length) {
      row.battingGames++;
      for (const [k, v] of Object.entries(g.batting)) {
        if (typeof v === 'number') row.batting[k] = (row.batting[k] || 0) + v;
      }
    }
    if (Object.keys(g.pitching).length) {
      row.pitchingGames++;
      for (const [k, v] of Object.entries(g.pitching)) {
        if (typeof v === 'number') row.pitching[k] = (row.pitching[k] || 0) + v;
      }
    }
  }
  const seasons = Object.values(seasonAgg).sort(
    (a, b) => (b.season_year || 0) - (a.season_year || 0)
  );

  const hasBatting = seasons.some(s => s.battingGames > 0);
  const hasPitching = seasons.some(s => s.pitchingGames > 0);

  // ── Career totals ──
  const careerBatting = { G: 0 };
  const careerPitching = { G: 0 };
  for (const s of seasons) {
    careerBatting.G += s.battingGames;
    for (const [k, v] of Object.entries(s.batting)) {
      careerBatting[k] = (careerBatting[k] || 0) + v;
    }
    careerPitching.G += s.pitchingGames;
    for (const [k, v] of Object.entries(s.pitching)) {
      careerPitching[k] = (careerPitching[k] || 0) + v;
    }
  }

  return (
    <div className="space-y-6">
      {hasBatting && (
        <StatTable
          title="Hitting"
          columns={BATTING_COLUMNS}
          seasons={seasons.map(s => ({
            label: s.season_name,
            year: s.season_year,
            row: { ...s.batting, G: s.battingGames, ...battingRates({ ...s.batting, G: s.battingGames }) },
          }))}
          career={{ ...careerBatting, ...battingRates(careerBatting) }}
        />
      )}

      {hasPitching && (
        <StatTable
          title="Pitching"
          columns={PITCHING_COLUMNS}
          seasons={seasons.map(s => ({
            label: s.season_name,
            year: s.season_year,
            row: { ...s.pitching, G: s.pitchingGames, ...pitchingRates({ ...s.pitching, G: s.pitchingGames }) },
          }))}
          career={{ ...careerPitching, ...pitchingRates(careerPitching) }}
        />
      )}

      {/* Game log */}
      <div>
        <h3 className="eyebrow text-gray-300 mb-2">Game Log</h3>
        <div className="space-y-2">
          {allGames.map(g => (
            <div key={g.game_id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-3">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-medium text-white">{g.away_team_name} @ {g.home_team_name}</p>
                <p className="text-xs text-gray-400">{new Date(g.game_date).toLocaleDateString()}</p>
              </div>
              {Object.keys(g.batting).length > 0 && (
                <GameStatLine label="B" stats={g.batting} columns={BATTING_GAMELOG_COLUMNS} rates={battingRates(g.batting)} />
              )}
              {Object.keys(g.pitching).length > 0 && (
                <GameStatLine label="P" stats={g.pitching} columns={PITCHING_GAMELOG_COLUMNS} rates={pitchingRates(g.pitching)} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Stat helpers ─── */
const BATTING_COLUMNS = [
  { key: 'G', label: 'G' },
  { key: 'AB', label: 'AB' },
  { key: 'R', label: 'R' },
  { key: 'H', label: 'H' },
  { key: '2B', label: '2B' },
  { key: '3B', label: '3B' },
  { key: 'HR', label: 'HR' },
  { key: 'RBI', label: 'RBI' },
  { key: 'BB', label: 'BB' },
  { key: 'K', label: 'SO' },
  { key: 'SB', label: 'SB' },
  { key: 'AVG', label: 'AVG', rate: true },
  { key: 'OBP', label: 'OBP', rate: true },
  { key: 'SLG', label: 'SLG', rate: true },
  { key: 'OPS', label: 'OPS', rate: true },
];

const BATTING_GAMELOG_COLUMNS = ['AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K'];

const PITCHING_COLUMNS = [
  { key: 'G', label: 'G' },
  { key: 'W', label: 'W' },
  { key: 'L', label: 'L' },
  { key: 'SV', label: 'SV' },
  { key: 'IP', label: 'IP', display: formatIP },
  { key: 'HA', label: 'H' },
  { key: 'RA', label: 'R' },
  { key: 'ER', label: 'ER' },
  { key: 'BB', label: 'BB' },
  { key: 'K', label: 'SO' },
  { key: 'PC', label: 'PC' },
  { key: 'ERA', label: 'ERA', rate: true, decimals: 2 },
  { key: 'WHIP', label: 'WHIP', rate: true, decimals: 2 },
];

const PITCHING_GAMELOG_COLUMNS = ['IP', 'HA', 'RA', 'ER', 'BB', 'K', 'PC'];

function battingRates(b) {
  const ab = +b.AB || 0;
  const h = +b.H || 0;
  const bb = +b.BB || 0;
  const dbl = +b['2B'] || 0;
  const tpl = +b['3B'] || 0;
  const hr = +b.HR || 0;
  const avg = ab > 0 ? h / ab : 0;
  const obpDen = ab + bb;
  const obp = obpDen > 0 ? (h + bb) / obpDen : 0;
  const tb = h + dbl + 2 * tpl + 3 * hr;
  const slg = ab > 0 ? tb / ab : 0;
  const ops = obp + slg;
  return { AVG: avg, OBP: obp, SLG: slg, OPS: ops };
}

function pitchingRates(p) {
  // IP is stored with .1/.2 thirds notation (e.g., 5.2 = 5⅔). Convert to outs.
  const outs = ipToOuts(+p.IP || 0);
  const innings = outs / 3;
  const er = +p.ER || 0;
  const ha = +p.HA || 0;
  const bb = +p.BB || 0;
  const era = innings > 0 ? (er * 9) / innings : 0;
  const whip = innings > 0 ? (ha + bb) / innings : 0;
  return { ERA: era, WHIP: whip };
}

function ipToOuts(ip) {
  const whole = Math.floor(ip);
  const frac = Math.round((ip - whole) * 10);
  return whole * 3 + (frac === 1 ? 1 : frac === 2 ? 2 : 0);
}

function formatIP(ip) {
  if (ip == null || ip === '') return '—';
  const n = Number(ip);
  if (isNaN(n)) return ip;
  return n.toFixed(1);
}

function formatRate(v, decimals = 3) {
  if (v == null || isNaN(v)) return '—';
  if (decimals === 3) {
    // Drop leading zero (e.g., .345)
    const s = v.toFixed(3);
    return v < 1 ? s.replace(/^0/, '') : s;
  }
  return v.toFixed(decimals);
}

function StatTable({ title, columns, seasons, career }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-700 bg-gray-900/40">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900/30 border-b border-gray-700">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-300 uppercase tracking-wider">Season</th>
              {columns.map(c => (
                <th key={c.key} className="text-right px-2 py-2 text-xs font-semibold text-gray-300 uppercase tracking-wider tabular-nums">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seasons.map((s, i) => (
              <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                <td className="px-3 py-2 text-gray-100 whitespace-nowrap">{s.label}</td>
                {columns.map(c => (
                  <td key={c.key} className="text-right px-2 py-2 text-gray-100 tabular-nums">
                    {renderStatCell(s.row[c.key], c)}
                  </td>
                ))}
              </tr>
            ))}
            {seasons.length > 1 && (
              <tr className="bg-gray-900/40 font-bold border-t border-gray-600">
                <td className="px-3 py-2 text-white">Career</td>
                {columns.map(c => (
                  <td key={c.key} className="text-right px-2 py-2 text-white tabular-nums">
                    {renderStatCell(career[c.key], c)}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderStatCell(value, col) {
  if (col.rate) return formatRate(value, col.decimals ?? 3);
  if (col.display) return col.display(value);
  if (value == null || value === '') return '—';
  return value;
}

function GameStatLine({ label, stats, columns, rates }) {
  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-action-700 text-white font-bold text-[10px]">{label}</span>
      {columns.map(k => (
        <span key={k} className="text-gray-300">
          <span className="text-gray-500">{k === 'K' ? 'SO' : k === 'HA' ? 'H' : k === 'RA' ? 'R' : k}</span>{' '}
          <span className="font-semibold text-white tabular-nums">
            {k === 'IP' ? formatIP(stats[k]) : (stats[k] ?? 0)}
          </span>
        </span>
      ))}
      {label === 'B' && (
        <>
          <span className="text-gray-300"><span className="text-gray-500">AVG</span> <span className="font-semibold text-white tabular-nums">{formatRate(rates.AVG)}</span></span>
          <span className="text-gray-300"><span className="text-gray-500">OPS</span> <span className="font-semibold text-white tabular-nums">{formatRate(rates.OPS)}</span></span>
        </>
      )}
      {label === 'P' && (
        <>
          <span className="text-gray-300"><span className="text-gray-500">ERA</span> <span className="font-semibold text-white tabular-nums">{formatRate(rates.ERA, 2)}</span></span>
          <span className="text-gray-300"><span className="text-gray-500">WHIP</span> <span className="font-semibold text-white tabular-nums">{formatRate(rates.WHIP, 2)}</span></span>
        </>
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
        <h3 className="eyebrow text-gray-300">Documents</h3>
        {canEdit && (
          <label className="btn btn-xs btn-primary flex items-center gap-1 cursor-pointer">
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
            <button onClick={() => handleDownload(d)} className="px-3 py-1 text-xs text-chrome-400 hover:text-chrome-300 transition-colors">Download</button>
            {canEdit && (
              <button onClick={() => handleDelete(d.id)} className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors">
                <TrashIcon className="w-4 h-4 text-signal-400" />
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
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder:text-gray-500 focus:ring-2 focus:ring-action-500 focus:border-transparent"
          />
          <button type="submit" disabled={saving || !newNote.trim()} className="btn btn-sm btn-primary">
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
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-action-500"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                <button onClick={() => handleUpdate(n.id)} className="text-xs text-chrome-400 hover:text-chrome-300">Save</button>
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
                    <TrashIcon className="w-4 h-4 text-signal-400" />
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
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-chrome-400 border-t-transparent" />
    </div>
  );
}
