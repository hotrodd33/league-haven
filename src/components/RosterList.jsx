import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '../lib/queryConfig.js';
import { fetchPlayersByTeam, deletePlayer, unassignPlayerFromTeam, searchPlayers, assignPlayerToTeam, createPlayer, updatePlayerJersey } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import ContactModal from './ContactModal.jsx';
import { formatDOB, calculateAge } from '../utils/dob.js';
import { Button, Input } from './ui';

export default function RosterList({ teamId, teamOrgId, onEditPlayer, onAddPlayer, onViewPlayer }) {
  const { canEditTeam: canEdit } = useAuth();
  const editable = teamId ? canEdit(teamId, teamOrgId) : false;
  const queryClient = useQueryClient();
  const { data: players = [], isLoading: loading, error } = useQuery({
    queryKey: ['roster', teamId],
    queryFn: () => fetchPlayersByTeam(teamId),
    enabled: !!teamId,
    staleTime: STALE.TWO_MIN,
  });
  const [deleting, setDeleting] = useState(null);
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState(null);
  const [contactModal, setContactModal] = useState(false);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [jerseyEdit, setJerseyEdit] = useState(null); // { playerId, value }

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const sortedPlayers = useMemo(() => {
    if (!sortCol) return players;
    const sorted = [...players].sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case 'number': va = a.jersey_number ?? ''; vb = b.jersey_number ?? ''; break;
        case 'name': va = `${a.first_name} ${a.last_name}`.toLowerCase(); vb = `${b.first_name} ${b.last_name}`.toLowerCase(); break;
        case 'position': va = formatPositions(a); vb = formatPositions(b); break;
        case 'age': va = calculateAge(a.date_of_birth); vb = calculateAge(b.date_of_birth); va = va == null ? -1 : Number(va); vb = vb == null ? -1 : Number(vb); break;
        case 'grade': va = a.grade ?? ''; vb = b.grade ?? ''; break;
        case 'dob': va = a.date_of_birth || ''; vb = b.date_of_birth || ''; break;
        case 'bt': va = formatBatThrow(a); vb = formatBatThrow(b); break;
        case 'email': va = (a.email || a.parent_email || '').toLowerCase(); vb = (b.email || b.parent_email || '').toLowerCase(); break;
        case 'phone': va = a.phone || a.parent_phone || ''; vb = b.phone || b.parent_phone || ''; break;
        default: return 0;
      }
      if (typeof va === 'number' && typeof vb === 'number') return va - vb;
      return String(va).localeCompare(String(vb), undefined, { numeric: true });
    });
    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }, [players, sortCol, sortDir]);


  async function handleRemoveFromTeam(player) {
    const name = `${player.first_name} ${player.last_name}`;
    if (!window.confirm(`Remove ${name} from this team's roster? The player will still exist in the system.`)) return;
    setDeleting(player.id);
    try {
      await unassignPlayerFromTeam(teamId, player.id);
      queryClient.setQueryData(['roster', teamId], (prev) => (prev || []).filter(p => p.id !== player.id));
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
      queryClient.setQueryData(['roster', teamId], (prev) => (prev || []).filter(p => p.id !== player.id));
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
      queryClient.invalidateQueries({ queryKey: ['roster', teamId] });
    } catch (err) {
      alert(`Failed to add: ${err.message}`);
    } finally {
      setAssigning(null);
    }
  }

  if (!teamId) {
    return <div className="py-12 text-center text-gray-400">Select a team to view the roster.</div>;
  }
  if (loading) return <div className="py-8 text-center text-gray-400">Loading roster…</div>;
  if (error) return <div className="lh-alert lh-alert-error">{error.message}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-display font-bold text-white">Team Roster ({players.length})</h2>
        {editable && (
          <div className="flex gap-2">
            {players.length > 0 && (
              <Button variant="secondary" onClick={() => setContactModal(true)} title="Email all player contacts">
                ✉ Email Team
              </Button>
            )}
            <Button variant="secondary" onClick={() => setShowAddExisting(!showAddExisting)}>
              + Existing Player
            </Button>
            <Button size="sm" onClick={onAddPlayer}>
              + New Player
            </Button>
          </div>
        )}
      </div>

      {/* Search existing players to add to this team */}
      {showAddExisting && editable && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 mb-4">
          <p className="text-xs text-gray-400 mb-2">Search for an existing player to add to this team:</p>
          <div className="flex gap-2 mb-2">
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name…" className="flex-1 lh-input"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            />
            <Button size="sm" onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
              {searching ? '…' : 'Search'}
            </Button>
            <Button variant="ghost" onClick={() => { setShowAddExisting(false); setSearchQuery(''); setSearchResults([]); }}>
              Close
            </Button>
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
                    className="px-3 py-1 text-xs font-semibold bg-action-600 text-white rounded hover:bg-green-700 disabled:opacity-60">
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
              <button onClick={onAddPlayer} className="text-action-300 underline mt-1 inline-block">Add a new player</button>
              {' or '}
              <button onClick={() => setShowAddExisting(true)} className="text-action-300 underline mt-1 inline-block">add an existing one</button>
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
                  <SortHeader col="number" label="#" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
                  <SortHeader col="name" label="Name" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
                  <SortHeader col="position" label="Position" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />
                  {editable && <SortHeader col="age" label="Age" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />}
                  {editable && <SortHeader col="grade" label="Grade" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />}
                  {editable && <SortHeader col="dob" label="DOB" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />}
                  {editable && <SortHeader col="bt" label="B/T" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />}
                  {editable && <SortHeader col="email" label="Parent Email" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />}
                  {editable && <SortHeader col="phone" label="Parent Phone" sortCol={sortCol} sortDir={sortDir} onClick={toggleSort} />}
                  {editable && <th className="px-3 py-2 text-left eyebrow">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {sortedPlayers.map((player) => (
                  <tr key={player.id} className="hover:bg-gray-900">
                    <td className="px-3 py-2">
                      {editable && jerseyEdit?.playerId === player.id ? (
                        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-action-900/60 border border-action-600 text-xs font-bold">
                          <span className="text-action-500">#</span>
                          <input
                            autoFocus
                            type="text"
                            value={jerseyEdit.value}
                            onChange={e => setJerseyEdit(j => ({ ...j, value: e.target.value }))}
                            onBlur={async () => {
                              const v = jerseyEdit.value.trim();
                              if (v !== String(player.jersey_number ?? '')) {
                                try {
                                  await updatePlayerJersey(teamId, player.id, v);
                                  queryClient.setQueryData(['roster', teamId], prev =>
                                    (prev || []).map(p => p.id === player.id ? { ...p, jersey_number: v || null } : p)
                                  );
                                } catch { alert('Failed to save jersey number'); }
                              }
                              setJerseyEdit(null);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') e.target.blur();
                              if (e.key === 'Escape') setJerseyEdit(null);
                            }}
                            className="w-10 bg-transparent text-action-200 font-bold focus:outline-none placeholder-action-700"
                            placeholder="—"
                            maxLength={3}
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => editable && setJerseyEdit({ playerId: player.id, value: String(player.jersey_number ?? '') })}
                          title={editable ? 'Click to edit jersey number' : undefined}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border transition-colors
                            ${player.jersey_number != null
                              ? 'bg-action-900/50 text-action-300 border-action-700/60'
                              : 'bg-gray-800 text-gray-500 border-gray-700'}
                            ${editable ? 'hover:bg-action-800/70 hover:text-action-200 hover:border-action-600 cursor-pointer' : 'cursor-default'}`}
                        >
                          {player.jersey_number != null ? `#${player.jersey_number}` : (editable ? '+#' : '—')}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 font-semibold">
                      <button onClick={() => onViewPlayer?.(player.id)} className="text-left hover:text-chrome-300 transition-colors underline decoration-gray-600 hover:decoration-chrome-400">
                        {player.first_name} {player.last_name}
                      </button>
                    </td>
                    <td className="px-3 py-2">{formatPositions(player)}</td>
                    {editable && <td className="px-3 py-2">{calculateAge(player.date_of_birth) ?? '—'}</td>}
                    {editable && <td className="px-3 py-2">{player.grade || '—'}</td>}
                    {editable && <td className="px-3 py-2">{formatDOB(player.date_of_birth)}</td>}
                    {editable && <td className="px-3 py-2">{formatBatThrow(player)}</td>}
                    {editable && <td className="px-3 py-2 break-all">{(player.email || player.parent_email) ? <a href={`mailto:${player.email || player.parent_email}`} className="text-chrome-400 hover:text-chrome-300 underline">{player.email || player.parent_email}</a> : '—'}</td>}
                    {editable && <td className="px-3 py-2">{(player.phone || player.parent_phone) ? <a href={`tel:${player.phone || player.parent_phone}`} className="text-chrome-400 hover:text-chrome-300 underline">{player.phone || player.parent_phone}</a> : '—'}</td>}
                    {editable && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex gap-1">
                          <button onClick={() => onViewPlayer?.(player.id)} className="px-2 py-1 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600">Edit</button>
                          <button onClick={() => handleRemoveFromTeam(player)} disabled={deleting === player.id}
                            className="px-2 py-1 text-xs font-semibold bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-60"
                            title="Remove from this team only">
                            {deleting === player.id ? '…' : 'Remove'}
                          </button>
                          <button onClick={() => handleDeletePlayer(player)} disabled={deleting === player.id}
                            className="btn btn-xs btn-danger"
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
                      <button
                      onClick={() => editable && setJerseyEdit({ playerId: player.id, value: String(player.jersey_number ?? '') })}
                      title={editable ? 'Click to edit jersey number' : undefined}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border transition-colors
                        ${player.jersey_number != null
                          ? 'bg-action-900/50 text-action-300 border-action-700/60'
                          : 'bg-gray-800 text-gray-500 border-gray-700'}
                        ${editable ? 'hover:bg-action-800/70 hover:text-action-200 hover:border-action-600 cursor-pointer' : 'cursor-default'}`}
                    >
                      {player.jersey_number != null ? `#${player.jersey_number}` : (editable ? '+#' : '—')}
                    </button>
                    <button onClick={() => onViewPlayer?.(player.id)} className="font-semibold text-base hover:text-chrome-300 transition-colors underline decoration-gray-600 hover:decoration-chrome-400">
                      {player.first_name} {player.last_name}
                    </button>
                  </div>
                  {editable && (
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => onViewPlayer?.(player.id)} className="px-2.5 py-1 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600">Edit</button>
                      <button onClick={() => handleRemoveFromTeam(player)} disabled={deleting === player.id}
                        className="px-2.5 py-1 text-xs font-semibold bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-60">
                        {deleting === player.id ? '…' : 'Remove'}
                      </button>
                      <button onClick={() => handleDeletePlayer(player)} disabled={deleting === player.id}
                        className="btn btn-xs btn-danger">
                        {deleting === player.id ? '…' : 'Del'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-300">
                  <div><span className="font-medium text-gray-200">Pos:</span> {formatPositions(player)}</div>
                  {editable && <div><span className="font-medium text-gray-200">B/T:</span> {formatBatThrow(player)}</div>}
                  {editable && <div><span className="font-medium text-gray-200">Age:</span> {calculateAge(player.date_of_birth) ?? '—'}</div>}
                  {editable && <div><span className="font-medium text-gray-200">Grade:</span> {player.grade || '—'}</div>}
                  {editable && (player.email || player.parent_email) && <div className="col-span-2 truncate"><span className="font-medium text-gray-200">Email:</span> <a href={`mailto:${player.email || player.parent_email}`} className="text-chrome-400 hover:text-chrome-300 underline">{player.email || player.parent_email}</a></div>}
                  {editable && (player.phone || player.parent_phone) && <div className="col-span-2"><span className="font-medium text-gray-200">Phone:</span> <a href={`tel:${player.phone || player.parent_phone}`} className="text-chrome-400 hover:text-chrome-300 underline">{player.phone || player.parent_phone}</a></div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {contactModal && (
        <ContactModal
          scope="roster"
          scopeId={teamId}
          scopeLabel="Team Roster"
          onClose={() => setContactModal(false)}
        />
      )}
    </div>
  );
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

function SortHeader({ col, label, sortCol, sortDir, onClick }) {
  const arrow = sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <th className="px-3 py-2 text-left eyebrow cursor-pointer select-none hover:text-gray-200 transition-colors"
      onClick={() => onClick(col)}>
      {label}{arrow}
    </th>
  );
}
