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
  const pos = row.position ? ` (${row.position})` : '';
  const label = `${prefix}${displayName}${pos}`;
  if (row.player_id && onViewPlayer) {
    return (
      <button
        type="button"
        onClick={() => onViewPlayer(row.player_id)}
        className="text-action-300 hover:text-action-100 hover:underline text-left"
      >
        {label}
      </button>
    );
  }
  return <span>{label}</span>;
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

// Stat column width shared by batting tables so away+home columns align.
const BATTING_STAT_W = 'w-8 text-center shrink-0';

// Build extras summary lines: "HR: Berktold, SB: Corey 2, Skoug"
function ExtrasSummary({ rows }) {
  const LABELS = [
    { field: 'hr',      label: 'HR' },
    { field: 'doubles', label: '2B' },
    { field: 'triples', label: '3B' },
    { field: 'sb',      label: 'SB' },
  ];
  const parts = [];
  for (const { field, label } of LABELS) {
    const players = rows
      .filter(b => b[field] != null && b[field] > 0)
      .map(b => {
        const name = (b.player_last_name || (b.name || '').split(' ').slice(1).join(' ') || b.name || '').trim();
        return b[field] > 1 ? `${name} ${b[field]}` : name;
      });
    if (players.length) parts.push(`${label}: ${players.join(', ')}`);
  }
  if (!parts.length) return null;
  return (
    <p className="text-xs text-gray-400 mt-1 px-1">{parts.join(' \u00b7 ')}</p>
  );
}

function BattingTable({ title, rows, onViewPlayer }) {
  if (!rows.length) return null;
  // Determine which optional extra columns have any data in this table
  const hasHR  = rows.some(b => b.hr   != null && b.hr  !== 0);
  const has2B  = rows.some(b => b.doubles != null && b.doubles !== 0);
  const has3B  = rows.some(b => b.triples != null && b.triples !== 0);
  const hasSB  = rows.some(b => b.sb   != null && b.sb  !== 0);
  return (
    <div className="lh-card overflow-x-auto">
      <h4 className="font-semibold mb-2">{title}</h4>
      <table className="lh-table w-full text-sm table-fixed">
        <colgroup>
          <col />{/* Player — fills remaining space */}
          <col className="w-8" />{/* AB */}
          <col className="w-8" />{/* R */}
          <col className="w-8" />{/* H */}
          <col className="w-8" />{/* RBI */}
          <col className="w-8" />{/* BB */}
          <col className="w-8" />{/* SO */}
          {hasHR && <col className="w-8" />}
          {has2B && <col className="w-8" />}
          {has3B && <col className="w-8" />}
          {hasSB && <col className="w-8" />}
        </colgroup>
        <thead>
          <tr>
            <th className="text-left">Player</th>
            <th className={BATTING_STAT_W}>AB</th>
            <th className={BATTING_STAT_W}>R</th>
            <th className={BATTING_STAT_W}>H</th>
            <th className={BATTING_STAT_W}>RBI</th>
            <th className={BATTING_STAT_W}>BB</th>
            <th className={BATTING_STAT_W}>SO</th>
            {hasHR && <th className={BATTING_STAT_W}>HR</th>}
            {has2B && <th className={BATTING_STAT_W}>2B</th>}
            {has3B && <th className={BATTING_STAT_W}>3B</th>}
            {hasSB && <th className={BATTING_STAT_W}>SB</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((b, i) => (
            <tr key={i}>
              <td><PlayerCell row={b} onViewPlayer={onViewPlayer} /></td>
              <td className="text-center">{b.ab ?? ''}</td>
              <td className="text-center">{b.r ?? ''}</td>
              <td className="text-center">{b.h ?? ''}</td>
              <td className="text-center">{b.rbi ?? ''}</td>
              <td className="text-center">{b.bb ?? ''}</td>
              <td className="text-center">{b.so ?? ''}</td>
              {hasHR && <td className="text-center">{b.hr ?? ''}</td>}
              {has2B && <td className="text-center">{b.doubles ?? ''}</td>}
              {has3B && <td className="text-center">{b.triples ?? ''}</td>}
              {hasSB && <td className="text-center">{b.sb ?? ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <ExtrasSummary rows={rows} />
    </div>
  );
}

const PITCHING_STAT_W = 'w-8 text-center shrink-0';

function PitchingTable({ title, rows, onViewPlayer }) {
  if (!rows.length) return null;
  return (
    <div className="lh-card overflow-x-auto">
      <h4 className="font-semibold mb-2">{title}</h4>
      <table className="lh-table w-full text-sm table-fixed">
        <colgroup>
          <col />{/* Pitcher — fills remaining space */}
          <col className="w-8" />{/* IP */}
          <col className="w-8" />{/* H */}
          <col className="w-8" />{/* R */}
          <col className="w-8" />{/* ER */}
          <col className="w-8" />{/* BB */}
          <col className="w-8" />{/* K */}
          <col className="w-8" />{/* HR */}
          <col className="w-10" />{/* P */}
          <col className="w-10" />{/* S */}
          <col className="w-12" />{/* S% */}
        </colgroup>
        <thead>
          <tr>
            <th className="text-left">Pitcher</th>
            <th className={PITCHING_STAT_W}>IP</th>
            <th className={PITCHING_STAT_W}>H</th>
            <th className={PITCHING_STAT_W}>R</th>
            <th className={PITCHING_STAT_W}>ER</th>
            <th className={PITCHING_STAT_W}>BB</th>
            <th className={PITCHING_STAT_W}>K</th>
            <th className={PITCHING_STAT_W}>HR</th>
            <th className={PITCHING_STAT_W}>P</th>
            <th className={PITCHING_STAT_W}>S</th>
            <th className={PITCHING_STAT_W}>S%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const strikePct = (p.pitches > 0 && p.strikes != null)
              ? Math.round((p.strikes / p.pitches) * 100) + '%'
              : '';
            return (
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
                <td className="text-center">{strikePct}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
