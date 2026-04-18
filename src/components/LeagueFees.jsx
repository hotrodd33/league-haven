import { useState, useEffect, useCallback } from 'react';
import {
  fetchRegistrations,
  createRegistration,
  bulkRegisterTeams,
  updateRegistration,
  deleteRegistration,
  fetchTeams,
  fetchSeasons,
  fetchAgeGroups,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import TeamLogo from './TeamLogo.jsx';
import { Button, Badge, Input, Select, Modal } from './ui';

export default function LeagueFees({ onBack }) {
  const { isSuperAdmin } = useAuth();
  const [registrations, setRegistrations] = useState([]);
  const [summary, setSummary] = useState({ total_teams: 0, total_fees: 0, total_collected: 0, total_outstanding: 0 });
  const [teams, setTeams] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [ageGroups, setAgeGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [seasonFilter, setSeasonFilter] = useState('');
  const [ageGroupFilter, setAgeGroupFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');

  // Forms
  const [showRegister, setShowRegister] = useState(false);
  const [registerTeamId, setRegisterTeamId] = useState('');
  const [registerSeasonId, setRegisterSeasonId] = useState('');
  const [registerFee, setRegisterFee] = useState('');
  const [registering, setRegistering] = useState(false);
  const [bulking, setBulking] = useState(false);

  // Payment modal
  const [payingReg, setPayingReg] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payCheck, setPayCheck] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);

  // Fee edit
  const [editingFeeId, setEditingFeeId] = useState(null);
  const [editFeeValue, setEditFeeValue] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = {};
      if (seasonFilter) filters.season_id = seasonFilter;
      if (ageGroupFilter) filters.age_group = ageGroupFilter;
      if (paymentFilter) filters.payment = paymentFilter;

      const [regData, teamRows, seasonRows, agRows] = await Promise.all([
        fetchRegistrations(filters),
        fetchTeams(),
        fetchSeasons(),
        fetchAgeGroups(),
      ]);
      setRegistrations(regData.registrations || []);
      setSummary(regData.summary || { total_teams: 0, total_fees: 0, total_collected: 0, total_outstanding: 0 });
      setTeams(teamRows || []);
      setSeasons(seasonRows || []);
      setAgeGroups(agRows || []);

      // Default season filter to active season
      if (!seasonFilter && seasonRows?.length) {
        const active = seasonRows.find(s => s.is_active);
        if (active) setSeasonFilter(String(active.id));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [seasonFilter, ageGroupFilter, paymentFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  // Reload just registrations (lighter)
  async function reloadRegs() {
    try {
      const filters = {};
      if (seasonFilter) filters.season_id = seasonFilter;
      if (ageGroupFilter) filters.age_group = ageGroupFilter;
      if (paymentFilter) filters.payment = paymentFilter;
      const regData = await fetchRegistrations(filters);
      setRegistrations(regData.registrations || []);
      setSummary(regData.summary || summary);
    } catch (err) {
      setError(err.message);
    }
  }

  // Register a team
  async function handleRegister(e) {
    e.preventDefault();
    if (!registerTeamId || !registerSeasonId) return;
    setRegistering(true);
    setError(null);
    try {
      const fee = registerFee !== '' ? Number(registerFee) : undefined;
      await createRegistration({ team_id: Number(registerTeamId), season_id: Number(registerSeasonId), fee });
      setShowRegister(false);
      setRegisterTeamId('');
      setRegisterFee('');
      await reloadRegs();
    } catch (err) {
      setError(err.message);
    } finally {
      setRegistering(false);
    }
  }

  // Bulk register
  async function handleBulkRegister() {
    const sid = seasonFilter || (seasons.find(s => s.is_active)?.id);
    if (!sid) { setError('Select a season first'); return; }
    if (!window.confirm('Register ALL teams for this season? Teams already registered will be skipped.')) return;
    setBulking(true);
    setError(null);
    try {
      const result = await bulkRegisterTeams(Number(sid));
      await reloadRegs();
      if (result.registered === 0) setError('All teams are already registered for this season.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBulking(false);
    }
  }

  // Payment modal
  function openPayment(reg) {
    setPayingReg(reg);
    setPayAmount(reg.effective_fee != null ? String(reg.effective_fee) : '');
    setPayCheck('');
    setPayNotes('');
  }

  async function handlePaymentSave() {
    if (!payingReg) return;
    setPaymentSaving(true);
    setError(null);
    try {
      await updateRegistration(payingReg.id, {
        is_paid: true,
        paid_amount: payAmount !== '' ? Number(payAmount) : undefined,
        payment_method: 'check',
        check_number: payCheck || undefined,
        payment_notes: payNotes || undefined,
      });
      setPayingReg(null);
      await reloadRegs();
    } catch (err) {
      setError(err.message);
    } finally {
      setPaymentSaving(false);
    }
  }

  // Mark unpaid
  async function handleMarkUnpaid(reg) {
    try {
      await updateRegistration(reg.id, { is_paid: false, paid_amount: null, check_number: null, payment_notes: null });
      await reloadRegs();
    } catch (err) {
      setError(err.message);
    }
  }

  // Fee edit
  async function handleSaveFee(reg) {
    setError(null);
    try {
      const fee = editFeeValue !== '' ? Number(editFeeValue) : null;
      await updateRegistration(reg.id, { fee });
      setEditingFeeId(null);
      await reloadRegs();
    } catch (err) {
      setError(err.message);
    }
  }

  // Remove registration
  async function handleRemove(reg) {
    if (!window.confirm(`Remove ${reg.team_name} from this season?`)) return;
    try {
      await deleteRegistration(reg.id);
      await reloadRegs();
    } catch (err) {
      setError(err.message);
    }
  }

  // Teams not yet registered for selected season
  const registeredTeamIds = new Set(registrations.map(r => r.team_id));
  const unregisteredTeams = teams.filter(t => !registeredTeamIds.has(t.id));

  const fmt = (n) => n != null ? `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={onBack}>← Back</Button>
          <h2 className="text-xl font-display font-bold text-white">League Fees</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setShowRegister(!showRegister); setRegisterSeasonId(seasonFilter); }}>
            + Register Team
          </Button>
          <Button variant="secondary" onClick={handleBulkRegister} disabled={bulking}>
            {bulking ? 'Registering…' : 'Register All Teams'}
          </Button>
        </div>
      </div>

      {error && <div className="lh-alert lh-alert-error mb-4">{error}</div>}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <SummaryCard label="Teams" value={summary.total_teams} />
        <SummaryCard label="Total Fees" value={fmt(summary.total_fees)} color="text-white" />
        <SummaryCard label="Collected" value={fmt(summary.total_collected)} color="text-action-400" />
        <SummaryCard label="Outstanding" value={fmt(summary.total_outstanding)} color={summary.total_outstanding > 0 ? 'text-signal-400' : 'text-action-400'} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value)}
          className="!w-auto min-w-[140px]">
          <option value="">All Seasons</option>
          {seasons.map(s => (
            <option key={s.id} value={s.id}>{s.name} {s.year}{s.is_active ? ' ●' : ''}</option>
          ))}
        </Select>
        <Select value={ageGroupFilter} onChange={(e) => setAgeGroupFilter(e.target.value)}
          className="!w-auto min-w-[120px]">
          <option value="">All Ages</option>
          {ageGroups.map(ag => (
            <option key={ag.id} value={ag.name}>{ag.name}</option>
          ))}
        </Select>
        <Select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}
          className="!w-auto min-w-[120px]">
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
        </Select>
      </div>

      {/* Register form */}
      {showRegister && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-4">
          <h3 className="text-sm font-display font-bold text-white mb-3">Register Team</h3>
          <form onSubmit={handleRegister} className="flex flex-wrap gap-2 items-end">
            <Select label="Team" value={registerTeamId} onChange={(e) => setRegisterTeamId(e.target.value)} wrapperClassName="flex-1 min-w-[160px]" required>
              <option value="">Select team…</option>
              {unregisteredTeams.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.age_group || 'No AG'})</option>
              ))}
            </Select>
            <Select label="Season" value={registerSeasonId} onChange={(e) => setRegisterSeasonId(e.target.value)} wrapperClassName="min-w-[140px]" required>
              <option value="">Select season…</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>{s.name} {s.year}</option>
              ))}
            </Select>
            <Input label="Fee Override" type="number" min="0" step="0.01" value={registerFee} onChange={(e) => setRegisterFee(e.target.value)}
              placeholder="Age group rate" wrapperClassName="min-w-[100px]" />
            <Button type="submit" loading={registering}>Register</Button>
            <Button type="button" variant="ghost" onClick={() => setShowRegister(false)}>Cancel</Button>
          </form>
        </div>
      )}

      {/* Registrations Table */}
      {loading ? (
        <div className="py-12 text-center text-gray-400 animate-pulse">Loading registrations…</div>
      ) : registrations.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          No teams registered{seasonFilter ? ' for this season' : ''}. Use "Register All Teams" or "+ Register Team" to get started.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Team</th>
                  <th className="text-left px-3 py-3">Age / Level</th>
                  <th className="text-left px-3 py-3">Season</th>
                  <th className="text-right px-3 py-3">Fee</th>
                  <th className="text-center px-3 py-3">Status</th>
                  <th className="text-left px-3 py-3">Payment</th>
                  <th className="text-right px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {registrations.map(reg => (
                  <tr key={reg.id} className="hover:bg-gray-800/80 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <TeamLogo src={reg.logo_url} name={reg.team_name} ageGroup={reg.age_group} level={reg.level}
                          primaryColor={reg.primary_color} secondaryColor={reg.secondary_color}
                          cityAbbr={reg.city_abbr} size="w-7 h-7" />
                        <div>
                          <div className="font-semibold text-gray-100">{reg.team_name}</div>
                          {reg.org_name && <div className="text-[11px] text-gray-500">{reg.org_name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {reg.age_group && <Badge variant="info">{reg.age_group}</Badge>}
                      {reg.level && <Badge variant="info" className="ml-1">{reg.level}</Badge>}
                    </td>
                    <td className="px-3 py-3 text-gray-300 text-xs">{reg.season_name} {reg.season_year}</td>
                    <td className="px-3 py-3 text-right">
                      {editingFeeId === reg.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <input type="number" min="0" step="0.01" value={editFeeValue}
                            onChange={(e) => setEditFeeValue(e.target.value)}
                            className="w-20 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-action-500"
                            autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSaveFee(reg); if (e.key === 'Escape') setEditingFeeId(null); }} />
                          <button onClick={() => handleSaveFee(reg)} className="text-chrome-400 text-xs hover:underline">✓</button>
                          <button onClick={() => setEditingFeeId(null)} className="text-gray-500 text-xs hover:underline">✗</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingFeeId(reg.id); setEditFeeValue(reg.fee != null ? String(reg.fee) : ''); }}
                          className="text-right hover:text-chrome-400 transition-colors group" title="Click to edit fee">
                          <span className="font-mono text-gray-100">{fmt(reg.effective_fee)}</span>
                          {reg.fee != null && <span className="ml-1 text-amber-400 text-[10px]" title="Custom override">✱</span>}
                          {reg.fee == null && reg.age_group_fee != null && <span className="ml-1 text-gray-500 text-[10px]" title="From age group config">AG</span>}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {reg.is_paid ? (
                        <Badge variant="success">Paid</Badge>
                      ) : (
                        <Badge variant="danger">Unpaid</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-400">
                      {reg.is_paid ? (
                        <div>
                          {reg.paid_amount != null && <span className="text-action-300">{fmt(reg.paid_amount)}</span>}
                          {reg.check_number && <span className="ml-1">Chk #{reg.check_number}</span>}
                          {reg.paid_at && <div className="text-[10px] text-gray-500">{new Date(reg.paid_at).toLocaleDateString()}</div>}
                        </div>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {reg.is_paid ? (
                          <button onClick={() => handleMarkUnpaid(reg)}
                            className="px-2 py-1 text-[11px] font-semibold bg-amber-900/35 text-amber-300 rounded hover:bg-amber-900/60 transition-colors">
                            Undo
                          </button>
                        ) : (
                          <button onClick={() => openPayment(reg)}
                            className="px-2 py-1 text-[11px] font-semibold bg-green-700 text-white rounded hover:bg-action-600 transition-colors">
                            Pay
                          </button>
                        )}
                        <button onClick={() => handleRemove(reg)}
                          className="px-2 py-1 text-[11px] font-semibold bg-signal-900/35 text-signal-300 rounded hover:bg-signal-900/60 transition-colors">
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {registrations.map(reg => (
              <div key={reg.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TeamLogo src={reg.logo_url} name={reg.team_name} ageGroup={reg.age_group} level={reg.level}
                    primaryColor={reg.primary_color} secondaryColor={reg.secondary_color}
                    cityAbbr={reg.city_abbr} size="w-8 h-8" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-100 truncate">{reg.team_name}</div>
                    <div className="text-[11px] text-gray-500">{reg.org_name} · {reg.season_name} {reg.season_year}</div>
                  </div>
                  {reg.is_paid ? (
                    <Badge variant="success">Paid</Badge>
                  ) : (
                    <Badge variant="danger">Unpaid</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {reg.age_group && <Badge variant="info">{reg.age_group}</Badge>}
                    {reg.level && <Badge variant="info">{reg.level}</Badge>}
                  </div>
                  <span className="font-mono text-sm font-semibold text-gray-100">
                    {fmt(reg.effective_fee)}
                    {reg.fee != null && <span className="ml-1 text-amber-400 text-[10px]">✱</span>}
                  </span>
                </div>
                {reg.is_paid && reg.check_number && (
                  <div className="text-[11px] text-gray-500 mb-2">Chk #{reg.check_number} · {new Date(reg.paid_at).toLocaleDateString()}</div>
                )}
                <div className="flex gap-2">
                  {reg.is_paid ? (
                    <button onClick={() => handleMarkUnpaid(reg)}
                      className="flex-1 px-3 py-1.5 text-xs font-semibold bg-amber-900/35 text-amber-300 rounded-lg hover:bg-amber-900/60">
                      Undo Payment
                    </button>
                  ) : (
                    <button onClick={() => openPayment(reg)}
                      className="flex-1 px-3 py-1.5 text-xs font-semibold bg-green-700 text-white rounded-lg hover:bg-action-600">
                      Record Payment
                    </button>
                  )}
                  <button onClick={() => { setEditingFeeId(reg.id); setEditFeeValue(reg.fee != null ? String(reg.fee) : ''); }}
                    className="px-3 py-1.5 text-xs font-semibold bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600">
                    Edit Fee
                  </button>
                  <button onClick={() => handleRemove(reg)}
                    className="px-3 py-1.5 text-xs font-semibold bg-signal-900/35 text-signal-300 rounded-lg hover:bg-signal-900/60">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Payment Modal */}
      {payingReg && (
        <Modal open onClose={() => setPayingReg(null)} size="md" title="Record Payment">
            <p className="text-sm text-gray-400 mb-4">{payingReg.team_name} — {payingReg.season_name} {payingReg.season_year}</p>

            <div className="space-y-3">
              <Input label="Amount" type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                placeholder={payingReg.effective_fee != null ? String(payingReg.effective_fee) : '0.00'} />
              <Input label="Check Number" type="text" value={payCheck} onChange={(e) => setPayCheck(e.target.value)}
                placeholder="Optional" />
              <Input label="Notes" type="text" value={payNotes} onChange={(e) => setPayNotes(e.target.value)}
                placeholder="Optional" />
              <div className="text-[11px] text-gray-500">Payment method: Check</div>
            </div>

            <div className="flex gap-2 mt-5">
              <Button className="flex-1" onClick={handlePaymentSave} loading={paymentSaving}>Record Payment</Button>
              <Button variant="ghost" onClick={() => setPayingReg(null)}>Cancel</Button>
            </div>
        </Modal>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color = 'text-white' }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">{label}</div>
      <div className={`text-lg font-display font-bold ${color}`}>{value}</div>
    </div>
  );
}
