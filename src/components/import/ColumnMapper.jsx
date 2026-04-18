import { useMemo } from 'react';
import { cn } from '../../lib/cn.js';

/* ═══════════════════════════════════════════════════════
   Column Mapper
   ═══════════════════════════════════════════════════════
   Shown during roster import to let users map CSV
   columns to known player fields. Auto-detects obvious
   matches using alias lists and lets the user override.
   ═══════════════════════════════════════════════════════ */

const FIELD_GROUPS = [
  {
    label: 'Player',
    fields: [
      { key: 'first_name',  label: 'First Name',  aliases: ['first', 'first name', 'firstname'] },
      { key: 'last_name',   label: 'Last Name',   aliases: ['last', 'last name', 'lastname'] },
      { key: 'full_name',   label: 'Full Name',   aliases: ['player', 'name', 'full name', 'fullname'] },
      { key: 'jersey',      label: 'Jersey #',    aliases: ['#', 'jersey', 'number', 'jersey number', 'jersey #', 'uniform', 'uniform #'] },
      { key: 'team',        label: 'Team',         aliases: ['team', 'club', 'team name', 'teamname'] },
      { key: 'dob',         label: 'Date of Birth', aliases: ['dob', 'date of birth', 'birthday', 'birth date', 'birthdate'] },
      { key: 'grade',       label: 'Grade',        aliases: ['grade', 'year', 'school year'] },
      { key: 'bats',        label: 'Bats',         aliases: ['bats', 'batting hand', 'batting', 'bat hand'] },
      { key: 'throws',      label: 'Throws',       aliases: ['throws', 'throwing hand', 'throwing', 'throw hand'] },
    ],
  },
  {
    label: 'Parent / Guardian 1',
    fields: [
      { key: 'parent1_first_name', label: 'First Name', aliases: ['parent first name', 'parent first', 'guardian first name', 'parent 1 first name', 'parent1 first name', 'parent 1 first'] },
      { key: 'parent1_last_name',  label: 'Last Name',  aliases: ['parent last name', 'parent last', 'guardian last name', 'parent 1 last name', 'parent1 last name', 'parent 1 last'] },
      { key: 'parent1_email',      label: 'Email',      aliases: ['parent email', 'email', 'contact email', 'parent_email', 'parent 1 email', 'parent1 email', 'guardian email'] },
      { key: 'parent1_phone',      label: 'Phone',      aliases: ['parent phone', 'phone', 'contact phone', 'parent_phone', 'parent 1 phone', 'parent1 phone', 'guardian phone'] },
    ],
  },
  {
    label: 'Parent / Guardian 2',
    fields: [
      { key: 'parent2_first_name', label: 'First Name', aliases: ['parent 2 first name', 'parent2 first name', 'parent 2 first', 'second parent first name'] },
      { key: 'parent2_last_name',  label: 'Last Name',  aliases: ['parent 2 last name', 'parent2 last name', 'parent 2 last', 'second parent last name'] },
      { key: 'parent2_email',      label: 'Email',      aliases: ['parent 2 email', 'parent2 email', 'second parent email', 'parent 2 e-mail'] },
      { key: 'parent2_phone',      label: 'Phone',      aliases: ['parent 2 phone', 'parent2 phone', 'second parent phone'] },
    ],
  },
];

const ALL_FIELDS = FIELD_GROUPS.flatMap(g => g.fields);

/** Auto-detect column mappings from CSV headers */
export function autoMapColumns(headers) {
  const mappings = {};
  const usedHeaders = new Set();

  for (const field of ALL_FIELDS) {
    const match = headers.find(
      h => !usedHeaders.has(h) && field.aliases.some(a => a.toLowerCase() === h.toLowerCase())
    );
    if (match) {
      mappings[field.key] = match;
      usedHeaders.add(match);
    } else {
      mappings[field.key] = '';
    }
  }

  return mappings;
}

export default function ColumnMapper({ headers = [], mappings = {}, onChange }) {
  // Which headers are currently used (to show warnings for double-mapping)
  const usedHeaders = useMemo(() => {
    const counts = {};
    for (const h of Object.values(mappings)) {
      if (h) counts[h] = (counts[h] || 0) + 1;
    }
    return counts;
  }, [mappings]);

  const mappedCount = Object.values(mappings).filter(Boolean).length;

  const handleChange = (fieldKey, headerValue) => {
    onChange({ ...mappings, [fieldKey]: headerValue });
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-display text-lg font-bold text-gray-100">
          Map Columns
        </h3>
        <p className="mt-1 text-sm text-gray-400">
          We detected <strong className="text-gray-200">{headers.length}</strong> columns in your file.
          Match each column to the correct player field.
          {mappedCount > 0 && (
            <span className="text-action-300"> ({mappedCount} auto-mapped)</span>
          )}
        </p>
      </div>

      {FIELD_GROUPS.map((group) => (
        <div key={group.label} className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {group.label}
          </h4>
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 divide-y divide-gray-700/50">
            {group.fields.map((field) => {
              const value = mappings[field.key] || '';
              const isDuplicate = value && (usedHeaders[value] || 0) > 1;

              return (
                <div
                  key={field.key}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <label
                    htmlFor={`col-${field.key}`}
                    className="text-sm font-medium text-gray-300 shrink-0 min-w-30"
                  >
                    {field.label}
                  </label>
                  <div className="flex items-center gap-2">
                    {isDuplicate && (
                      <span className="text-[10px] text-amber-400 font-semibold">
                        duplicate
                      </span>
                    )}
                    <select
                      id={`col-${field.key}`}
                      value={value}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className={cn(
                        'lh-select w-48',
                        value
                          ? 'border-action-700 text-gray-200'
                          : 'border-gray-700 text-gray-500',
                      )}
                    >
                      <option value="">— Skip —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
