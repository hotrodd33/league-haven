import { useState, useEffect } from 'react';
import { fetchTournament } from '../api/index.js';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const FORMAT_LABELS = {
  single_elimination: 'Single Elimination',
  double_elimination: 'Double Elimination',
};

export default function TournamentDetail({ tournamentId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tournamentId) return;
    setLoading(true);
    fetchTournament(tournamentId)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  if (loading) return <div className="text-gray-400 text-center py-16">Loading tournament…</div>;
  if (error) return <div className="text-signal-400 text-center py-16">{error}</div>;
  if (!data) return null;

  const activeTeams = (data.teams || []).filter(t => !t.registration_status || t.registration_status !== 'withdrawn');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        ← Back
      </button>

      <div>
        <h1 className="text-2xl font-display font-bold text-white flex items-center gap-2">
          🏆 {data.name}
        </h1>
        {data.org_name && <p className="text-gray-400 text-sm mt-1">{data.org_name}</p>}
      </div>

      {/* Meta info */}
      <div className="bg-chrome-800/60 border border-chrome-700/50 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {(data.start_date || data.end_date) && (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Dates</p>
              <p className="text-gray-200">
                {formatDate(data.start_date)}
                {data.start_date && data.end_date && data.start_date !== data.end_date && ` — ${formatDate(data.end_date)}`}
              </p>
            </div>
          )}
          {data.format && (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Format</p>
              <p className="text-gray-200">{FORMAT_LABELS[data.format] || data.format}</p>
            </div>
          )}
          {data.entry_fee != null && Number(data.entry_fee) > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Entry Fee</p>
              <p className="text-gray-200">${Number(data.entry_fee).toFixed(2)}</p>
            </div>
          )}
          {data.registration_deadline && (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Registration Deadline</p>
              <p className="text-gray-200">{formatDate(data.registration_deadline)}</p>
            </div>
          )}
        </div>
        {data.location_notes && (
          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Location</p>
            <p className="text-gray-300 text-sm">📍 {data.location_notes}</p>
          </div>
        )}
        {data.description && (
          <div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">About</p>
            <p className="text-gray-300 text-sm">{data.description}</p>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs bg-chrome-700/50 text-gray-300 px-2 py-1 rounded-md">
            {activeTeams.length}/{data.team_count} teams
          </span>
          {data.registration_open ? (
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md">
              Registration Open
            </span>
          ) : (
            <span className="text-xs text-gray-500 bg-chrome-700/50 px-2 py-1 rounded-md">
              Registration Closed
            </span>
          )}
        </div>
      </div>

      {/* Teams */}
      <div className="bg-chrome-800/60 border border-chrome-700/50 rounded-xl p-4">
        <h2 className="text-sm font-bold uppercase text-gray-400 tracking-wider mb-3">
          Teams Registered ({activeTeams.length})
        </h2>
        {activeTeams.length === 0 ? (
          <p className="text-gray-500 text-sm">No teams registered yet.</p>
        ) : (
          <div className="space-y-2">
            {activeTeams.map(team => (
              <div key={team.id} className="flex items-center justify-between text-sm py-1 border-b border-chrome-700/30 last:border-0">
                <span className="text-gray-200">{team.name}</span>
                {team.registration_status === 'waitlisted' && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                    Waitlisted
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
