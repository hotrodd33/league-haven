import { useState, useEffect, useCallback } from 'react';
import { fetchPrepStaffDetail, fetchPrepStaffGames, updatePrepTaskPayment } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Badge, Card, CardBody } from './ui';

const STATUS_COLORS = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
  postponed: 'neutral',
};
const STATUS_LABELS = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Final',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
};

function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
function formatMoney(v) { return `$${Number(v || 0).toFixed(2)}`; }

export default function PrepStaffDetail({ staffId, taskTypes = [], onBack }) {
  const { isSuperAdmin, isAccountant, isOrgAdmin, canEditOrg } = useAuth();
  const canViewFinancials = isSuperAdmin || isAccountant || isOrgAdmin;
  const [staff, setStaff] = useState(null);
  const [data, setData] = useState({ assignments: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingKey, setUpdatingKey] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming');

  const ttMap = Object.fromEntries(taskTypes.map(t => [t.id, t.name]));

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, gd] = await Promise.all([fetchPrepStaffDetail(staffId), fetchPrepStaffGames(staffId)]);
      setStaff(s);
      setData(gd);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [staffId]);

  useEffect(() => { load(); }, [load]);

  const canEdit = staff
    ? (isSuperAdmin || (staff.org_ids?.length && staff.org_ids.some(oid => canEditOrg(oid))))
    : false;

  async function patch(row, fields) {
    const key = `${row.game_id}:${row.task_type_id}`;
    setUpdatingKey(key);
    try {
      await updatePrepTaskPayment(staffId, row.game_id, row.task_type_id, fields);
      const gd = await fetchPrepStaffGames(staffId);
      setData(gd);
    } catch (err) { alert(`Failed: ${err.message}`); }
    finally { setUpdatingKey(null); }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading…</div>;
  if (error) return <div className="lh-alert lh-alert-error">Error: {error}</div>;
  if (!staff) return null;

  const assignments = data.assignments || [];
  const upcoming = assignments.filter(a => !a.is_prep_complete && a.status !== 'cancelled');
  const completed = assignments.filter(a => a.is_prep_complete);
  const list = activeTab === 'upcoming' ? upcoming : completed;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-display font-bold text-white">{staff.name}</h2>
          <div className="flex flex-wrap gap-2 mt-1">
            {staff.org_ids?.length
              ? staff.org_names.map((n, i) => <Badge key={staff.org_ids[i]} variant="info">{n}</Badge>)
              : <Badge variant="info">League</Badge>}
            {staff.linked_username && <Badge variant="info">@{staff.linked_username}</Badge>}
            {canViewFinancials && staff.default_rate_override != null && (
              <Badge variant="success">${Number(staff.default_rate_override).toFixed(2)} override</Badge>
            )}
            <Badge variant="neutral">
              {staff.task_type_ids?.length
                ? staff.task_type_ids.map(id => ttMap[id]).filter(Boolean).join(', ')
                : 'All tasks'}
            </Badge>
          </div>
        </div>
        {onBack && <Button variant="secondary" onClick={onBack}>← Back</Button>}
      </div>

      {(staff.email || staff.phone || (canViewFinancials && staff.venmo_id)) && (
        <Card><CardBody className="text-sm text-gray-300">
          {[staff.email, staff.phone, canViewFinancials && staff.venmo_id ? `Venmo: ${staff.venmo_id}` : null].filter(Boolean).join(' • ')}
        </CardBody></Card>
      )}
      {staff.notes && <Card><CardBody className="text-sm text-gray-300 whitespace-pre-wrap">{staff.notes}</CardBody></Card>}

      {canViewFinancials && data.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Card><CardBody className="text-center"><div className="text-xs text-gray-400">Assignments</div><div className="text-lg font-semibold text-white">{data.summary.total_assignments}</div></CardBody></Card>
          <Card><CardBody className="text-center"><div className="text-xs text-gray-400">Completed</div><div className="text-lg font-semibold text-white">{data.summary.completed_assignments}</div></CardBody></Card>
          <Card><CardBody className="text-center"><div className="text-xs text-gray-400">Earned</div><div className="text-lg font-semibold text-emerald-400">{formatMoney(data.summary.total_earnings)}</div></CardBody></Card>
          <Card><CardBody className="text-center"><div className="text-xs text-gray-400">Paid</div><div className="text-lg font-semibold text-emerald-400">{formatMoney(data.summary.total_payments)}</div></CardBody></Card>
          <Card><CardBody className="text-center"><div className="text-xs text-gray-400">Owed</div><div className="text-lg font-semibold text-yellow-400">{formatMoney(data.summary.total_due)}</div></CardBody></Card>
        </div>
      )}

      <div className="flex gap-2">
        <button className={`lh-tab ${activeTab === 'upcoming' ? 'lh-tab-active' : 'lh-tab-inactive'}`} onClick={() => setActiveTab('upcoming')}>Upcoming ({upcoming.length})</button>
        <button className={`lh-tab ${activeTab === 'completed' ? 'lh-tab-active' : 'lh-tab-inactive'}`} onClick={() => setActiveTab('completed')}>Completed ({completed.length})</button>
      </div>

      {list.length === 0 ? (
        <div className="py-12 text-center text-gray-400">No {activeTab} assignments.</div>
      ) : (
        <div className="border border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-gray-300">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Game</th>
                <th className="px-3 py-2 text-left">Task</th>
                <th className="px-3 py-2 text-right">Share</th>
                <th className="px-3 py-2 text-center">Status</th>
                {canEdit && <th className="px-3 py-2 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {list.map(row => {
                const key = `${row.game_id}:${row.task_type_id}`;
                const busy = updatingKey === key;
                return (
                  <tr key={key} className="border-t border-gray-700">
                    <td className="px-3 py-2 text-gray-200 whitespace-nowrap">
                      {formatDate(row.game_date)}
                      <div className="text-xs text-gray-400">{formatTime(row.game_time)}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-200">
                      <div>{row.away_team_name} @ {row.home_team_name}</div>
                      {row.location_name && <div className="text-xs text-gray-400">{row.location_name}</div>}
                    </td>
                    <td className="px-3 py-2 text-gray-200">
                      {row.task_name}
                      {canViewFinancials && (
                        <div className="text-xs text-gray-400">Rate: {formatMoney(row.task_rate)} ÷ {row.active_helpers || 1}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-300 font-mono">{canViewFinancials ? formatMoney(row.share) : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Badge variant={STATUS_COLORS[row.status] || 'neutral'}>{STATUS_LABELS[row.status] || row.status}</Badge>
                        {row.no_show && <Badge variant="danger">No Show</Badge>}
                        {row.is_paid && <Badge variant="success">Paid</Badge>}
                      </div>
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2 text-right space-y-1">
                        {row.is_prep_complete && (
                          <>
                            <Button size="xs" variant={row.is_paid ? 'secondary' : 'primary'} onClick={() => patch(row, { is_paid: !row.is_paid })} disabled={busy}>
                              {row.is_paid ? 'Mark Unpaid' : 'Mark Paid'}
                            </Button>{' '}
                            <Button size="xs" variant={row.no_show ? 'secondary' : 'danger'} onClick={() => patch(row, { no_show: !row.no_show })} disabled={busy}>
                              {row.no_show ? 'Clear No-Show' : 'No-Show'}
                            </Button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
