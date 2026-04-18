import { useState, useEffect } from 'react';
import { cn } from '../../lib/cn.js';
import { fetchTeams, fetchSeasons } from '../../api/index.js';

/* ═══════════════════════════════════════════════════════
   Step 4 — Import Settings
   Toggles for overwrite, team assignment, season, etc.
   ═══════════════════════════════════════════════════════ */

export default function ImportSettings({ importType, settings, onChange }) {
  const [teams, setTeams] = useState([]);
  const [seasons, setSeasons] = useState([]);

  useEffect(() => {
    fetchTeams().then(setTeams).catch(() => {});
    fetchSeasons().then(setSeasons).catch(() => {});
  }, []);

  function toggle(key) {
    onChange({ ...settings, [key]: !settings[key] });
  }

  function set(key, value) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-bold text-gray-100">
          Import Settings
        </h3>
        <p className="mt-1 text-sm text-gray-400">
          Configure how the data should be imported.
        </p>
      </div>

      {/* Team assignment */}
      <SettingGroup label="Assign to Team">
        <select
          value={settings.teamId || ''}
          onChange={(e) => set('teamId', e.target.value || null)}
          className="lh-select"
        >
          <option value="">Auto-detect from file</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}{t.org_name ? ` (${t.org_name})` : ''}
            </option>
          ))}
        </select>
      </SettingGroup>

      {/* Season assignment */}
      {(importType === 'boxscore' || importType === 'stats' || importType === 'schedule') && (
        <SettingGroup label="Season">
          <select
            value={settings.seasonId || ''}
            onChange={(e) => set('seasonId', e.target.value || null)}
            className="lh-select"
          >
            <option value="">Current Season</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.is_current ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </SettingGroup>
      )}

      {/* Toggle: Overwrite Existing */}
      {(importType === 'stats' || importType === 'roster') && (
        <SettingToggle
          label="Overwrite existing data"
          description="Replace existing stats or player info with imported data. If off, only new records are created."
          checked={!!settings.overwrite}
          onChange={() => toggle('overwrite')}
        />
      )}

      {/* Toggle: Import only new */}
      {importType === 'schedule' && (
        <SettingToggle
          label="Import only new games"
          description="Skip games that already exist on the schedule (matched by date, time, and opponent)."
          checked={settings.onlyNew !== false}
          onChange={() => toggle('onlyNew')}
        />
      )}

      {/* Info box */}
      <div className="bg-cream-200 rounded-xl p-4 border border-cream-400">
        <p className="text-xs text-gray-300 leading-relaxed">
          <span className="font-semibold text-gray-300">Tip:</span>{' '}
          {importType === 'stats'
            ? 'Stats will be matched to players by jersey number first, then by name. Review the preview on the previous step to verify matches.'
            : importType === 'schedule'
            ? 'Games will be created with the dates and times from your file. You can edit them later in the Schedule page.'
            : importType === 'roster'
            ? 'New players will be added to the selected team. Existing players matched by jersey number or name will be updated.'
            : 'Data will be imported as-is. You can review and edit after import.'
          }
        </p>
      </div>
    </div>
  );
}

function SettingGroup({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="lh-eyebrow block">{label}</label>
      {children}
    </div>
  );
}

function SettingToggle({ label, description, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        'w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-150',
        checked
          ? 'border-action-700 bg-action-900/20'
          : 'border-gray-700 bg-gray-800 hover:bg-gray-900',
      )}
    >
      <div className={cn(
        'mt-0.5 w-9 h-5 rounded-full transition-colors duration-200 shrink-0 relative',
        checked ? 'bg-action-600' : 'bg-gray-300',
      )}>
        <div className={cn(
          'absolute top-0.5 w-4 h-4 rounded-full bg-gray-800 shadow-sm transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-100">{label}</p>
        <p className="mt-0.5 text-xs text-gray-400 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}
