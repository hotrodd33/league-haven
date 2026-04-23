import { useState, useEffect } from 'react';
import { clearData, exportDataUrl, importData, fetchSeasons, fetchTeams, fetchOrganizations } from '../api/index.js';
import { Button, Input, Select, Card } from './ui';

const ENTITIES = [
  { key: 'organizations', label: 'Organizations', icon: '🏢', cols: 'name, contact_name, contact_email, contact_phone, address, city, state, zip, notes' },
  { key: 'locations', label: 'Field Locations', icon: '📍', cols: 'name, org_name, address, city, state, zip, latitude, longitude, comments' },
  { key: 'seasons', label: 'Seasons', icon: '📅', cols: 'name, year, is_active, sort_order' },
  { key: 'divisions', label: 'Divisions', icon: '🏆', cols: 'division_path (e.g. "10U AA / East"), season, season_year, sort_order' },
  { key: 'teams', label: 'Teams', icon: '⚾', cols: 'abbreviation (auto-generated), team_city, team_mascot, team_color, primary_color, secondary_color, team_name (auto-generated), org_name, age_group, level, division (full path; use ; for multiple)' },
  { key: 'players', label: 'Players / Rosters', icon: '🧢', cols: 'first_name, last_name, date_of_birth, batting_hand, throwing_hand, grade, player_email, player_phone, jersey_size, hat_size, needs_new_jersey, needs_new_hat, team (use "Team (Org)" if names overlap), jersey_number, guardian1_first_name, guardian1_last_name, guardian1_email, guardian1_phone, guardian1_relationship, guardian2_first_name, guardian2_last_name, guardian2_email, guardian2_phone, guardian2_relationship' },
  { key: 'staff', label: 'Coaches / Staff', icon: '👔', cols: 'name, email, phone, team (use "Team (Org)" if names overlap), role (head_coach / assistant_coach / scorekeeper / org_admin / scheduling_contact)' },
  { key: 'games', label: 'Games / Schedule', icon: '🗓️', cols: 'game_date, game_time, home_team, away_team (use "Team (Org)" if names overlap), location, season, status, home_score, away_score, innings_played, notes' },
];

const CLEAR_GROUPS = [
  { label: 'All League Data', desc: 'Games, players, staff, teams, divisions, seasons, locations, orgs, age groups, levels', entities: ['games','players','staff','divisions','teams','locations','organizations','seasons','age_groups','levels'] },
  { label: 'Games Only', desc: 'Delete all games and pitch counts', entities: ['games'] },
  { label: 'Rosters Only', desc: 'Delete all players and roster assignments', entities: ['players'] },
  { label: 'Staff Only', desc: 'Delete all staff and team assignments', entities: ['staff'] },
  { label: 'Teams + Rosters + Staff', desc: 'Delete teams, players, staff, and division assignments', entities: ['games', 'players', 'staff', 'teams'] },
  { label: 'League Config', desc: 'Divisions, seasons, age groups, levels', entities: ['divisions', 'seasons', 'age_groups', 'levels'] },
];

export default function DataManager({ onOpenImport }) {
  const [tab, setTab] = useState('import');
  const [selectedEntity, setSelectedEntity] = useState('teams');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState('create_update');
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(null);
  const [clearResult, setClearResult] = useState(null);
  const [exportOrgId, setExportOrgId] = useState('');
  const [exportTeamId, setExportTeamId] = useState('');
  const [orgs, setOrgs] = useState([]);
  const [teams, setTeams] = useState([]);

  const exportFilename = (entityKey, tId, oId) => {
    const date = new Date().toISOString().slice(0, 10);
    let filter = 'all';
    if (tId) {
      const t = teams.find(t => String(t.id) === String(tId));
      if (t) filter = t.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    } else if (oId) {
      const o = orgs.find(o => String(o.id) === String(oId));
      if (o) filter = o.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    }
    return `${entityKey}_${filter}_${date}.csv`;
  };

  useEffect(() => {
    (async () => {
      try {
        const [ss, ts, os] = await Promise.all([fetchSeasons(), fetchTeams(), fetchOrganizations()]);
        setSeasons(ss);
        setTeams(ts);
        setOrgs(os);
        const active = ss.find(s => s.is_active);
        setSeasonId(active ? active.id : ss.length > 0 ? ss[0].id : null);
      } catch {}
    })();
  }, []);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setCsv(ev.target.result);
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!csv.trim()) { setError('Paste CSV text or upload a file'); return; }
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const res = await importData(selectedEntity, csv, mode, seasonId);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleClear(group) {
    setClearing(true);
    setClearResult(null);
    try {
      const res = await clearData(group.entities);
      setClearResult(res);
      setClearConfirm(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setClearing(false);
    }
  }

  const entity = ENTITIES.find(e => e.key === selectedEntity);
  const rowCount = csv.trim() ? csv.trim().split(/\r?\n/).length - 1 : 0;
  const needsSeason = ['teams', 'divisions'].includes(selectedEntity);

  const tabCls = (t) => `lh-tab ${tab === t ? 'lh-tab-active' : 'lh-tab-inactive'}`;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-display font-bold text-white mb-1">Data Manager</h1>
      <p className="text-sm text-gray-400 mb-4">Import, export, and manage all league data via CSV.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-0">
        <button className={tabCls('import')} onClick={() => setTab('import')}>Import</button>
        <button className={tabCls('export')} onClick={() => setTab('export')}>Export</button>
        <button className={tabCls('clear')} onClick={() => setTab('clear')}>Clear Data</button>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-b-xl rounded-tr-xl p-5">

        {/* ── IMPORT TAB ── */}
        {tab === 'import' && (
          <div className="space-y-4">
            {/* GameChanger wizard shortcut */}
            {onOpenImport && (
              <div className="flex items-center justify-between bg-accent-900/20 border border-accent-700 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-100">Import from GameChanger</p>
                  <p className="text-xs text-gray-400 mt-0.5">Box scores, rosters, and schedules with guided team &amp; player mapping.</p>
                </div>
                <Button
                  variant="warn"
                  size="sm"
                  onClick={onOpenImport}
                  className="ml-4 shrink-0"
                >
                  Open Wizard
                </Button>
              </div>
            )}

            {/* Entity selector */}
            <div>
              <label className="eyebrow block mb-1">What to import</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ENTITIES.map(ent => (
                  <button key={ent.key}
                    onClick={() => { setSelectedEntity(ent.key); setResult(null); setError(null); }}
                    className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${selectedEntity === ent.key ? 'border-chrome-600 bg-chrome-900/30 text-chrome-300 font-semibold' : 'border-gray-700 hover:border-gray-600 text-gray-300'}`}
                  >
                    <span className="mr-1">{ent.icon}</span> {ent.label}
                  </button>
                ))}
              </div>
            </div>

            {!result ? (
              <>
                {/* File upload / paste */}
                <div>
                  <label className="eyebrow block mb-1">CSV File or Paste</label>
                  <div className="flex gap-2 mb-2">
                    <Button size="xs" className="cursor-pointer">
                      <label className="cursor-pointer">
                        Choose File
                        <input type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" key={selectedEntity} />
                      </label>
                    </Button>
                    <Button variant="secondary" size="xs" as="a" href={exportDataUrl(selectedEntity)} download={exportFilename(selectedEntity)}>
                      Export Current {entity?.label}
                    </Button>
                  </div>
                  {fileName && <p className="text-xs text-gray-400 mb-1">Loaded: {fileName}</p>}
                  <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8}
                    placeholder={`Paste ${entity?.label} CSV here...\n\nExpected columns:\n${entity?.cols}`}
                    className="lh-input font-mono text-xs"
                  />
                  {rowCount > 0 && <p className="text-xs text-gray-400 mt-1">{rowCount} data row{rowCount !== 1 ? 's' : ''} detected</p>}
                </div>

                {/* Season for division/team matching */}
                {needsSeason && seasons.length > 0 && (
                  <Select
                    label="Season (for division matching)"
                    value={seasonId || ''}
                    onChange={(e) => setSeasonId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— No division matching —</option>
                    {seasons.map(s => <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>)}
                  </Select>
                )}

                {/* Mode */}
                <Select
                  label="Mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  helper={mode === 'create_update'
                    ? 'Matched records will be updated with non-empty CSV values. New records will be created.'
                    : 'Only new records will be created. Existing matches are skipped.'}
                >
                  <option value="create_update">Create new & update existing</option>
                  <option value="create_only">Create new only (skip existing)</option>
                </Select>

                {/* Column reference */}
                <details className="text-xs text-gray-400">
                  <summary className="cursor-pointer font-semibold hover:text-gray-300">Column Reference — {entity?.label}</summary>
                  <p className="mt-1 pl-2">{entity?.cols}</p>
                </details>

                {error && <div className="lh-alert lh-alert-error">{error}</div>}

                <div className="flex justify-end">
                  <Button onClick={handleImport} disabled={importing || !csv.trim()} loading={importing}>
                    {importing ? 'Importing…' : `Import ${entity?.label}`}
                  </Button>
                </div>
              </>
            ) : (
              /* Import results */
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-action-900/30 border border-action-200 rounded-lg p-3">
                    <div className="text-2xl font-bold text-action-400">{result.created}</div>
                    <div className="text-xs text-action-400 font-semibold">Created</div>
                  </div>
                  <div className="bg-chrome-900/30 border border-chrome-200 rounded-lg p-3">
                    <div className="text-2xl font-bold text-chrome-400">{result.updated}</div>
                    <div className="text-xs text-chrome-400 font-semibold">Updated</div>
                  </div>
                  <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-400">{result.skipped}</div>
                    <div className="text-xs text-gray-400 font-semibold">Skipped</div>
                  </div>
                </div>
                {result.errors?.length > 0 && (
                  <div className="bg-yellow-900/30 border border-yellow-200 rounded-lg p-3">
                    <div className="text-xs font-semibold text-yellow-300 mb-1">Warnings ({result.errors.length})</div>
                    <div className="text-xs text-yellow-300 max-h-40 overflow-y-auto space-y-0.5">
                      {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <Button variant="secondary" size="sm" onClick={() => { setResult(null); setCsv(''); setFileName(''); }}>Import More</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── EXPORT TAB ── */}
        {tab === 'export' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">Download current data as CSV files. Use these as templates for importing.</p>
            <div className="flex flex-wrap gap-3 mb-2">
              <div className="flex-1 min-w-[160px]">
                <label className="lh-eyebrow block mb-1">Filter by Organization</label>
                <Select value={exportOrgId} onChange={e => { setExportOrgId(e.target.value); setExportTeamId(''); }}>
                  <option value="">All Organizations</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="lh-eyebrow block mb-1">Filter by Team</label>
                <Select value={exportTeamId} onChange={e => setExportTeamId(e.target.value)}>
                  <option value="">All Teams</option>
                  {teams.filter(t => !exportOrgId || String(t.org_id) === String(exportOrgId)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
            </div>
            {(exportOrgId || exportTeamId) && (
              <p className="text-xs text-action-400">
                Filtering: {exportTeamId ? teams.find(t => String(t.id) === String(exportTeamId))?.name : orgs.find(o => String(o.id) === String(exportOrgId))?.name}
                {' '}<button className="underline text-gray-400 hover:text-gray-200" onClick={() => { setExportOrgId(''); setExportTeamId(''); }}>Clear</button>
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ENTITIES.map(ent => (
                <a key={ent.key} href={exportDataUrl(ent.key, { teamId: exportTeamId || undefined, orgId: exportOrgId || undefined })} download={exportFilename(ent.key, exportTeamId, exportOrgId)}
                  className="flex items-center gap-3 px-4 py-3 border border-gray-700 rounded-lg hover:bg-gray-900 transition-colors"
                >
                  <span className="text-xl">{ent.icon}</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-200">{ent.label}</div>
                    <div className="text-xs text-gray-400">{exportFilename(ent.key, exportTeamId, exportOrgId)}</div>
                  </div>
                  <svg className="ml-auto w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── CLEAR TAB ── */}
        {tab === 'clear' && (
          <div className="space-y-4">
            <div className="bg-signal-900/30 border border-signal-200 rounded-lg p-3 text-sm text-signal-400">
              <strong>Warning:</strong> Clearing data is permanent and cannot be undone. Export your data first as a backup.
            </div>

            {clearResult && (
              <div className="bg-action-900/30 border border-action-200 rounded-lg p-3 text-sm text-action-400">
                Cleared: {clearResult.cleared?.join(', ')}
              </div>
            )}

            <div className="space-y-2">
              {CLEAR_GROUPS.map((group, idx) => (
                <div key={idx} className="border border-gray-700 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-200">{group.label}</div>
                      <div className="text-xs text-gray-400">{group.desc}</div>
                    </div>
                    {clearConfirm === idx ? (
                      <div className="flex gap-2">
                        <Button size="xs" variant="secondary" onClick={() => setClearConfirm(null)}>Cancel</Button>
                        <Button size="xs" variant="danger" onClick={() => handleClear(group)} disabled={clearing} loading={clearing}>
                          {clearing ? 'Clearing…' : 'Yes, Delete'}
                        </Button>
                      </div>
                    ) : (
                      <Button size="xs" variant="danger" onClick={() => { setClearConfirm(idx); setClearResult(null); }}>
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
