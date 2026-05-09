// Past games that should have a final score but don't — flagged in schedules
// so coaches/scorekeepers notice and enter the result.
export function needsScoreEntry(game) {
  if (!game?.game_date) return false;
  const todayKey = new Date().toISOString().slice(0, 10);
  return (
    game.game_date < todayKey &&
    game.status !== 'cancelled' &&
    game.status !== 'postponed' &&
    game.home_score == null &&
    game.away_score == null
  );
}
