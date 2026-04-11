import { useState, useEffect } from 'react';
import { cn } from '../../lib/cn.js';
import { fetchTeams } from '../../api/index.js';

/* ═══════════════════════════════════════════════════════
   Team Mapper
   ═══════════════════════════════════════════════════════
   Shown during import when one or more team names from
   the GameChanger file can't be matched to teams in
   the system. Lets the user pick the correct team for
   each unmatched name. The mapping is saved as an alias
   so future imports resolve automatically.
   ═══════════════════════════════════════════════════════ */

export default function TeamMapper({
  unmatchedTeams = [],
  matchedTeams = {},
  teamsList: externalTeamsList,
  mappings,
  onChange,
}) {
  const [teams, setTeams] = useState(externalTeamsList || []);

  useEffect(() => {
    if (!externalTeamsList || externalTeamsList.length === 0) {
      fetchTeams().then(setTeams).catch(() => {});
    }
  }, [externalTeamsList]);

  const allNames = [
    ...unmatchedTeams,
    ...Object.keys(matchedTeams),
  ];

  // Nothing to map
  if (unmatchedTeams.length === 0 && Object.keys(matchedTeams).length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-500">No team names detected in the file.</p>
      </div>
    );
  }

  // All teams already matched
  if (unmatchedTeams.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="font-heading text-lg font-bold text-gray-900">
            Team Matching
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            All teams from the file were matched automatically.
          </p>
        </div>

        <div className="bg-field-50 rounded-xl border border-field-200 p-4 space-y-3">
          {Object.entries(matchedTeams).map(([name, teamId]) => {
            const team = teams.find(t => t.id === teamId);
            return (
              <div key={name} className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{name}</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-field-700 bg-field-100 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-field-500" />
                  {team ? team.name : `Team #${teamId}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-heading text-lg font-bold text-gray-900">
          Map Team Names
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          These team names from GameChanger don't match any teams in your system.
          Select the correct team for each, and we'll remember it for future imports.
        </p>
      </div>

      {/* Unmatched teams — need mapping */}
      <div className="space-y-4">
        {unmatchedTeams.map((name) => (
          <div
            key={name}
            className={cn(
              'rounded-xl border p-4 transition-colors',
              mappings[name]
                ? 'border-field-300 bg-field-50/50'
                : 'border-amber-300 bg-amber-50/50'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm',
                mappings[name] ? 'bg-field-100 text-field-600' : 'bg-amber-100 text-amber-600'
              )}>
                {mappings[name] ? '✓' : '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  "{name}"
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  GameChanger team name — select the matching team below
                </p>
                <select
                  value={mappings[name] || ''}
                  onChange={(e) => {
                    const val = e.target.value || null;
                    onChange({ ...mappings, [name]: val ? parseInt(val) : null });
                  }}
                  className={cn(
                    'mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900',
                    'focus:outline-none focus:ring-2 focus:ring-field-500/40 focus:border-field-500',
                    !mappings[name] && 'border-amber-300'
                  )}
                >
                  <option value="">— Select a team —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.org_name ? ` (${t.org_name})` : ''}{t.age_group ? ` · ${t.age_group}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Already matched (informational) */}
      {Object.keys(matchedTeams).length > 0 && (
        <div className="bg-field-50/50 rounded-xl border border-field-200 p-4">
          <p className="text-xs font-semibold text-field-700 uppercase tracking-wider mb-2">
            Already Matched
          </p>
          {Object.entries(matchedTeams).map(([name, teamId]) => {
            const team = teams.find(t => t.id === teamId);
            return (
              <div key={name} className="flex items-center justify-between py-1">
                <span className="text-sm text-gray-600">{name}</span>
                <span className="text-xs font-medium text-field-700">
                  → {team ? team.name : `Team #${teamId}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Reminder */}
      <div className="bg-cream-50 rounded-lg border border-cream-200 px-4 py-3">
        <p className="text-xs text-gray-500">
          <span className="font-semibold text-gray-700">Tip:</span>{' '}
          These mappings are saved automatically. Next time you import a box score
          with the same team names, they'll match right away.
        </p>
      </div>
    </div>
  );
}
