import { useState, useEffect } from 'react';
import { fetchPositions, createPlayer, updatePlayer } from '../api/index.js';

const BATTING_OPTIONS = ['R', 'L', 'S'];
const THROWING_OPTIONS = ['R', 'L'];
const GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

const inputCls = "w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1";

export default function PlayerForm({ teamId, player, onSaved, onCancel }) {
  const isEditing = !!player;
  const [positions, setPositions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    firstName: '', lastName: '', jerseyNumber: '',
    selectedPositions: [], dateOfBirth: '',
    battingHand: '', throwingHand: '', grade: '',
    parentEmail: '', parentPhone: '',
  });

  useEffect(() => { fetchPositions().then(setPositions).catch(() => setPositions([])); }, []);

  useEffect(() => {
    if (player) {
      setForm({
        firstName: player.first_name || '', lastName: player.last_name || '',
        jerseyNumber: player.jersey_number ?? '',
        selectedPositions: (player.positions || []).map((p) => p.id),
        dateOfBirth: player.date_of_birth || '',
        battingHand: player.batting_hand || '', throwingHand: player.throwing_hand || '',
        grade: player.grade || '',
        parentEmail: player.parent_email || '', parentPhone: player.parent_phone || '',
      });
    }
  }, [player]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handlePositionToggle(posId) {
    setForm((prev) => {
      const numId = Number(posId);
      const next = prev.selectedPositions.includes(numId)
        ? prev.selectedPositions.filter((id) => id !== numId)
        : [...prev.selectedPositions, numId];
      return { ...prev, selectedPositions: next };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const data = {
      team_id: teamId,
      first_name: form.firstName.trim(), last_name: form.lastName.trim(),
      jersey_number: form.jerseyNumber ? Number(form.jerseyNumber) : null,
      position_ids: form.selectedPositions,
      date_of_birth: form.dateOfBirth || null,
      batting_hand: form.battingHand || null, throwing_hand: form.throwingHand || null,
      grade: form.grade || null,
      parent_email: form.parentEmail.trim() || null, parent_phone: form.parentPhone.trim() || null,
    };
    try {
      if (isEditing) await updatePlayer(player.id, data);
      else await createPlayer(data);
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-5 sm:p-6 my-4">
        <h2 className="text-xl font-heading font-bold text-white mb-4">{isEditing ? 'Edit Player' : 'Add Player'}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_80px] gap-3">
            <div>
              <label htmlFor="firstName" className={labelCls}>First Name *</label>
              <input id="firstName" name="firstName" type="text" value={form.firstName} onChange={handleChange} required placeholder="First" className={inputCls} />
            </div>
            <div>
              <label htmlFor="lastName" className={labelCls}>Last Name *</label>
              <input id="lastName" name="lastName" type="text" value={form.lastName} onChange={handleChange} required placeholder="Last" className={inputCls} />
            </div>
            <div>
              <label htmlFor="jerseyNumber" className={labelCls}>Jersey #</label>
              <input id="jerseyNumber" name="jerseyNumber" type="text" value={form.jerseyNumber} onChange={handleChange} placeholder="00" maxLength={3} className={inputCls} />
            </div>
          </div>

          {/* Positions */}
          <div>
            <label className={labelCls}>Position(s)</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {positions.length === 0 ? (
                <span className="text-xs text-gray-400">No positions available</span>
              ) : positions.map((pos) => (
                <button key={pos.id} type="button" onClick={() => handlePositionToggle(pos.id)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${form.selectedPositions.includes(pos.id) ? 'bg-blue-600 text-white border-blue-800' : 'bg-gray-800 text-gray-300 border-gray-600 hover:border-blue-600'}`}>
                  {pos.abbreviation || pos.name}
                </button>
              ))}
            </div>
          </div>

          {/* DOB, Bats, Throws, Grade */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="dateOfBirth" className={labelCls}>Date of Birth</label>
              <input id="dateOfBirth" name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label htmlFor="battingHand" className={labelCls}>Bats</label>
              <select id="battingHand" name="battingHand" value={form.battingHand} onChange={handleChange} className={inputCls}>
                <option value="">—</option>
                {BATTING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="throwingHand" className={labelCls}>Throws</label>
              <select id="throwingHand" name="throwingHand" value={form.throwingHand} onChange={handleChange} className={inputCls}>
                <option value="">—</option>
                {THROWING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="grade" className={labelCls}>Grade</label>
              <select id="grade" name="grade" value={form.grade} onChange={handleChange} className={inputCls}>
                <option value="">—</option>
                {GRADE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {/* Parent contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="parentEmail" className={labelCls}>Parent Email</label>
              <input id="parentEmail" name="parentEmail" type="email" value={form.parentEmail} onChange={handleChange} placeholder="parent@example.com" className={inputCls} />
            </div>
            <div>
              <label htmlFor="parentPhone" className={labelCls}>Parent Phone</label>
              <input id="parentPhone" name="parentPhone" type="tel" value={form.parentPhone} onChange={handleChange} placeholder="(555) 123-4567" className={inputCls} />
            </div>
          </div>

          {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Saving…' : isEditing ? 'Update Player' : 'Add Player'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
