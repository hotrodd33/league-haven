import React, { useEffect, useState } from 'react';
import { fetchGameBoxScore } from '../api';

/**
 * Read-only display of an imported GameChanger box score.
 * Renders linescore, batting (away+home), and pitching (away+home) tables.
 */
export default function BoxScoreView({ gameId, awayTeamName, homeTeamName, onViewPlayer }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchGameBoxScore(gameId)
      .then((bs) => { if (!cancelled) { setData(bs); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [gameId]);

  if (loading) return null;
  if (error) return null;
  if (!data) return null;

  const linescore = Array.isArray(data.linescore) ? data.linescore : [];
  const batting = data.batting || { away: [], home: [] };
  const pitching = data.pitching || { away: [], home: [] };
  const away = awayTeamName || (linescore[0] && linescore[0].team) || 'Away';
  const home = homeTeamName || (linescore[1] && linescore[1].team) || 'Home';

  return (
    <div className="space-y-4">
      <Linescore rows={linescore} />
      <BattingTable title={`${away} — Batting`} rows={batting.away || []} onViewPlayer={onViewPlayer} />
      <BattingTable title={`${home} — Batting`} rows={batting.home || []} onViewPlayer={onViewPlayer} />
      <PitchingTable title={`${away} — Pitching`} rows={pitching.away || []} onViewPlayer={onViewPlayer} />
      <PitchingTable title={`${home} — Pitching`} rows={pitching.home || []} onViewPlayer={onViewPlayer} />
      <div className="text-xs text-gray-500">
        Imported {data.imported_at ? new Date(data.imported_at).toLocaleString() : '—'}
        {data.imported_by_username ? ` by ${data.imported_by_username}` : ''} · source: {data.source}
      </div>
    </div>
  );
}

/**
 * Render player display: "#23 Sawyer Benedict" — clickable when the row was
 * resolved to a roster player_id. Falls back to the raw parsed name (with
 * any GC ellipsis trimmed) when no profile match exists.
 */
function PlayerCell({ row, onViewPlayer }) {
  const profileName = (row.player_first_name && row.player_last_name)
    ? `${row.player_first_name} ${row.player_last_name}`
    : null;
  const fallback = (row.name || '').replace(/[…]+$/, '').trim();
  const displayName = profileName || fallback || '—';
  const jersey = row.player_jersey ?? row.jersey;
  const prefix = jersey ? `#${jersey} ` : '';
  if (row.player_id && onViewPlayer) {
    return (
      <button
        type="button"
        onClick={() => onViewPlayer(row.player_id)}
        className="text-action-300 hover:text-action-100 hover:underline text-left"
      >
        {prefix}{displayName}
      </button>
    );
  }
  return <span>{prefix}{displayName}</span>;
}

function Linescore({ rows }) {
  if (!rows.length) return null;
  const maxInnings = Math.max(...rows.map(r => (r.innings || []).length), 1);
  return (
    <div className="lh-card overflow-x-auto">
      <table className="lh-table w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Team</th>
            {Array.from({ length: maxInnings }, (_, i) => (
              <th key={i} className="text-center">{i + 1}</th>
            ))}
            <th className="text-center font-semibold">R</th>
            <th className="text-center font-semibold">H</th>
            <th className="text-center font-semibold">E</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              <td className="font-medium">{r.team || (idx === 0 ? 'Away' : 'Home')}</td>
              {Array.from({ length: maxInnings }, (_, i) => (
                <td key={i} className="text-center">{r.innings?.[i] ?? '—'}</td>
              ))}
              <td className="text-center font-semibold">{r.runs ?? '—'}</td>
              <td className="text-center">{r.hits ?? '—'}</td>
              <td className="text-center">{r.errors ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BattingTable({ title, rows, onViewPlayer }) {
  if (!rows.length) return null;
  return (
    <div className="lh-card overflow-x-auto">
      <h4 className="font-semibold mb-2">{title}</h4>
      <table className="lh-table w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Player</th>
            <th>Pos</th>
            <th>AB</th>
            <th>R</th>
            <th>H</th>
            <th>RBI</th>
            <th>BB</th>
            <th>SO</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b, i) => (
            <tr key={i}>
              <td><PlayerCell row={b} onViewPlayer={onViewPlayer} /></td>
              <td className="text-center">{b.position || ''}</td>
              <td className="text-center">{b.ab ?? ''}</td>
              <td className="text-center">{b.r ?? ''}</td>
              <td className="text-center">{b.h ?? ''}</td>
              <td className="text-center">{b.rbi ?? ''}</td>
              <td className="text-center">{b.bb ?? ''}</td>
              <td className="text-center">{b.so ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PitchingTable({ title, rows, onViewPlayer }) {
  if (!rows.length) return null;
  return (
    <div className="lh-card overflow-x-auto">
      <h4 className="font-semibold mb-2">{title}</h4>
      <table className="lh-table w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Pitcher</th>
            <th>IP</th>
            <th>H</th>
            <th>R</th>
            <th>ER</th>
            <th>BB</th>
            <th>K</th>
            <th>HR</th>
            <th>P</th>
            <th>S</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i}>
              <td><PlayerCell row={p} onViewPlayer={onViewPlayer} /></td>
              <td className="text-center">{p.ip ?? ''}</td>
              <td className="text-center">{p.h ?? ''}</td>
              <td className="text-center">{p.r ?? ''}</td>
              <td className="text-center">{p.er ?? ''}</td>
              <td className="text-center">{p.bb ?? ''}</td>
              <td className="text-center">{p.k ?? ''}</td>
              <td className="text-center">{p.hr ?? ''}</td>
              <td className="text-center">{p.pitches ?? ''}</td>
              <td className="text-center">{p.strikes ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
