import { useState, useEffect, useCallback } from 'react';
import { fetchPlayersByTeam, deletePlayer } from '../api/index.js';

export default function RosterList({ teamId, onEditPlayer, onAddPlayer, refreshKey }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);

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

  async function handleDelete(player) {
    const name = `${player.first_name} ${player.last_name}`;
    if (!window.confirm(`Remove ${name} from the roster?`)) return;
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

  if (!teamId) {
    return <div className="py-12 text-center text-gray-500">Select a team to view the roster.</div>;
  }
  if (loading) return <div className="py-8 text-center text-gray-500">Loading roster…</div>;
  if (error) return <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">Team Roster ({players.length})</h2>
        <button onClick={onAddPlayer} className="px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 transition-colors">
          + Add Player
        </button>
      </div>

      {players.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          No players on this roster yet.
          <br />
          <button onClick={onAddPlayer} className="text-blue-700 underline mt-1 inline-block">Add the first player</button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full bg-white rounded-lg shadow-sm overflow-hidden text-sm">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-gray-200">
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">#</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">Position</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">Age</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">Grade</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">DOB</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">B/T</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">Parent Email</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">Parent Phone</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-500 tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {players.map((player) => (
                  <tr key={player.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-bold text-blue-800">{player.jersey_number ?? '—'}</td>
                    <td className="px-3 py-2 font-semibold">{player.first_name} {player.last_name}</td>
                    <td className="px-3 py-2">{formatPositions(player)}</td>
                    <td className="px-3 py-2">{calcAge(player.date_of_birth)}</td>
                    <td className="px-3 py-2">{player.grade || '—'}</td>
                    <td className="px-3 py-2">{player.date_of_birth || '—'}</td>
                    <td className="px-3 py-2">{formatBatThrow(player)}</td>
                    <td className="px-3 py-2 break-all">{player.parent_email || '—'}</td>
                    <td className="px-3 py-2">{player.parent_phone || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex gap-1">
                        <button onClick={() => onEditPlayer(player)} className="px-2 py-1 text-xs font-semibold bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Edit</button>
                        <button onClick={() => handleDelete(player)} disabled={deleting === player.id}
                          className="px-2 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60">
                          {deleting === player.id ? '…' : 'Remove'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {players.map((player) => (
              <div key={player.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-blue-800 font-bold text-lg mr-2">#{player.jersey_number ?? '—'}</span>
                    <span className="font-semibold text-base">{player.first_name} {player.last_name}</span>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => onEditPlayer(player)} className="px-2.5 py-1 text-xs font-semibold bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Edit</button>
                    <button onClick={() => handleDelete(player)} disabled={deleting === player.id}
                      className="px-2.5 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60">
                      {deleting === player.id ? '…' : 'Del'}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600">
                  <div><span className="font-medium text-gray-800">Pos:</span> {formatPositions(player)}</div>
                  <div><span className="font-medium text-gray-800">B/T:</span> {formatBatThrow(player)}</div>
                  <div><span className="font-medium text-gray-800">Age:</span> {calcAge(player.date_of_birth)}</div>
                  <div><span className="font-medium text-gray-800">Grade:</span> {player.grade || '—'}</div>
                  {player.parent_email && <div className="col-span-2 truncate"><span className="font-medium text-gray-800">Email:</span> {player.parent_email}</div>}
                  {player.parent_phone && <div className="col-span-2"><span className="font-medium text-gray-800">Phone:</span> {player.parent_phone}</div>}
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
