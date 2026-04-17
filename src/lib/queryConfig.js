// Centralised stale-time values so cache behaviour is tuned in one place.
// Per-query staleTime overrides the global default set in main.jsx.
const M = 60_000; // 1 minute in ms

export const STALE = {
    HOUR:      60 * M,  // seasons, orgs, directory, branding — rarely changed by admins
    FIVE_MIN:   5 * M,  // registrations / financial data
    THREE_MIN:  3 * M,  // team metadata
    TWO_MIN:    2 * M,  // rosters, staff, players list, standings, announcements
    ONE_MIN:        M,  // games — active on game days
    THIRTY_SEC: M / 2,  // pitch rest, dashboard activity — near-live
};
