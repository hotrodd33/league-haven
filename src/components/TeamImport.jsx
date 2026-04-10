import { useState, useEffect } from 'react';
import { importTeamsCSV, exportTeamsCSVUrl, fetchSeasons } from '../api/index.js';

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600";
const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";

const SAMPLE_CSV = `team_name,org_name,age_group,level,division
Thunder,Valley Org,12U,Competitive,American / East
Lightning,Valley Org,12U,Recreational,American / West
Rockets,Hill Org,14U,Competitive,National / East`;

export default function TeamImport({ onDone, onCancel }) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState(null);
  const [mode, setMode] = useState('create_update');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

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
      const res = await importTeamsCSV(csv, seasonId, mode);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  function handleDone() {
    onDone();
  }

  const rowCount = csv.trim() ? csv.trim().split(/\r?\n/).length - 1 : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 sm:p-6 my-4">
        <h2 className="text-xl font-bold mb-1">Import Teams from CSV</h2>
        <p className="text-xs text-gray-500 mb-4">Bulk create or update teams and assign divisions.</p>

        {!result ? (
          <div className="space-y-4">
            {/* File upload or paste */}
            <div>
              <label className={labelCls}>CSV File or Paste</label>
              <div className="flex gap-2 mb-2">
                <label className="px-3 py-1.5 text-xs font-semibold bg-blue-800 text-white rounded cursor-pointer hover:bg-blue-900 inline-block">
                  Choose File
                  <input type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
                </label>
                <a
                  href={exportTeamsCSVUrl()}
                  download="teams.csv"
                  className="px-3 py-1.5 text-xs font-semibold bg-gray-200 text-gray-800 rounded hover:bg-gray-300 inline-block"
                >Export Current Teams</a>
              </div>
              {fileName && <p className="text-xs text-gray-500 mb-1">Loaded: {fileName}</p>}
              <textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                rows={8}
                placeholder={SAMPLE_CSV}
                className={inputCls + ' font-mono text-xs'}
              />
              {rowCount > 0 && <p className="text-xs text-gray-500 mt-1">{rowCount} data row{rowCount !== 1 ? 's' : ''} detected</p>}
            </div>

            {/* Season for division matching */}
            {seasons.length > 0 && (
              <div>
                <label className={labelCls}>Season (for division matching)</label>
                <select value={seasonId || ''} onChange={(e) => setSeasonId(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
                  <option value="">— No division matching —</option>
                  {seasons.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Import mode */}
            <div>
              <label className={labelCls}>Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls}>
                <option value="create_update">Create new & update existing</option>
                <option value="create_only">Create new only (skip existing)</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {mode === 'create_update'
                  ? 'Teams matched by name will be updated. New teams will be created.'
                  : 'Only new team names will be created. Existing teams are skipped.'}
              </p>
            </div>

            {/* Expected columns */}
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer font-semibold hover:text-gray-700">Column Reference</summary>
              <div className="mt-1 space-y-0.5 pl-2">
                <div><strong>team_name</strong> — required, team name</div>
                <div><strong>org_name</strong> — organization name (must match existing)</div>
                <div><strong>age_group</strong> — e.g. 12U, 14U</div>
                <div><strong>level</strong> — e.g. Competitive, Recreational</div>
                <div><strong>division</strong> — division name(s), separated by <code>;</code> or <code>|</code></div>
              </div>
            </details>

            {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-200 text-gray-800 text-sm font-semibold rounded-lg hover:bg-gray-300">Cancel</button>
              <button
                onClick={handleImport}
                disabled={importing || !csv.trim()}
                className="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-60"
              >{importing ? 'Importing…' : 'Import'}</button>
            </div>
          </div>
        ) : (
          /* Results */
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
                <div className="text-xs text-yellow-700 max-h-32 overflow-y-auto space-y-0.5">
                  {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setResult(null); setCsv(''); setFileName(''); }} className="px-4 py-2 bg-gray-200 text-gray-800 text-sm font-semibold rounded-lg hover:bg-gray-300">Import More</button>
              <button onClick={handleDone} className="px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
