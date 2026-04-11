import { useState, useEffect, useCallback } from 'react';
import { fetchPlayersByTeam, deletePlayer, unassignPlayerFromTeam, searchPlayers, assignPlayerToTeam, createPlayer } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';

function parseRosterPaste(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const entries = [];
  const ignored = [];

  for (const line of lines) {
    if (/^roster\s*\(\d+\)/i.test(line)) { ignored.push(line); continue; }
    if (/^add\s+player$/i.test(line)) { ignored.push(line); continue; }
    if (/^[A-Z]{1,4}$/.test(line)) { ignored.push(line); continue; }

    let m = line.match(/^(.+?),\s*#\s*(\d{1,3})$/);
    if (!m) m = line.match(/^(.+?)\s+#\s*(\d{1,3})$/);
    const rawName = (m ? m[1] : line).trim();
    const jersey = m ? Number(m[2]) : null;

    const parts = rawName.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      ignored.push(line);
      continue;
    }

    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    entries.push({ first_name: firstName, last_name: lastName, jersey_number: jersey });
  }

  return { entries, ignored };
}

export default function RosterList({ teamId, teamOrgId, onEditPlayer, onAddPlayer, refreshKey }) {
  const { canEditTeam: canEdit } = useAuth();
  const editable = teamId ? canEdit(teamId, teamOrgId) : false;
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState(null);
  const [showPasteImport, setShowPasteImport] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [importingPaste, setImportingPaste] = useState(false);
  const [importSummary, setImportSummary] = useState(null);

  const loadPlayers = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlayersByTeam(teamId);
      setPlayers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    setPlayers([]);
    loadPlayers();
  }, [loadPlayers, refreshKey]);

  async function handleRemoveFromTeam(player) {
    const name = `${player.first_name} ${player.last_name}`;
    if (!window.confirm(`Remove ${name} from this team's roster? The player will still exist in the system.`)) return;
    setDeleting(player.id);
    try {
      await unassignPlayerFromTeam(teamId, player.id);
      setPlayers((prev) => prev.filter((p) => p.id !== player.id));
    } catch (err) {
      alert(`Failed to remove: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  }

  async function handleDeletePlayer(player) {
    const name = `${player.first_name} ${player.last_name}`;
    if (!window.confirm(`Permanently delete ${name}? This removes them from ALL teams.`)) return;
    setDeleting(player.id);
    try {
      await deletePlayer(player.id);
      setPlayers((prev) => prev.filter((p) => p.id !== player.id));
    } catch (err) {
      alert(`Failed to delete: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchPlayers(searchQuery.trim());
      // Filter out players already on this team
      const currentIds = new Set(players.map(p => p.id));
      setSearchResults(results.filter(p => !currentIds.has(p.id)));
    } catch (err) {
      alert(`Search failed: ${err.message}`);
    } finally {
      setSearching(false);
    }
  }

  async function handleAssignExisting(playerId) {
    setAssigning(playerId);
    try {
      await assignPlayerToTeam(teamId, playerId);
      setSearchResults(prev => prev.filter(p => p.id !== playerId));
      await loadPlayers();
    } catch (err) {
      alert(`Failed to add: ${err.message}`);
    } finally {
      setAssigning(null);
    }
  }

  async function handleImportPaste() {
    const { entries, ignored } = parseRosterPaste(pasteText);
    if (!entries.length) {
      setImportSummary({
        added: 0,
        skipped: 0,
        ignoredCount: ignored.length,
        errors: ['No valid player rows found. Use format: First Last, #Number'],
      });
      return;
    }

    const existingKeys = new Set(
      players.map((p) => `${String(p.first_name || '').trim().toLowerCase()}|${String(p.last_name || '').trim().toLowerCase()}|${p.jersey_number ?? ''}`)
    );

    let added = 0;
    let skipped = 0;
    const errors = [];

    setImportingPaste(true);
    setImportSummary(null);
    try {
      for (const entry of entries) {
        const key = `${entry.first_name.toLowerCase()}|${entry.last_name.toLowerCase()}|${entry.jersey_number ?? ''}`;
        if (existingKeys.has(key)) {
          skipped += 1;
          continue;
        }
        try {
          await createPlayer({
            team_id: teamId,
            first_name: entry.first_name,
            last_name: entry.last_name,
            jersey_number: entry.jersey_number,
          });
          existingKeys.add(key);
          added += 1;
        } catch (err) {
          errors.push(`${entry.first_name} ${entry.last_name}: ${err.message}`);
        }
      }

      await loadPlayers();
      setImportSummary({ added, skipped, ignoredCount: ignored.length, errors });
    } finally {
      setImportingPaste(false);
    }
  }

  if (!teamId) {
    return <div className="py-12 text-center text-gray-400">Select a team to view the roster.</div>;
  }
  if (loading) return <div className="py-8 text-center text-gray-400">Loading roster…</div>;
  if (error) return <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-gray-100">Team Roster ({players.length})</h2>
        {editable && (
          <div className="flex gap-2">
            <button onClick={() => setShowAddExisting(!showAddExisting)} className="px-3 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600 transition-colors">
              + Existing Player
            </button>
            <button onClick={() => { setShowPasteImport(!showPasteImport); setImportSummary(null); }} className="px-3 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600 transition-colors">
              + Paste Roster
            </button>
            <button onClick={onAddPlayer} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
              + New Player
            </button>
          </div>
        )}
      </div>

      {showPasteImport && editable && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 mb-4">
          <p className="text-xs text-gray-400 mb-2">Paste roster rows like: <span className="text-gray-300">Josie Schnell, #2</span></p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600"
            placeholder="Paste roster text here..."
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleImportPaste}
              disabled={importingPaste || !pasteText.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {importingPaste ? 'Importing…' : 'Import Players'}
            </button>
            <button
              onClick={() => { setShowPasteImport(false); setPasteText(''); setImportSummary(null); }}
              className="px-3 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600"
            >
              Close
            </button>
          </div>

          {importSummary && (
            <div className="mt-3 text-xs text-gray-300 bg-gray-800 border border-gray-700 rounded p-2 space-y-1">
              <div>Added: <span className="text-green-400 font-semibold">{importSummary.added}</span></div>
              <div>Skipped duplicates: <span className="text-yellow-300 font-semibold">{importSummary.skipped}</span></div>
              <div>Ignored non-player lines: <span className="text-gray-400 font-semibold">{importSummary.ignoredCount}</span></div>
              {importSummary.errors.length > 0 && (
                <div>
                  <div className="text-red-400 font-semibold">Errors:</div>
                  <ul className="list-disc list-inside text-red-300">
                    {importSummary.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search existing players to add to this team */}
      {showAddExisting && editable && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 mb-4">
          <p className="text-xs text-gray-400 mb-2">Search for an existing player to add to this team:</p>
          <div className="flex gap-2 mb-2">
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name…" className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            />
            <button onClick={handleSearch} disabled={searching || !searchQuery.trim()} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {searching ? '…' : 'Search'}
            </button>
            <button onClick={() => { setShowAddExisting(false); setSearchQuery(''); setSearchResults([]); }} className="px-3 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600">
              Close
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {searchResults.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200">
                  <div>
                    <span className="font-semibold">{p.first_name} {p.last_name}</span>
                    {p.positions?.length > 0 && <span className="text-gray-400 ml-2">{p.positions.map(pos => pos.abbreviation || pos.name).join(', ')}</span>}
                  </div>
                  <button onClick={() => handleAssignExisting(p.id)} disabled={assigning === p.id}
                    className="px-3 py-1 text-xs font-semibold bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-60">
                    {assigning === p.id ? '…' : 'Add to Team'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {searchResults.length === 0 && searchQuery && !searching && (
            <p className="text-xs text-gray-400">No matching players found. Try a different search or add a new player.</p>
          )}
        </div>
      )}

      {players.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          No players on this roster yet.
          {editable && (
            <>
              <br />
              <button onClick={onAddPlayer} className="text-field-300 underline mt-1 inline-block">Add a new player</button>
              {' or '}
              <button onClick={() => setShowAddExisting(true)} className="text-field-300 underline mt-1 inline-block">add an existing one</button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full bg-gray-800 rounded-lg shadow-sm overflow-hidden text-sm text-gray-200">
              <thead>
                <tr className="bg-gray-800 border-b-2 border-gray-700">
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">#</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Position</th>
                  {editable && <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Age</th>}
                  {editable && <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Grade</th>}
                  {editable && <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">DOB</th>}
                  {editable && <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">B/T</th>}
                  {editable && <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Parent Email</th>}
                  {editable && <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Parent Phone</th>}
                  {editable && <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {players.map((player) => (
                  <tr key={player.id} className="hover:bg-gray-900">
                    <td className="px-3 py-2 font-bold text-blue-300">{player.jersey_number ?? '—'}</td>
                    <td className="px-3 py-2 font-semibold">{player.first_name} {player.last_name}</td>
                    <td className="px-3 py-2">{formatPositions(player)}</td>
                    {editable && <td className="px-3 py-2">{calcAge(player.date_of_birth)}</td>}
                    {editable && <td className="px-3 py-2">{player.grade || '—'}</td>}
                    {editable && <td className="px-3 py-2">{player.date_of_birth || '—'}</td>}
                    {editable && <td className="px-3 py-2">{formatBatThrow(player)}</td>}
                    {editable && <td className="px-3 py-2 break-all">{player.parent_email || '—'}</td>}
                    {editable && <td className="px-3 py-2">{player.parent_phone || '—'}</td>}
                    {editable && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex gap-1">
                          <button onClick={() => onEditPlayer(player)} className="px-2 py-1 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600">Edit</button>
                          <button onClick={() => handleRemoveFromTeam(player)} disabled={deleting === player.id}
                            className="px-2 py-1 text-xs font-semibold bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-60"
                            title="Remove from this team only">
                            {deleting === player.id ? '…' : 'Remove'}
                          </button>
                          <button onClick={() => handleDeletePlayer(player)} disabled={deleting === player.id}
                            className="px-2 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60"
                            title="Delete player from all teams">
                            {deleting === player.id ? '…' : 'Del'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {players.map((player) => (
              <div key={player.id} className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-4 text-gray-200">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-blue-300 font-bold text-lg mr-2">#{player.jersey_number ?? '—'}</span>
                    <span className="font-semibold text-base">{player.first_name} {player.last_name}</span>
                  </div>
                  {editable && (
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => onEditPlayer(player)} className="px-2.5 py-1 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600">Edit</button>
                      <button onClick={() => handleRemoveFromTeam(player)} disabled={deleting === player.id}
                        className="px-2.5 py-1 text-xs font-semibold bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-60">
                        {deleting === player.id ? '…' : 'Remove'}
                      </button>
                      <button onClick={() => handleDeletePlayer(player)} disabled={deleting === player.id}
                        className="px-2.5 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60">
                        {deleting === player.id ? '…' : 'Del'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-300">
                  <div><span className="font-medium text-gray-200">Pos:</span> {formatPositions(player)}</div>
                  {editable && <div><span className="font-medium text-gray-200">B/T:</span> {formatBatThrow(player)}</div>}
                  {editable && <div><span className="font-medium text-gray-200">Age:</span> {calcAge(player.date_of_birth)}</div>}
                  {editable && <div><span className="font-medium text-gray-200">Grade:</span> {player.grade || '—'}</div>}
                  {editable && player.parent_email && <div className="col-span-2 truncate"><span className="font-medium text-gray-200">Email:</span> {player.parent_email}</div>}
                  {editable && player.parent_phone && <div className="col-span-2"><span className="font-medium text-gray-200">Phone:</span> {player.parent_phone}</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function calcAge(dob) {
  if (!dob) return '—';
  const birth = new Date(dob + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : '—';
}

function formatPositions(player) {
  if (Array.isArray(player.positions) && player.positions.length > 0) {
    return player.positions.map((p) => p.abbreviation || p.name).join(', ');
  }
  return '—';
}

function formatBatThrow(player) {
  const bat = player.batting_hand || '';
  const thr = player.throwing_hand || '';
  if (!bat && !thr) return '—';
  return `${bat || '?'}/${thr || '?'}`;
}
