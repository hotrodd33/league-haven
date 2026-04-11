import { cn } from '../../lib/cn.js';

/* ═══════════════════════════════════════════════════════
   Player Mapper
   ═══════════════════════════════════════════════════════
   Shown during import when pitchers are detected in the
   box score. Shows each pitcher with their auto-suggested
   match and lets the user change the mapping or choose
   "Create new player".
   ═══════════════════════════════════════════════════════ */

export default function PlayerMapper({
  pitcherMappings = [],
  playersByTeam = {},
  mappings,
  onChange,
}) {
  if (pitcherMappings.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-400">No pitchers detected in the box score.</p>
      </div>
    );
  }

  // Group pitchers by team for display
  const byTeam = {};
  for (const pm of pitcherMappings) {
    const key = pm.teamName || pm.side;
    if (!byTeam[key]) byTeam[key] = { teamId: pm.teamId, pitchers: [] };
    byTeam[key].pitchers.push(pm);
  }

  const allMatched = pitcherMappings.every(pm => {
    const val = mappings[pm.gcName];
    return val !== undefined ? val !== '' : pm.suggestedPlayerId != null;
  });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-heading text-lg font-bold text-gray-100">
          Map Pitchers
        </h3>
        <p className="mt-1 text-sm text-gray-400">
          Review how each pitcher from the box score maps to players in your system.
          Change the mapping if needed, or choose "Create new player".
        </p>
      </div>

      {Object.entries(byTeam).map(([teamName, { teamId, pitchers }]) => {
        const players = teamId ? (playersByTeam[teamId] || []) : [];

        return (
          <div key={teamName} className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              {teamName}
            </h4>

            {pitchers.map((pm) => {
              // Current mapping: explicit user choice, or auto-suggested
              const userChoice = mappings[pm.gcName];
              const effectiveId = userChoice !== undefined ? userChoice : (pm.suggestedPlayerId ? String(pm.suggestedPlayerId) : '');
              const isAutoMatched = userChoice === undefined && pm.suggestedPlayerId != null;
              const isNew = effectiveId === '' || effectiveId === '__new__';

              // Find the matched player name for display
              let matchedName = null;
              if (effectiveId && effectiveId !== '__new__') {
                const p = players.find(pl => String(pl.id) === String(effectiveId));
                if (p) matchedName = `${p.first_name} ${p.last_name}`;
                else if (pm.suggestedPlayerName) matchedName = pm.suggestedPlayerName;
              }

              const statParts = [
                pm.pitches != null ? `${pm.pitches}P` : null,
                pm.strikes != null ? `${pm.strikes}S` : null,
                pm.ip != null ? `${pm.ip} IP` : null,
              ].filter(Boolean).join(' / ');

              return (
                <div
                  key={pm.gcName}
                  className={cn(
                    'rounded-xl border p-4 transition-colors',
                    isNew
                      ? 'border-amber-300 bg-amber-50/50'
                      : 'border-field-300 bg-field-50/50'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm',
                      isNew ? 'bg-amber-100 text-amber-600' : 'bg-field-100 text-field-600'
                    )}>
                      {isNew ? '+' : '✓'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-100">
                          {pm.gcName}
                          {pm.jersey && (
                            <span className="ml-1.5 text-xs font-normal text-gray-400">
                              #{pm.jersey}
                            </span>
                          )}
                        </p>
                        {statParts && (
                          <span className="text-xs text-gray-400">{statParts}</span>
                        )}
                      </div>

                      {isAutoMatched && (
                        <p className="text-xs text-field-600 mt-0.5">
                          Auto-matched to {matchedName || `Player #${pm.suggestedPlayerId}`}
                        </p>
                      )}

                      <select
                        value={effectiveId}
                        onChange={(e) => {
                          const val = e.target.value;
                          onChange({ ...mappings, [pm.gcName]: val });
                        }}
                        className={cn(
                          'mt-2 w-full rounded-lg border bg-gray-800 px-3 py-2 text-sm text-gray-100',
                          'focus:outline-none focus:ring-2 focus:ring-field-500/40 focus:border-field-500',
                          isNew && 'border-amber-300'
                        )}
                      >
                        <option value="">— Select a player —</option>
                        <option value="__new__">+ Create new player</option>
                        {players
                          .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`))
                          .map((p) => (
                            <option key={p.id} value={String(p.id)}>
                              {p.first_name} {p.last_name}
                              {p.jersey_number != null ? ` #${p.jersey_number}` : ''}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {!allMatched && (
        <div className="bg-cream-50 rounded-lg border border-cream-200 px-4 py-3">
          <p className="text-xs text-gray-400">
            <span className="font-semibold text-gray-300">Tip:</span>{' '}
            Pitchers without a match will be created as new players automatically.
          </p>
        </div>
      )}
    </div>
  );
}
