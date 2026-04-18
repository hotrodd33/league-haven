import { useState, useRef, useCallback } from 'react';
import { cn } from '../../lib/cn.js';
import { Card, CardBody, Badge, Button } from '../ui/index.js';
import {
  ChartBarIcon, CalendarIcon, UsersIcon, ClipboardIcon,
  ArrowUpTrayIcon, SparklesIcon, ChevronRightIcon,
} from '../ui/icons.jsx';

/* ═══════════════════════════════════════════════════════
   Step 1 — Choose Import Type
   Big illustrated cards with descriptions.
   ═══════════════════════════════════════════════════════ */

const IMPORT_TYPES = [
  {
    key: 'stats',
    label: 'Season Stats',
    desc: 'Player batting, pitching, and fielding stats from a full season CSV export.',
    howTo: 'In GameChanger → Stats tab → Export Stats',
    icon: ChartBarIcon,
    color: 'field',
    badge: 'Most Popular',
  },
  {
    key: 'boxscore',
    label: 'Box Score',
    desc: 'Individual game box scores — single or multiple games. Upload the PDF export directly.',
    howTo: 'In GameChanger → Game → Box Score → Share → Save as PDF',
    icon: ClipboardIcon,
    color: 'blue',
  },
  {
    key: 'schedule',
    label: 'Schedule',
    desc: 'Import game schedules from iCal (.ics) or CSV export files.',
    howTo: 'In GameChanger → Schedule → Export Calendar',
    icon: CalendarIcon,
    color: 'dirt',
  },
  {
    key: 'roster',
    label: 'Roster / Player List',
    desc: 'Import players with jersey numbers, contact info, and parent details from any CSV.',
    howTo: 'Export a player list from GameChanger, Data Manager, or any spreadsheet',
    icon: UsersIcon,
    color: 'baseball',
  },
];

const colorMap = {
  field:    { bg: 'bg-action-900/35', icon: 'text-action-300', border: 'border-action-700', ring: 'ring-action-500', hoverBg: 'hover:bg-action-900/55' },
  blue:     { bg: 'bg-chrome-900/35', icon: 'text-chrome-300', border: 'border-chrome-700', ring: 'ring-chrome-500', hoverBg: 'hover:bg-chrome-900/55' },
  dirt:     { bg: 'bg-accent-900/35', icon: 'text-accent-300', border: 'border-accent-700', ring: 'ring-accent-500', hoverBg: 'hover:bg-accent-900/55' },
  baseball: { bg: 'bg-signal-900/35', icon: 'text-signal-300', border: 'border-signal-700', ring: 'ring-signal-500', hoverBg: 'hover:bg-signal-900/55' },
};

export default function ImportTypeSelector({ selected, onSelect }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-lg font-bold text-gray-100">
          What would you like to import?
        </h3>
        <p className="mt-1 text-sm text-gray-400">
          Choose the type of data you're bringing over from GameChanger.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {IMPORT_TYPES.map((type) => {
          const Icon = type.icon;
          const c = colorMap[type.color];
          const isSelected = selected === type.key;

          return (
            <button
              key={type.key}
              onClick={() => onSelect(type.key)}
              className={cn(
                'relative text-left rounded-xl border-2 p-4 transition-all duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                c.hoverBg, `focus-visible:${c.ring}`,
                isSelected
                  ? cn(c.border, c.bg, 'shadow-card')
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600',
              )}
              aria-pressed={isSelected}
            >
              {type.badge && (
                <Badge variant="success" size="sm" className="absolute top-3 right-3">
                  {type.badge}
                </Badge>
              )}

              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
                isSelected ? c.bg : 'bg-gray-800',
              )}>
                <Icon className={cn('w-5 h-5', isSelected ? c.icon : 'text-gray-400')} />
              </div>

              <h4 className={cn(
                'text-sm font-semibold',
                isSelected ? 'text-gray-100' : 'text-gray-300'
              )}>
                {type.label}
              </h4>
              <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                {type.desc}
              </p>

              {isSelected && (
                <div className="mt-3 pt-3 border-t border-gray-700/60">
                  <p className="text-[10px] font-semibold uppercase text-gray-400 tracking-wide mb-1">
                    How to export
                  </p>
                  <p className="text-xs text-action-300 font-medium flex items-center gap-1">
                    <SparklesIcon className="w-3 h-3 shrink-0" />
                    {type.howTo}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { IMPORT_TYPES };
