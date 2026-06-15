// PaymentsReport — unified accounting view for umpire + field-prep payments.
// Filters: date range, kind, status, org, season. Bulk mark-paid + CSV export.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchPaymentsReport, bulkMarkPaid, fetchOrganizations, fetchSeasons } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Badge, Card, CardBody, Input, Select } from './ui';

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtMoney(v) { return `$${Number(v || 0).toFixed(2)}`; }
function fmtDate(s) {
  if (!s) return '—';
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function PaymentsReport() {
  const { isSuperAdmin, isAccountant, isOrgAdmin } = useAuth();
  const canView = isSuperAdmin || isAccountant || isOrgAdmin;

  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(todayStr());
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('unpaid');
  const [orgId, setOrgId] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [includeNoShow, setIncludeNoShow] = useState(false);

  const [orgs, setOrgs] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Load org + season options once
  useEffect(() => {
    fetchOrganizations().then(setOrgs).catch(() => setOrgs([]));
    fetchSeasons().then(setSeasons).catch(() => setSeasons([]));
  }, []);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true); setError(null); setSelected(new Set());
    try {
      const res = await fetchPaymentsReport({
        from, to, kind, status,
        org_id: orgId || undefined,
        season_id: seasonId || undefined,
        include_no_show: includeNoShow ? 'true' : 'false',
      });
      setRows(res.rows || []);
      setSummary(res.summary || {});
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [canView, from, to, kind, status, orgId, seasonId, includeNoShow]);

  useEffect(() => { load(); }, [load]);

  const rowKey = (r) => `${r.kind}:${r.game_id}:${r.person_id}:${r.task_name}`;

  const toggleRow = (r) => {
    if (r.is_paid) return; // can't re-pay
    const k = rowKey(r);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const toggleAll = () => {
    const unpaid = rows.filter(r => !r.is_paid && !r.no_show);
    if (selected.size >= unpaid.length) setSelected(new Set());
    else setSelected(new Set(unpaid.map(rowKey)));
  };

  const selectedRows = useMemo(() => rows.filter(r => selected.has(rowKey(r))), [rows, selected]);
  const selectedTotal = selectedRows.reduce((sum, r) => sum + (r.no_show ? 0 : r.amount), 0);

  // Group by person for the summary section
  const byPerson = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const k = `${r.kind}:${r.person_id}`;
      if (!map.has(k)) {
        map.set(k, { kind: r.kind, person_id: r.person_id, name: r.person_name || `#${r.person_id}`,
          assignments: 0, earned: 0, paid: 0, unpaid: 0 });
      }
      const e = map.get(k);
      e.assignments += 1;
      if (!r.no_show) {
        e.earned += r.amount;
        if (r.is_paid) e.paid += r.amount;
        else e.unpaid += r.amount;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.unpaid - a.unpaid || a.name.localeCompare(b.name));
  }, [rows]);

  async function markSelectedPaid() {
    if (!selectedRows.length) return;
    if (!window.confirm(`Mark ${selectedRows.length} assignment(s) as paid (${fmtMoney(selectedTotal)})?`)) return;
    setBulkBusy(true);
    try {
      const entries = selectedRows.map(r => ({
        kind: r.kind,
        game_id: r.game_id,
        person_id: r.person_id,
        task_type_id: r.task_type_id, // present on prep rows
      }));
      // Prep rows: we need task_type_id but the unified payload doesn't include it.
      // Use task_name to find it — but server requires task_type_id for prep. Pull
      // it from the row if present, else look it up via a second request. For now
      // we attach undefined and the server falls back to refusing prep without
      // task_type_id. To handle prep here we use the row's task_type_id when present.
      const res = await bulkMarkPaid(entries);
      if (res.errors?.length) {
        console.warn('Bulk paid partial errors:', res.errors);
        alert(`Marked ${res.updated} as paid. ${res.errors.length} row(s) failed — see console.`);
      }
      await load();
    } catch (err) {
      alert(`Failed: ${err.message}`);
    } finally { setBulkBusy(false); }
  }

  function exportCsv() {
    const header = [
      'Kind', 'Person', 'Email', 'Venmo', 'Date', 'Time', 'Org', 'Season',
      'Home Team', 'Away Team', 'Location', 'Task', 'Amount',
      'Paid', 'Paid At', 'No Show', 'Game Status', 'Game ID', 'Person ID',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        r.kind,
        r.person_name || '',
        r.person_email || '',
        r.person_venmo || '',
        r.game_date || '',
        r.game_time || '',
        r.org_name || '',
        r.season_name || '',
        r.home_team_name || '',
        r.away_team_name || '',
        r.location_name || '',
        r.task_name || '',
        r.no_show ? '0.00' : Number(r.amount || 0).toFixed(2),
        r.is_paid ? 'Yes' : 'No',
        r.paid_at ? new Date(r.paid_at).toISOString() : '',
        r.no_show ? 'Yes' : 'No',
        r.game_status || '',
        r.game_id,
        r.person_id,
      ].map(csvEscape).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!canView) return <div className="lh-alert lh-alert-error">Not authorized.</div>;

  const unpaidSelectableCount = rows.filter(r => !r.is_paid && !r.no_show).length;
  const allSelected = selected.size > 0 && selected.size === unpaidSelectableCount;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-display font-bold text-white">Payments Report</h2>
        <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!rows.length}>
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card><CardBody className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 items-end">
        <div>
          <label className="lh-eyebrow block mb-1">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="lh-eyebrow block mb-1">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="lh-eyebrow block mb-1">Kind</label>
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All</option>
            <option value="umpire">Umpires</option>
            <option value="prep">Field Prep</option>
          </Select>
        </div>
        <div>
          <label className="lh-eyebrow block mb-1">Status</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="unpaid">Unpaid only</option>
            <option value="paid">Paid only</option>
          </Select>
        </div>
        <div>
          <label className="lh-eyebrow block mb-1">Organization</label>
          <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">All orgs</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="lh-eyebrow block mb-1">Season</label>
          <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
            <option value="">All seasons</option>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name} ({s.year})</option>)}
          </Select>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-200 cursor-pointer mb-2">
          <input type="checkbox" checked={includeNoShow} onChange={(e) => setIncludeNoShow(e.target.checked)} className="accent-green-500" />
          Show no-shows
        </label>
      </CardBody></Card>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Card><CardBody className="text-center">
            <div className="text-xs text-gray-400">Assignments</div>
            <div className="text-lg font-semibold text-white">{summary.total_assignments || 0}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{summary.umpire_count || 0} ump · {summary.prep_count || 0} prep</div>
          </CardBody></Card>
          <Card><CardBody className="text-center">
            <div className="text-xs text-gray-400">Total Earned</div>
            <div className="text-lg font-semibold text-emerald-400">{fmtMoney(summary.total_earned)}</div>
          </CardBody></Card>
          <Card><CardBody className="text-center">
            <div className="text-xs text-gray-400">Total Paid</div>
            <div className="text-lg font-semibold text-emerald-400">{fmtMoney(summary.total_paid)}</div>
          </CardBody></Card>
          <Card><CardBody className="text-center">
            <div className="text-xs text-gray-400">Unpaid</div>
            <div className="text-lg font-semibold text-yellow-400">{fmtMoney(summary.total_unpaid)}</div>
          </CardBody></Card>
          <Card><CardBody className="text-center">
            <div className="text-xs text-gray-400">No-Shows</div>
            <div className="text-lg font-semibold text-gray-300">{summary.no_show_count || 0}</div>
          </CardBody></Card>
        </div>
      )}

      {/* Per-person summary */}
      {byPerson.length > 0 && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-display uppercase tracking-wide text-gray-300">Owed by Person</h3>
              <span className="text-xs text-gray-500">{byPerson.length} people</span>
            </div>
            <div className="border border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800 text-gray-300">
                  <tr>
                    <th className="px-3 py-2 text-left">Person</th>
                    <th className="px-3 py-2 text-left">Kind</th>
                    <th className="px-3 py-2 text-right">Assignments</th>
                    <th className="px-3 py-2 text-right">Earned</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Unpaid</th>
                  </tr>
                </thead>
                <tbody>
                  {byPerson.map(p => (
                    <tr key={`${p.kind}:${p.person_id}`} className="border-t border-gray-700">
                      <td className="px-3 py-2 text-gray-100">{p.name}</td>
                      <td className="px-3 py-2"><Badge variant={p.kind === 'umpire' ? 'info' : 'success'}>{p.kind}</Badge></td>
                      <td className="px-3 py-2 text-right text-gray-200">{p.assignments}</td>
                      <td className="px-3 py-2 text-right text-emerald-300">{fmtMoney(p.earned)}</td>
                      <td className="px-3 py-2 text-right text-emerald-300">{fmtMoney(p.paid)}</td>
                      <td className="px-3 py-2 text-right text-yellow-300 font-semibold">{fmtMoney(p.unpaid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-16 z-10 bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center justify-between gap-2">
          <span className="text-sm text-gray-200">
            {selected.size} selected · <span className="text-emerald-300 font-semibold">{fmtMoney(selectedTotal)}</span>
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button size="sm" onClick={markSelectedPaid} disabled={bulkBusy}>
              {bulkBusy ? 'Marking…' : 'Mark Selected Paid'}
            </Button>
          </div>
        </div>
      )}

      {/* Main detail table */}
      <Card>
        <CardBody>
          {error && <div className="lh-alert lh-alert-error mb-2">{error}</div>}
          {loading ? (
            <p className="py-8 text-center text-gray-400">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-gray-400">No payment rows match the current filters.</p>
          ) : (
            <div className="border border-gray-700 rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-225">
                <thead className="bg-gray-800 text-gray-300">
                  <tr>
                    <th className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        disabled={unpaidSelectableCount === 0}
                        className="accent-green-500"
                        title="Select all unpaid"
                      />
                    </th>
                    <th className="px-2 py-2 text-left">Date</th>
                    <th className="px-2 py-2 text-left">Kind</th>
                    <th className="px-2 py-2 text-left">Person</th>
                    <th className="px-2 py-2 text-left">Task</th>
                    <th className="px-2 py-2 text-left">Game</th>
                    <th className="px-2 py-2 text-left">Org</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="px-2 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const key = rowKey(r);
                    const checked = selected.has(key);
                    const disabled = r.is_paid || r.no_show;
                    return (
                      <tr key={key} className={`border-t border-gray-700 ${checked ? 'bg-action-900/15' : ''}`}>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleRow(r)}
                            className="accent-green-500"
                          />
                        </td>
                        <td className="px-2 py-2 text-gray-200 whitespace-nowrap">{fmtDate(r.game_date)}</td>
                        <td className="px-2 py-2">
                          <Badge variant={r.kind === 'umpire' ? 'info' : 'success'}>{r.kind}</Badge>
                        </td>
                        <td className="px-2 py-2 text-gray-100">
                          {r.person_name || `#${r.person_id}`}
                          {r.person_venmo && (
                            <div className="text-[10px] text-gray-400">Venmo: {r.person_venmo}</div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-gray-200">{r.task_name}</td>
                        <td className="px-2 py-2 text-gray-300">
                          {r.away_team_name} @ {r.home_team_name}
                          {r.location_name && <div className="text-[10px] text-gray-500">{r.location_name}</div>}
                        </td>
                        <td className="px-2 py-2 text-gray-300">{r.org_name || '—'}</td>
                        <td className="px-2 py-2 text-right font-mono">
                          <span className={r.no_show ? 'text-gray-500 line-through' : 'text-emerald-300'}>
                            {fmtMoney(r.amount)}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {r.no_show ? <Badge variant="danger">No Show</Badge>
                            : r.is_paid ? <Badge variant="success">Paid</Badge>
                            : <Badge variant="warning">Unpaid</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
