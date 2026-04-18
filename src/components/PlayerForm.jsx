import { useState, useEffect } from 'react';
import { fetchPositions, createPlayer, updatePlayer } from '../api/index.js';
import { Button, Input, Select, Modal } from './ui';

const BATTING_OPTIONS = ['R', 'L', 'S'];
const THROWING_OPTIONS = ['R', 'L'];
const GRADE_OPTIONS = ['Pre K', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const JERSEY_SIZE_OPTIONS = ['Youth - XS', 'Youth - S', 'Youth - SM', 'Youth - MD', 'Youth - M', 'Youth - L', 'Youth - LG', 'Youth - XL', 'Adult - SM', 'Adult - MD', 'Adult - LG', 'Adult - XL'];
const HAT_SIZE_OPTIONS = ['XS/S', 'S/M', 'M/L', 'L/XL', 'Snapback', 'Visor'];
const RELATIONSHIP_OPTIONS = ['parent', 'guardian', 'emergency', 'other'];



const EMPTY_CONTACT = { first_name: '', last_name: '', relationship: 'parent', email: '', phone: '', is_primary: false };

export default function PlayerForm({ teamId, player, onSaved, onCancel }) {
  const isEditing = !!player;
  const [positions, setPositions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    firstName: '', lastName: '', jerseyNumber: '',
    selectedPositions: [], dateOfBirth: '',
    battingHand: '', throwingHand: '', grade: '',
    jerseySize: '', hatSize: '', needsNewJersey: false, needsNewHat: false,
    playerEmail: '', playerPhone: '',
  });

  const [contacts, setContacts] = useState([{ ...EMPTY_CONTACT, is_primary: true }]);

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
        jerseySize: player.jersey_size || '', hatSize: player.hat_size || '',
        needsNewJersey: !!player.needs_new_jersey, needsNewHat: !!player.needs_new_hat,
        playerEmail: player.email || '', playerPhone: player.phone || '',
      });
    }
  }, [player]);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
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

  function handleContactChange(idx, field, value) {
    setContacts(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      if (field === 'is_primary' && value) {
        return { ...c, is_primary: true };
      }
      return { ...c, [field]: value };
    }));
    if (field === 'is_primary' && value) {
      setContacts(prev => prev.map((c, i) => i === idx ? c : { ...c, is_primary: false }));
    }
  }

  function addContact() {
    setContacts(prev => [...prev, { ...EMPTY_CONTACT }]);
  }

  function removeContact(idx) {
    setContacts(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length > 0 && !next.some(c => c.is_primary)) {
        next[0].is_primary = true;
      }
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const validContacts = contacts.filter(c => c.first_name.trim() && c.last_name.trim());
    const data = {
      team_id: teamId,
      first_name: form.firstName.trim(), last_name: form.lastName.trim(),
      jersey_number: form.jerseyNumber ? Number(form.jerseyNumber) : null,
      position_ids: form.selectedPositions,
      date_of_birth: form.dateOfBirth || null,
      batting_hand: form.battingHand || null, throwing_hand: form.throwingHand || null,
      grade: form.grade || null,
      jersey_size: form.jerseySize || null, hat_size: form.hatSize || null,
      needs_new_jersey: form.needsNewJersey, needs_new_hat: form.needsNewHat,
      email: form.playerEmail || null, phone: form.playerPhone || null,
      contacts: validContacts.map(c => ({
        first_name: c.first_name.trim(),
        last_name: c.last_name.trim(),
        relationship: c.relationship || 'parent',
        email: c.email.trim() || null,
        phone: c.phone.trim() || null,
        is_primary: c.is_primary,
      })),
    };
    try {
      if (isEditing) await updatePlayer(player.id, data);
      else await createPlayer(data);
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onCancel} size="md" title={isEditing ? 'Edit Player' : 'Add Player'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_80px] gap-3">
            <Input label="First Name *" id="firstName" name="firstName" type="text" value={form.firstName} onChange={handleChange} required placeholder="First" />
            <Input label="Last Name *" id="lastName" name="lastName" type="text" value={form.lastName} onChange={handleChange} required placeholder="Last" />
            <Input label="Jersey #" id="jerseyNumber" name="jerseyNumber" type="text" value={form.jerseyNumber} onChange={handleChange} placeholder="00" maxLength={3} />
          </div>

          {/* Positions */}
          <div>
            <label className="eyebrow block">Position(s)</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {positions.length === 0 ? (
                <span className="text-xs text-gray-400">No positions available</span>
              ) : positions.map((pos) => (
                <button key={pos.id} type="button" onClick={() => handlePositionToggle(pos.id)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${form.selectedPositions.includes(pos.id) ? 'lh-tab-active border-action-800' : 'bg-gray-800 text-gray-300 border-gray-600 hover:border-action-600'}`}>
                  {pos.abbreviation || pos.name}
                </button>
              ))}
            </div>
          </div>

          {/* DOB, Bats, Throws, Grade */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input label="Date of Birth" id="dateOfBirth" name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={handleChange} />
            <Select label="Bats" id="battingHand" name="battingHand" value={form.battingHand} onChange={handleChange}>
                <option value="">—</option>
                {BATTING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
            <Select label="Throws" id="throwingHand" name="throwingHand" value={form.throwingHand} onChange={handleChange}>
                <option value="">—</option>
                {THROWING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
            <Select label="Grade" id="grade" name="grade" value={form.grade} onChange={handleChange}>
                <option value="">—</option>
                {GRADE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
          </div>

          {/* Jersey & Hat Sizing */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Select label="Jersey Size" id="jerseySize" name="jerseySize" value={form.jerseySize} onChange={handleChange}>
                <option value="">—</option>
                {JERSEY_SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
            <Select label="Hat Size" id="hatSize" name="hatSize" value={form.hatSize} onChange={handleChange}>
                <option value="">—</option>
                {HAT_SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="needsNewJersey" checked={form.needsNewJersey} onChange={handleChange} className="accent-action-500 w-4 h-4" />
                <span className="text-sm text-gray-300">Needs New Jersey</span>
              </label>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="needsNewHat" checked={form.needsNewHat} onChange={handleChange} className="accent-action-500 w-4 h-4" />
                <span className="text-sm text-gray-300">Needs New Hat</span>
              </label>
            </div>
          </div>

          {/* Player Contact Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Player Email" id="playerEmail" name="playerEmail" type="email" value={form.playerEmail} onChange={handleChange} placeholder="player@email.com" />
            <Input label="Player Phone" id="playerPhone" name="playerPhone" type="tel" value={form.playerPhone} onChange={handleChange} placeholder="555-555-5555" />
          </div>

          {/* Guardians */}
          {!isEditing && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="eyebrow block">Guardians</label>
                <button type="button" onClick={addContact} className="text-xs font-semibold text-chrome-400 hover:text-chrome-300 underline">+ Add Guardian</button>
              </div>
              <div className="space-y-3">
                {contacts.map((contact, idx) => (
                  <div key={idx} className="bg-gray-900 border border-gray-700 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-300">Guardian {idx + 1}</span>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                          <input type="checkbox" checked={contact.is_primary} onChange={(e) => handleContactChange(idx, 'is_primary', e.target.checked)} className="accent-action-500" />
                          Primary
                        </label>
                        {contacts.length > 1 && (
                          <button type="button" onClick={() => removeContact(idx)} className="text-xs text-signal-400 hover:text-signal-300">Remove</button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <Input type="text" value={contact.first_name} onChange={(e) => handleContactChange(idx, 'first_name', e.target.value)} placeholder="First Name *" />
                      <Input type="text" value={contact.last_name} onChange={(e) => handleContactChange(idx, 'last_name', e.target.value)} placeholder="Last Name *" />
                      <Select value={contact.relationship} onChange={(e) => handleContactChange(idx, 'relationship', e.target.value)}>
                          {RELATIONSHIP_OPTIONS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                      </Select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input type="email" value={contact.email} onChange={(e) => handleContactChange(idx, 'email', e.target.value)} placeholder="Email" />
                      <Input type="tel" value={contact.phone} onChange={(e) => handleContactChange(idx, 'phone', e.target.value)} placeholder="Phone" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div className="lh-alert lh-alert-error">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="submit" size="sm" loading={saving} disabled={saving}>
              {saving ? 'Saving…' : isEditing ? 'Update Player' : 'Add Player'}
            </Button>
          </div>
        </form>
    </Modal>
  );
}
