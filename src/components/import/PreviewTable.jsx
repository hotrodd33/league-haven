import { cn } from '../../lib/cn.js';
import { Badge, Button } from '../ui/index.js';
import {
  Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell, TableEmpty,
} from '../ui/index.js';

/* ═══════════════════════════════════════════════════════
   Step 3 — Preview & Player Match
   Shows parsed data with match confidence badges.
   ═══════════════════════════════════════════════════════ */

function ConfidenceBadge({ confidence }) {
  const map = {
    exact:    { variant: 'success', label: 'Matched' },
    possible: { variant: 'warning', label: 'Review' },
    new:      { variant: 'info',    label: 'New' },
  };
  const c = map[confidence] || map.new;
  return <Badge variant={c.variant} size="sm" dot>{c.label}</Badge>;
}

export default function PreviewTable({
  headers,
  rows,
  importType,
  matchedRows,
  onAcceptAll,
  onToggleAccept,
  onUpdateMatch,
}) {
  const isPlayerType = importType === 'stats' || importType === 'roster';
  const displayRows = isPlayerType && matchedRows ? matchedRows : rows;
  const previewHeaders = headers.slice(0, 8); // Show max 8 columns in preview
  const hasMore = headers.length > 8;

  if (!displayRows || displayRows.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-3xl mb-2 opacity-40">📋</p>
        <p className="text-sm text-gray-400">No data to preview</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-lg font-bold text-gray-100">
            Preview & Match
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {displayRows.length} row{displayRows.length !== 1 ? 's' : ''} found
            {hasMore && ` · ${headers.length} columns (showing first 8)`}
          </p>
        </div>
        {isPlayerType && matchedRows && (
          <Button size="xs" variant="secondary" onClick={onAcceptAll}>
            Accept All Matches
          </Button>
        )}
      </div>

      {/* Match summary for player-based imports */}
      {isPlayerType && matchedRows && (
        <div className="flex gap-3 flex-wrap">
          <MatchSummaryPill
            label="Matched"
            count={matchedRows.filter(r => r._confidence === 'exact').length}
            color="field"
          />
          <MatchSummaryPill
            label="Needs Review"
            count={matchedRows.filter(r => r._confidence === 'possible').length}
            color="dirt"
          />
          <MatchSummaryPill
            label="New Players"
            count={matchedRows.filter(r => r._confidence === 'new').length}
            color="blue"
          />
        </div>
      )}

      <Table>
        <TableHead>
          <tr>
            {isPlayerType && <TableHeaderCell className="w-10">#</TableHeaderCell>}
            {isPlayerType && <TableHeaderCell>Match</TableHeaderCell>}
            {previewHeaders.map((h) => (
              <TableHeaderCell key={h}>{h}</TableHeaderCell>
            ))}
            {isPlayerType && <TableHeaderCell className="w-20">Status</TableHeaderCell>}
          </tr>
        </TableHead>
        <TableBody>
          {displayRows.slice(0, 50).map((row, idx) => (
            <TableRow
              key={idx}
              highlight={row._confidence === 'exact'}
              className={cn(
                row._confidence === 'possible' && 'bg-dirt-900/25',
                row._confidence === 'new' && 'bg-blue-900/25',
              )}
            >
              {isPlayerType && (
                <TableCell className="text-xs font-mono text-gray-400">
                  {idx + 1}
                </TableCell>
              )}
              {isPlayerType && (
                <TableCell>
                  {row._match ? (
                    <div className="text-xs">
                      <p className="font-medium text-gray-100">
                        {row._match.first_name} {row._match.last_name}
                      </p>
                      <p className="text-gray-400">#{row._match.jersey_number}</p>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">No match</span>
                  )}
                </TableCell>
              )}
              {previewHeaders.map((h) => (
                <TableCell key={h} className="text-xs whitespace-nowrap">
                  {typeof row[h] === 'string' && row[h].length > 30
                    ? row[h].substring(0, 30) + '…'
                    : row[h] || '—'}
                </TableCell>
              ))}
              {isPlayerType && (
                <TableCell>
                  <ConfidenceBadge confidence={row._confidence} />
                </TableCell>
              )}
            </TableRow>
          ))}
          {displayRows.length > 50 && (
            <tr>
              <td
                colSpan={previewHeaders.length + (isPlayerType ? 3 : 0)}
                className="px-4 py-3 text-center text-xs text-gray-400 bg-gray-900"
              >
                Showing first 50 of {displayRows.length} rows
              </td>
            </tr>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function MatchSummaryPill({ label, count, color }) {
  const colors = {
    field: 'bg-field-100 text-field-800',
    dirt:  'bg-dirt-100 text-dirt-800',
    blue:  'bg-blue-900/40 text-blue-200',
  };

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold',
      colors[color],
    )}>
      <span className="text-base font-heading">{count}</span>
      {label}
    </span>
  );
}
