function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Past games that should have a final score but don't — flagged in schedules
// so coaches/scorekeepers notice and enter the result.
export function needsScoreEntry(game) {
  if (!game?.game_date) return false;
  return (
    game.game_date < todayKey() &&
    game.status !== 'cancelled' &&
    game.status !== 'postponed' &&
    game.home_score == null &&
    game.away_score == null
  );
}

export function isGameToday(game) {
  return !!game?.game_date && game.game_date === todayKey();
}
