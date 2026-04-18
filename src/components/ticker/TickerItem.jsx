function shortTeamName(game, side) {
  const city = game[`${side}_team_city`];
  const mascot = game[`${side}_team_mascot`];
  if (city || mascot) return [city, mascot].filter(Boolean).join(' ');
  const full = game[`${side}_team_name`] || '?';
  return full.split(' ').slice(0, 2).join(' ');
}

function inningLabel(n) {
  if (!n) return null;
  const num = Number(n);
  const s = num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th';
  return `${num}${s}`;
}

export default function TickerItem({ game }) {
  const away = shortTeamName(game, 'away');
  const home = shortTeamName(game, 'home');
  const inning = inningLabel(game.innings_played);
  const awayScore = game.away_score ?? '–';
  const homeScore = game.home_score ?? '–';

  return (
    <div className="flex items-center gap-2.5 px-5 h-10 border-r border-gray-700/50 text-xs shrink-0">
      <span className="text-gray-200 font-medium tracking-tight">{away}</span>
      <span className="tabular-nums font-bold text-action-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {awayScore}
      </span>
      <span className="text-gray-600 font-light select-none">–</span>
      <span className="tabular-nums font-bold text-action-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {homeScore}
      </span>
      <span className="text-gray-200 font-medium tracking-tight">{home}</span>
      {inning && (
        <span className="text-gray-500 text-[10px] font-mono ml-0.5">{inning}</span>
      )}
    </div>
  );
}
