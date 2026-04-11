import { useState, useEffect } from 'react';
import { clearData, exportDataUrl, importData, fetchSeasons } from '../api/index.js';

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600";
const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";

const ENTITIES = [
  { key: 'organizations', label: 'Organizations', icon: '🏢', cols: 'name, contact_name, contact_email, contact_phone, address, city, state, zip, notes' },
  { key: 'locations', label: 'Field Locations', icon: '📍', cols: 'name, org_name, address, city, state, zip, latitude, longitude, comments' },
  { key: 'seasons', label: 'Seasons', icon: '📅', cols: 'name, year, is_active, sort_order' },
  { key: 'divisions', label: 'Divisions', icon: '🏆', cols: 'division_path (e.g. "10U AA / East"), season, season_year, sort_order' },
  { key: 'teams', label: 'Teams', icon: '⚾', cols: 'team_city, team_color, team_mascot, team_name (auto-generated), org_name, age_group, level, division (full path; use ; for multiple)' },
  { key: 'players', label: 'Players / Rosters', icon: '🧢', cols: 'first_name, last_name, date_of_birth, batting_hand, throwing_hand, parent_email, parent_phone, grade, team (use "Team (Org)" if names overlap), jersey_number' },
  { key: 'staff', label: 'Coaches / Staff', icon: '👔', cols: 'name, email, phone, team (use "Team (Org)" if names overlap), role (head_coach / assistant_coach / travel_director)' },
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

export default function DataManager() {
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

  useEffect(() => {
    (async () => {
      try {
        const ss = await fetchSeasons();
        setSeasons(ss);
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

  const tabCls = (t) => `px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${tab === t ? 'bg-white text-gray-900 border border-b-0 border-gray-200' : 'bg-gray-100 text-gray-500 hover:text-gray-700'}`;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Data Manager</h1>
      <p className="text-sm text-gray-500 mb-4">Import, export, and manage all league data via CSV.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-0">
        <button className={tabCls('import')} onClick={() => setTab('import')}>Import</button>
        <button className={tabCls('export')} onClick={() => setTab('export')}>Export</button>
        <button className={tabCls('clear')} onClick={() => setTab('clear')}>Clear Data</button>
      </div>

      <div className="bg-white border border-gray-200 rounded-b-xl rounded-tr-xl p-5">

        {/* ── IMPORT TAB ── */}
        {tab === 'import' && (
          <div className="space-y-4">
            {/* Entity selector */}
            <div>
              <label className={labelCls}>What to import</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ENTITIES.map(ent => (
                  <button key={ent.key}
                    onClick={() => { setSelectedEntity(ent.key); setResult(null); setError(null); }}
                    className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${selectedEntity === ent.key ? 'border-blue-600 bg-blue-50 text-blue-800 font-semibold' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}
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
                  <label className={labelCls}>CSV File or Paste</label>
                  <div className="flex gap-2 mb-2">
                    <label className="px-3 py-1.5 text-xs font-semibold bg-blue-800 text-white rounded cursor-pointer hover:bg-blue-900 inline-block">
                      Choose File
                      <input type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" key={selectedEntity} />
                    </label>
                    <a href={exportDataUrl(selectedEntity)} download={`${selectedEntity}.csv`}
                      className="px-3 py-1.5 text-xs font-semibold bg-gray-200 text-gray-800 rounded hover:bg-gray-300 inline-block"
                    >Export Current {entity?.label}</a>
                  </div>
                  {fileName && <p className="text-xs text-gray-500 mb-1">Loaded: {fileName}</p>}
                  <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8}
                    placeholder={`Paste ${entity?.label} CSV here...\n\nExpected columns:\n${entity?.cols}`}
                    className={inputCls + ' font-mono text-xs'}
                  />
                  {rowCount > 0 && <p className="text-xs text-gray-500 mt-1">{rowCount} data row{rowCount !== 1 ? 's' : ''} detected</p>}
                </div>

                {/* Season for division/team matching */}
                {needsSeason && seasons.length > 0 && (
                  <div>
                    <label className={labelCls}>Season (for division matching)</label>
                    <select value={seasonId || ''} onChange={(e) => setSeasonId(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
                      <option value="">— No division matching —</option>
                      {seasons.map(s => <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>)}
                    </select>
                  </div>
                )}

                {/* Mode */}
                <div>
                  <label className={labelCls}>Mode</label>
                  <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls}>
                    <option value="create_update">Create new & update existing</option>
                    <option value="create_only">Create new only (skip existing)</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    {mode === 'create_update'
                      ? 'Matched records will be updated with non-empty CSV values. New records will be created.'
                      : 'Only new records will be created. Existing matches are skipped.'}
                  </p>
                </div>

                {/* Column reference */}
                <details className="text-xs text-gray-500">
                  <summary className="cursor-pointer font-semibold hover:text-gray-700">Column Reference — {entity?.label}</summary>
                  <p className="mt-1 pl-2">{entity?.cols}</p>
                </details>

                {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

                <div className="flex justify-end">
                  <button onClick={handleImport} disabled={importing || !csv.trim()}
                    className="px-5 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-60"
                  >{importing ? 'Importing…' : `Import ${entity?.label}`}</button>
                </div>
              </>
            ) : (
              /* Import results */
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="text-2xl font-bold text-green-700">{result.created}</div>
                    <div className="text-xs text-green-600 font-semibold">Created</div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="text-2xl font-bold text-blue-700">{result.updated}</div>
                    <div className="text-xs text-blue-600 font-semibold">Updated</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-500">{result.skipped}</div>
                    <div className="text-xs text-gray-500 font-semibold">Skipped</div>
                  </div>
                </div>
                {result.errors?.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div className="text-xs font-semibold text-yellow-700 mb-1">Warnings ({result.errors.length})</div>
                    <div className="text-xs text-yellow-700 max-h-40 overflow-y-auto space-y-0.5">
                      {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <button onClick={() => { setResult(null); setCsv(''); setFileName(''); }}
                    className="px-4 py-2 bg-gray-200 text-gray-800 text-sm font-semibold rounded-lg hover:bg-gray-300">Import More</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── EXPORT TAB ── */}
        {tab === 'export' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Download current data as CSV files. Use these as templates for importing.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ENTITIES.map(ent => (
                <a key={ent.key} href={exportDataUrl(ent.key)} download={`${ent.key}.csv`}
                  className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <span className="text-xl">{ent.icon}</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{ent.label}</div>
                    <div className="text-xs text-gray-400">{ent.key}.csv</div>
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
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <strong>Warning:</strong> Clearing data is permanent and cannot be undone. Export your data first as a backup.
            </div>

            {clearResult && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                Cleared: {clearResult.cleared?.join(', ')}
              </div>
            )}

            <div className="space-y-2">
              {CLEAR_GROUPS.map((group, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{group.label}</div>
                      <div className="text-xs text-gray-500">{group.desc}</div>
                    </div>
                    {clearConfirm === idx ? (
                      <div className="flex gap-2">
                        <button onClick={() => setClearConfirm(null)}
                          className="px-3 py-1.5 text-xs font-semibold bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button>
                        <button onClick={() => handleClear(group)} disabled={clearing}
                          className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60"
                        >{clearing ? 'Clearing…' : 'Yes, Delete'}</button>
                      </div>
                    ) : (
                      <button onClick={() => { setClearConfirm(idx); setClearResult(null); }}
                        className="px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >Clear</button>
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
