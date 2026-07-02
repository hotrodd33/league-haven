import { useState, useEffect, useMemo } from 'react';
import { fetchTournaments, fetchTournament } from '../api/index.js';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getMonthDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
  return days;
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const STATUS_LABELS = { draft: 'Draft', active: 'Active', completed: 'Complete', cancelled: 'Cancelled' };
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Tournaments({ onNavigateToTournament }) {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [expandedId, setExpandedId] = useState(null);
  const [expandedData, setExpandedData] = useState(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  useEffect(() => {
    fetchTournaments()
      .then(data => {
        setTournaments(data.sort((a, b) => (a.start_date || '') < (b.start_date || '') ? -1 : 1));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleExpand(t) {
    if (expandedId === t.id) {
      setExpandedId(null);
      setExpandedData(null);
      return;
    }
    setExpandedId(t.id);
    setExpandedData(null);
    try {
      const data = await fetchTournament(t.id);
      setExpandedData(data);
    } catch {
      setExpandedData({ error: true });
    }
  }

  // Calendar: build a map of start_date → tournaments
  const calMap = useMemo(() => {
    const map = {};
    for (const t of tournaments) {
      if (t.start_date) {
        if (!map[t.start_date]) map[t.start_date] = [];
        map[t.start_date].push(t);
      }
    }
    return map;
  }, [tournaments]);

  const days = getMonthDays(calYear, calMonth);

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
          🏆 Tournaments
        </h2>
        <div className="flex gap-1 bg-chrome-800 border border-chrome-700 rounded-lg p-1">
          {['list', 'calendar'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-sm rounded-md font-semibold transition-colors ${view === v ? 'bg-action-700/40 text-action-300' : 'text-gray-400 hover:text-gray-200'}`}
            >
              {v === 'list' ? 'List' : 'Calendar'}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-gray-400 text-center py-16">Loading tournaments…</div>}

      {!loading && view === 'list' && (
        <div className="space-y-3">
          {tournaments.length === 0 && (
            <div className="text-center py-16 text-gray-400">No tournaments scheduled.</div>
          )}
          {tournaments.map(t => (
            <TournamentListCard
              key={t.id}
              tournament={t}
              expanded={expandedId === t.id}
              expandedData={expandedData}
              onExpand={() => handleExpand(t)}
              onNavigate={() => onNavigateToTournament?.(t.id)}
            />
          ))}
        </div>
      )}

      {!loading && view === 'calendar' && (
        <div>
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="text-gray-400 hover:text-white transition-colors px-2 py-1 text-lg">‹</button>
            <h3 className="font-semibold text-white">{MONTH_NAMES[calMonth]} {calYear}</h3>
            <button onClick={nextMonth} className="text-gray-400 hover:text-white transition-colors px-2 py-1 text-lg">›</button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 text-center text-xs text-gray-500 font-semibold mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px bg-chrome-700/30">
            {days.map((date, i) => {
              if (!date) return <div key={`empty-${i}`} className="bg-chrome-900/60 min-h-[80px]" />;
              const key = isoDate(date);
              const daytTournaments = calMap[key] || [];
              const isToday = isoDate(new Date()) === key;
              return (
                <div key={key} className={`bg-chrome-900/80 min-h-[80px] p-1 ${isToday ? 'ring-1 ring-action-500/50' : ''}`}>
                  <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-action-300' : 'text-gray-400'}`}>
                    {date.getDate()}
                  </div>
                  {daytTournaments.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleExpand(t)}
                      className="w-full text-left text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-0.5 truncate hover:bg-amber-500/30 transition-colors"
                      title={t.name}
                    >
                      🏆 {t.name}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Expanded detail panel (calendar) */}
          {expandedId && (
            <div className="mt-4">
              <TournamentDetailPanel
                tournament={tournaments.find(t => t.id === expandedId)}
                data={expandedData}
                onClose={() => { setExpandedId(null); setExpandedData(null); }}
                onNavigate={() => onNavigateToTournament?.(expandedId)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TournamentListCard({ tournament: t, expanded, expandedData, onExpand, onNavigate }) {
  const spotsLabel = t.max_registrations
    ? `${t.registered_count ?? 0} / ${t.max_registrations} registered`
    : `${t.registered_count ?? 0} registered`;

  return (
    <div className="bg-chrome-800/60 border border-chrome-700/50 rounded-xl overflow-hidden">
      <button
        onClick={onExpand}
        className="w-full text-left p-4 hover:bg-chrome-700/30 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-base truncate">{t.name}</h3>
            {t.org_name && <p className="text-xs text-gray-400 mt-0.5">{t.org_name}</p>}
            <div className="flex flex-wrap gap-2 mt-2">
              {(t.start_date || t.end_date) && (
                <span className="text-xs text-gray-300 bg-chrome-700/50 px-2 py-0.5 rounded">
                  📅 {formatDate(t.start_date)}{t.start_date && t.end_date && t.start_date !== t.end_date ? ` — ${formatDate(t.end_date)}` : ''}
                </span>
              )}
              {t.entry_fee != null && Number(t.entry_fee) > 0 && (
                <span className="text-xs text-gray-300 bg-chrome-700/50 px-2 py-0.5 rounded">
                  ${Number(t.entry_fee).toFixed(2)} entry
                </span>
              )}
              <span className="text-xs text-gray-300 bg-chrome-700/50 px-2 py-0.5 rounded">
                {spotsLabel}
              </span>
              {t.registration_open ? (
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                  Open
                </span>
              ) : (
                <span className="text-xs text-gray-500 bg-chrome-700/50 px-2 py-0.5 rounded">
                  {STATUS_LABELS[t.status] || t.status}
                </span>
              )}
            </div>
          </div>
          <span className="text-gray-400 text-sm mt-1">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-chrome-700/50 px-4 pb-4 pt-3">
          {!expandedData ? (
            <div className="text-gray-400 text-sm py-2">Loading details…</div>
          ) : expandedData.error ? (
            <div className="text-signal-400 text-sm py-2">Failed to load details.</div>
          ) : (
            <TournamentDetailContent tournament={expandedData} />
          )}
          <button
            onClick={onNavigate}
            className="mt-3 text-sm text-action-400 hover:text-action-300 font-semibold transition-colors"
          >
            View full bracket →
          </button>
        </div>
      )}
    </div>
  );
}

function TournamentDetailPanel({ tournament: t, data, onClose, onNavigate }) {
  if (!t) return null;
  return (
    <div className="bg-chrome-800/60 border border-chrome-700/50 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <h3 className="font-semibold text-white text-base">{t.name}</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
      </div>
      {!data ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : data.error ? (
        <div className="text-signal-400 text-sm">Failed to load.</div>
      ) : (
        <TournamentDetailContent tournament={data} />
      )}
      <button
        onClick={onNavigate}
        className="text-sm text-action-400 hover:text-action-300 font-semibold transition-colors"
      >
        View full bracket →
      </button>
    </div>
  );
}

function TournamentDetailContent({ tournament: t }) {
  const activeTeams = (t.teams || []).filter(tm => !tm.registration_status || tm.registration_status !== 'withdrawn');

  return (
    <div className="space-y-3">
      {t.description && <p className="text-sm text-gray-300">{t.description}</p>}
      {t.location_notes && <p className="text-sm text-gray-400 flex items-center gap-1">📍 {t.location_notes}</p>}

      <div className="flex flex-wrap gap-2 text-xs">
        {(t.start_date || t.end_date) && (
          <span className="text-gray-300 bg-chrome-700/50 px-2 py-0.5 rounded">
            {formatDate(t.start_date)}{t.start_date && t.end_date && t.start_date !== t.end_date ? ` — ${formatDate(t.end_date)}` : ''}
          </span>
        )}
        {t.entry_fee != null && Number(t.entry_fee) > 0 && (
          <span className="text-gray-300 bg-chrome-700/50 px-2 py-0.5 rounded">
            ${Number(t.entry_fee).toFixed(2)} entry
          </span>
        )}
        <span className="text-gray-300 bg-chrome-700/50 px-2 py-0.5 rounded">
          {activeTeams.length}/{t.team_count} bracket slots
        </span>
      </div>

      {activeTeams.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase text-gray-500 tracking-wider mb-2">Teams Registered</h4>
          <div className="space-y-1">
            {activeTeams.map(tm => (
              <div key={tm.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-200">{tm.name}</span>
                {tm.registration_status === 'waitlisted' && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                    Waitlisted
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTeams.length === 0 && (
        <p className="text-gray-500 text-sm">No teams registered yet.</p>
      )}
    </div>
  );
}
