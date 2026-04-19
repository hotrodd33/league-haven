import { useState, useEffect, useCallback } from 'react';
import {
  fetchAgeGroups, createAgeGroup, updateAgeGroup, deleteAgeGroup,
  fetchLevels, createLevel, updateLevel, deleteLevel,
  fetchDivisions, createDivision, updateDivision, deleteDivision,
  fetchSeasons, createSeason, updateSeason, deleteSeason,
  fetchBranding, updateBranding, uploadBrandingLogo, deleteBrandingLogo,
  fetchScheduleSettings, updateScheduleSettings,
  fetchStatDefinitions, createStatDefinition, updateStatDefinition, deleteStatDefinition,
  fetchFeatureToggles, updateFeatureToggles,
  fetchVolunteerRoles, createVolunteerRole, updateVolunteerRole, deleteVolunteerRole,
} from '../api/index.js';
import { Button, Badge } from './ui/index.js';

export default function LeagueConfig({ onBack }) {
  const [tab, setTab] = useState('age_groups');

  const tabCls = (t) => `lh-tab ${
    tab === t ? 'lh-tab-active' : 'lh-tab-inactive'
  }`;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-xl font-display font-bold text-white">League Configuration</h2>
        {onBack && <Button variant="secondary" onClick={onBack}>← Back</Button>}
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Configure age groups, levels, and divisions for the league. These populate dropdowns when creating or editing teams.
      </p>
      <div className="flex gap-2 mb-5 flex-wrap">
        <button className={tabCls('branding')} onClick={() => setTab('branding')}>Branding</button>
        <button className={tabCls('features')} onClick={() => setTab('features')}>Features</button>
        <button className={tabCls('scheduling')} onClick={() => setTab('scheduling')}>Scheduling</button>
        <button className={tabCls('seasons')} onClick={() => setTab('seasons')}>Seasons</button>
        <button className={tabCls('age_groups')} onClick={() => setTab('age_groups')}>Age Groups</button>
        <button className={tabCls('levels')} onClick={() => setTab('levels')}>Levels</button>
        <button className={tabCls('divisions')} onClick={() => setTab('divisions')}>Divisions</button>
        <button className={tabCls('stats')} onClick={() => setTab('stats')}>Stats</button>
        <button className={tabCls('volunteers')} onClick={() => setTab('volunteers')}>Volunteer Roles</button>
      </div>
      {tab === 'branding' && <BrandingConfig />}
      {tab === 'features' && <FeatureTogglesConfig />}
      {tab === 'scheduling' && <SchedulingConfig />}
      {tab === 'seasons' && <SeasonList />}
      {tab === 'age_groups' && <AgeGroupConfig />}
      {tab === 'levels' && (
        <ConfigList
          title="Levels" placeholder="e.g. Recreational, Competitive, Elite"
          fetchItems={fetchLevels} createItem={createLevel}
          updateItem={updateLevel} deleteItem={deleteLevel}
        />
      )}
      {tab === 'divisions' && <DivisionTree />}
      {tab === 'stats' && <StatDefinitionsConfig />}
      {tab === 'volunteers' && (
        <ConfigList
          title="Volunteer Roles" placeholder="e.g. Head Coach, Asst Coach, Board Member, Team Mom"
          fetchItems={fetchVolunteerRoles} createItem={createVolunteerRole}
          updateItem={updateVolunteerRole} deleteItem={deleteVolunteerRole}
        />
      )}
    </div>
  );
}

function BrandingConfig() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingName, setSavingName] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [form, setForm] = useState({ app_name: 'LeagueHaven', logo_url: null, public_site_url: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBranding();
      setForm({
        app_name: data?.app_name || 'LeagueHaven',
        logo_url: data?.logo_url || null,
        public_site_url: data?.public_site_url || '',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSaveName(e) {
    e.preventDefault();
    const appName = (form.app_name || '').trim();
    if (!appName) return;
    setSavingName(true);
    setError(null);
    try {
      const updated = await updateBranding({ app_name: appName });
      setForm((prev) => ({
        ...prev,
        app_name: updated?.app_name || appName,
        logo_url: updated?.logo_url ?? prev.logo_url,
        public_site_url: updated?.public_site_url ?? prev.public_site_url,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingName(false);
    }
  }

  async function handleSaveUrl(e) {
    e.preventDefault();
    setSavingUrl(true);
    setError(null);
    try {
      const updated = await updateBranding({ public_site_url: (form.public_site_url || '').trim() });
      setForm((prev) => ({
        ...prev,
        app_name: updated?.app_name || prev.app_name,
        logo_url: updated?.logo_url ?? prev.logo_url,
        public_site_url: updated?.public_site_url || '',
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingUrl(false);
    }
  }

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const result = await uploadBrandingLogo(file);
      setForm((prev) => ({ ...prev, logo_url: result?.logo_url || prev.logo_url }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  }

  async function handleRemoveLogo() {
    if (!window.confirm('Remove the current app logo?')) return;
    setRemovingLogo(true);
    setError(null);
    try {
      await deleteBrandingLogo();
      setForm((prev) => ({ ...prev, logo_url: null }));
    } catch (err) {
      setError(err.message);
    } finally {
      setRemovingLogo(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading branding…</div>;

  return (
    <div className="space-y-5">
      <h3 className="text-base font-display font-bold text-white">App Branding</h3>
      <p className="text-xs text-gray-400">
        Set the app name and logo shown in the main sidebar header.
      </p>

      {error && <div className="lh-alert lh-alert-error">{error}</div>}

      <form onSubmit={handleSaveName} className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
        <div>
          <label className="lh-eyebrow block mb-1">Application Name</label>
          <input
            type="text"
            maxLength={48}
            value={form.app_name}
            onChange={(e) => setForm((prev) => ({ ...prev, app_name: e.target.value }))}
            className="lh-input"
            placeholder="League app name"
          />
        </div>
        <Button type="submit" disabled={savingName || !(form.app_name || '').trim()}>
          {savingName ? 'Saving…' : 'Save Name'}
        </Button>
      </form>

      <form onSubmit={handleSaveUrl} className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
        <div>
          <label className="lh-eyebrow block mb-1">Public Website URL</label>
          <input
            type="url"
            value={form.public_site_url}
            onChange={(e) => setForm((prev) => ({ ...prev, public_site_url: e.target.value }))}
            className="lh-input"
            placeholder="https://www.example.org"
          />
          <p className="text-xs text-gray-400 mt-1">
            Base URL of the public-facing league website. Adds a "Website" link to the League sidebar that opens <code className="text-gray-300">{'{URL}'}/site</code> in a new tab. Leave blank to hide.
          </p>
        </div>
        <Button type="submit" disabled={savingUrl}>
          {savingUrl ? 'Saving…' : 'Save URL'}
        </Button>
      </form>

      <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
        <label className="lh-eyebrow block mb-1">Application Logo</label>
        <div className="flex items-center gap-3">
          {form.logo_url ? (
            <img src={form.logo_url} alt="App logo preview" className="w-14 h-14 rounded-lg object-cover bg-gray-800" />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl">
              ⚾
            </div>
          )}
          <div className="text-xs text-gray-400">
            Recommended: square image, up to 512KB.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className={`btn btn-primary btn-md cursor-pointer ${uploadingLogo ? 'opacity-60 pointer-events-none' : ''}`}>
            {uploadingLogo ? 'Uploading…' : 'Upload Logo'}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          </label>
          <Button size="sm" variant="danger" onClick={handleRemoveLogo} disabled={!form.logo_url || removingLogo}>
            {removingLogo ? 'Removing…' : 'Remove Logo'}
          </Button>
        </div>
      </div>
    </div>
  );
}

const FEATURE_DEFS = [
  { key: 'feature_live_scoring',      label: 'Live Scoring',        desc: 'Real-time game scoring and public scoreboard' },
  { key: 'feature_pitch_tracking',    label: 'Pitch Tracking',      desc: 'Pitch counts, rest day calculations, and compliance alerts' },
  { key: 'feature_officials',         label: 'Officials',           desc: 'Umpire/referee management, assignments, and pay tracking' },
  { key: 'feature_stats',             label: 'Player Stats',        desc: 'Per-game stat tracking and player stat profiles' },
  { key: 'feature_documents',         label: 'Player Documents',    desc: 'Upload and manage birth certificates, waivers, etc.' },
  { key: 'feature_financials',        label: 'Financials',          desc: 'League fees, payment tracking, and accountant role' },
  { key: 'feature_registration',      label: 'Team Registration',   desc: 'Public team registration form for new organizations' },
  { key: 'feature_public_site',       label: 'Public Site',         desc: 'Public-facing schedule, standings, and scores' },
  { key: 'feature_push_notifications', label: 'Push Notifications', desc: 'Browser push notifications for schedule changes and announcements' },
];

function FeatureTogglesConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toggles, setToggles] = useState({});

  useEffect(() => {
    fetchFeatureToggles()
      .then(data => setToggles(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(key) {
    const updated = { ...toggles, [key]: !toggles[key] };
    setToggles(updated);
    setSaving(true);
    setError(null);
    try {
      const result = await updateFeatureToggles({ [key]: updated[key] });
      setToggles(result);
    } catch (err) {
      setToggles(toggles); // revert
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-gray-400 text-sm py-8 text-center">Loading…</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-display font-bold text-white">Feature Toggles</h3>
      <p className="text-xs text-gray-400">
        Enable or disable features for your league. Disabled features are hidden from the sidebar and all users.
      </p>
      {error && <div className="lh-alert lh-alert-error">{error}</div>}
      <div className="space-y-2">
        {FEATURE_DEFS.map(f => (
          <label key={f.key} className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg p-4 cursor-pointer hover:border-gray-600 transition-colors">
            <div className="flex-1 mr-4">
              <p className="text-sm font-semibold text-white">{f.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{f.desc}</p>
            </div>
            <div className="relative shrink-0">
              <input
                type="checkbox"
                checked={toggles[f.key] !== false}
                onChange={() => handleToggle(f.key)}
                disabled={saving}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:ring-2 peer-focus:ring-action-500/50 rounded-full
                peer-checked:bg-action-600 transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
                peer-checked:translate-x-5" />
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function SchedulingConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    game_start_time: '08:00',
    game_end_time: '20:00',
    game_time_increment_minutes: 30,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScheduleSettings();
      setForm({
        game_start_time: data?.game_start_time || '08:00',
        game_end_time: data?.game_end_time || '20:00',
        game_time_increment_minutes: Number(data?.game_time_increment_minutes) || 30,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updateScheduleSettings({
        game_start_time: form.game_start_time,
        game_end_time: form.game_end_time,
        game_time_increment_minutes: Number(form.game_time_increment_minutes),
      });
      setForm({
        game_start_time: updated?.game_start_time || form.game_start_time,
        game_end_time: updated?.game_end_time || form.game_end_time,
        game_time_increment_minutes: Number(updated?.game_time_increment_minutes) || Number(form.game_time_increment_minutes),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading scheduling settings…</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-base font-display font-bold text-white">Game Time Window</h3>
      <p className="text-xs text-gray-400">
        Controls available game start times in schedule forms.
      </p>

      {error && <div className="lh-alert lh-alert-error">{error}</div>}

      <form onSubmit={handleSave} className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="lh-eyebrow block mb-1">Start Time</label>
            <input
              type="time"
              value={form.game_start_time}
              onChange={(e) => setForm((prev) => ({ ...prev, game_start_time: e.target.value }))}
              className="lh-input"
              required
            />
          </div>
          <div>
            <label className="lh-eyebrow block mb-1">End Time</label>
            <input
              type="time"
              value={form.game_end_time}
              onChange={(e) => setForm((prev) => ({ ...prev, game_end_time: e.target.value }))}
              className="lh-input"
              required
            />
          </div>
          <div>
            <label className="lh-eyebrow block mb-1">Increment</label>
            <select
              value={form.game_time_increment_minutes}
              onChange={(e) => setForm((prev) => ({ ...prev, game_time_increment_minutes: Number(e.target.value) }))}
              className="lh-select"
            >
              {[5, 10, 15, 20, 30, 45, 60].map((n) => (
                <option key={n} value={n}>{n} min</option>
              ))}
            </select>
          </div>
        </div>

        <Button type="submit" disabled={saving} loading={saving}>
          {saving ? 'Saving…' : 'Save Scheduling'}
        </Button>
      </form>
    </div>
  );
}

// ── Season Management ──

function SeasonList() {
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSeason, setEditingSeason] = useState(null);
  const [form, setForm] = useState({ year: new Date().getFullYear(), name: '', is_active: false });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setSeasons(await fetchSeasons()); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditingSeason(null);
    setForm({ year: new Date().getFullYear(), name: '', is_active: false });
    setShowForm(true);
  }

  function openEdit(s) {
    setEditingSeason(s);
    setForm({ year: s.year, name: s.name, is_active: s.is_active });
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.year) return;
    setSaving(true); setError(null);
    try {
      if (editingSeason) {
        await updateSeason(editingSeason.id, form);
      } else {
        await createSeason(form);
      }
      setShowForm(false);
      setEditingSeason(null);
      await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(s) {
    if (!window.confirm(`Delete "${s.name}"? This will also delete all divisions in this season.`)) return;
    setDeletingId(s.id); setError(null);
    try { await deleteSeason(s.id); await load(); }
    catch (err) { setError(err.message); }
    finally { setDeletingId(null); }
  }

  async function handleSetActive(s) {
    setError(null);
    try {
      await updateSeason(s.id, { ...s, is_active: true });
      await load();
    } catch (err) { setError(err.message); }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading seasons…</div>;

  return (
    <div>
      <h3 className="text-base font-display font-bold text-white mb-3">Seasons ({seasons.length})</h3>
      <p className="text-xs text-gray-400 mb-3">
        Manage league seasons. The active season is used as the default when assigning divisions. Deleting a season removes all its divisions.
      </p>

      {error && <div className="lh-alert lh-alert-error mb-3">{error}</div>}

      {showForm ? (
        <form onSubmit={handleSave} className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lh-eyebrow block mb-1">Year *</label>
              <input type="number" value={form.year} onChange={(e) => setForm(prev => ({ ...prev, year: Number(e.target.value) }))}
                required min="2000" max="2100" className="lh-input" />
            </div>
            <div>
              <label className="lh-eyebrow block mb-1">Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                required placeholder="e.g. Spring 2026" className="lh-input" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
              className="rounded border-gray-600" />
            Set as active season
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !form.name.trim()} loading={saving}>
              {saving ? '…' : editingSeason ? 'Update' : 'Add Season'}
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button className="mb-4" onClick={openAdd}>+ Add Season</Button>
      )}

      {seasons.length === 0 ? (
        <div className="py-8 text-center text-gray-400">No seasons configured yet.</div>
      ) : (
        <div className="space-y-2">
          {seasons.map(s => (
            <div key={s.id} className={`bg-gray-800 border rounded-lg p-3 flex items-center gap-3 ${s.is_active ? 'border-action-400 bg-action-900/30' : 'border-gray-700'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{s.name}</span>
                  <span className="text-xs text-gray-400">({s.year})</span>
                  {s.is_active && <span className="text-xs font-semibold text-action-300 bg-action-900/35 px-1.5 py-0.5 rounded">Active</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {!s.is_active && (
                  <Button size="xs" onClick={() => handleSetActive(s)}>Set Active</Button>
                )}
                <Button size="xs" variant="secondary" onClick={() => openEdit(s)}>Edit</Button>
                <Button size="xs" variant="danger" onClick={() => handleDelete(s)} disabled={deletingId === s.id}>
                  {deletingId === s.id ? '…' : 'Del'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Age Group Config with Umpire Rate ──
function AgeGroupConfig() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [newRate, setNewRate] = useState('50');
  const [newLeagueFee, setNewLeagueFee] = useState('');
  const [newUmpRequired, setNewUmpRequired] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editOrder, setEditOrder] = useState(0);
  const [editRate, setEditRate] = useState('50');
  const [editLeagueFee, setEditLeagueFee] = useState('');
  const [editUmpRequired, setEditUmpRequired] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await fetchAgeGroups()); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true); setError(null);
    try {
      await createAgeGroup({ name: newName.trim(), sort_order: items.length, umpire_rate: newUmpRequired ? (Number(newRate) || 50) : 0, ump_required: newUmpRequired, league_fee: newLeagueFee !== '' ? Number(newLeagueFee) : null });
      setNewName('');
      setNewRate('50');
      setNewLeagueFee('');
      setNewUmpRequired(true);
      await load();
    } catch (err) { setError(err.message); }
    finally { setAdding(false); }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditOrder(item.sort_order ?? 0);
    setEditRate(String(item.umpire_rate ?? 50));
    setEditLeagueFee(item.league_fee != null ? String(item.league_fee) : '');
    setEditUmpRequired(item.ump_required !== false);
  }

  async function handleSaveEdit() {
    if (!editName.trim()) return;
    setSavingEdit(true); setError(null);
    try {
      await updateAgeGroup(editingId, { name: editName.trim(), sort_order: editOrder, umpire_rate: editUmpRequired ? (Number(editRate) || 50) : 0, ump_required: editUmpRequired, league_fee: editLeagueFee !== '' ? Number(editLeagueFee) : null });
      setEditingId(null);
      await load();
    } catch (err) { setError(err.message); }
    finally { setSavingEdit(false); }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    setDeletingId(item.id); setError(null);
    try { await deleteAgeGroup(item.id); await load(); }
    catch (err) { setError(err.message); }
    finally { setDeletingId(null); }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading age groups…</div>;

  return (
    <div>
      <h3 className="text-base font-display font-bold text-white mb-3">Age Groups ({items.length})</h3>

      {error && <div className="lh-alert lh-alert-error mb-3">{error}</div>}

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="e.g. 8U, 10U, 12U, 14U" className="flex-1 min-w-[120px] lh-input"
        />
        {newUmpRequired && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">Ump $</span>
            <input
              type="number" min="0" step="0.01" value={newRate} onChange={(e) => setNewRate(e.target.value)}
              placeholder="50" className="w-20 lh-input" title="Umpire rate per game"
            />
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">Fee $</span>
          <input
            type="number" min="0" step="0.01" value={newLeagueFee} onChange={(e) => setNewLeagueFee(e.target.value)}
            placeholder="—" className="w-20 lh-input" title="League registration fee"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={newUmpRequired} onChange={(e) => setNewUmpRequired(e.target.checked)}
            className="rounded border-gray-600" />
          Ump Required
        </label>
        <Button type="submit" disabled={adding || !newName.trim()} loading={adding}>
          {adding ? '…' : '+ Add'}
        </Button>
      </form>

      {items.length === 0 ? (
        <div className="py-8 text-center text-gray-400">No age groups configured yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center gap-3">
              {editingId === item.id ? (
                <div className="flex-1 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 lh-input" autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); } }}
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 whitespace-nowrap">Order:</label>
                    <input
                      type="number" value={editOrder} onChange={(e) => setEditOrder(Number(e.target.value))}
                      className="w-20 lh-input"
                    />
                  </div>
                  {editUmpRequired && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-400 whitespace-nowrap">Ump $:</label>
                      <input
                        type="number" min="0" step="0.01" value={editRate} onChange={(e) => setEditRate(e.target.value)}
                        className="w-24 lh-input"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 whitespace-nowrap">Fee $:</label>
                    <input
                      type="number" min="0" step="0.01" value={editLeagueFee} onChange={(e) => setEditLeagueFee(e.target.value)}
                      placeholder="—" className="w-24 lh-input"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={editUmpRequired} onChange={(e) => setEditUmpRequired(e.target.checked)}
                      className="rounded border-gray-600" />
                    Ump Required
                  </label>
                  <div className="flex gap-1">
                    <Button size="xs" onClick={handleSaveEdit} disabled={savingEdit} loading={savingEdit}>
                      {savingEdit ? '…' : 'Save'}
                    </Button>
                    <Button size="xs" variant="secondary" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="font-semibold text-sm">{item.name}</span>
                    <span className="text-xs text-gray-400">#{item.sort_order ?? 0}</span>
                    {item.ump_required !== false && (
                      <Badge variant="success">
                        Ump ${Number(item.umpire_rate ?? 50).toFixed(2)}/game
                      </Badge>
                    )}
                    {item.league_fee != null && (
                      <Badge variant="warning">
                        Fee ${Number(item.league_fee).toFixed(2)}
                      </Badge>
                    )}
                    {item.ump_required === false ? (
                      <Badge variant="neutral">No Ump</Badge>
                    ) : (
                      <Badge variant="success">Ump Required</Badge>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="xs" variant="secondary" onClick={() => startEdit(item)}>Edit</Button>
                    <Button size="xs" variant="danger" onClick={() => handleDelete(item)} disabled={deletingId === item.id}>
                      {deletingId === item.id ? '…' : 'Del'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigList({ title, placeholder, fetchItems, createItem, updateItem, deleteItem }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editOrder, setEditOrder] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await fetchItems()); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [fetchItems]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true); setError(null);
    try {
      await createItem({ name: newName.trim(), sort_order: items.length });
      setNewName('');
      await load();
    } catch (err) { setError(err.message); }
    finally { setAdding(false); }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditOrder(item.sort_order ?? 0);
  }

  async function handleSaveEdit() {
    if (!editName.trim()) return;
    setSavingEdit(true); setError(null);
    try {
      await updateItem(editingId, { name: editName.trim(), sort_order: editOrder });
      setEditingId(null);
      await load();
    } catch (err) { setError(err.message); }
    finally { setSavingEdit(false); }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    setDeletingId(item.id); setError(null);
    try { await deleteItem(item.id); await load(); }
    catch (err) { setError(err.message); }
    finally { setDeletingId(null); }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading {title.toLowerCase()}…</div>;

  return (
    <div>
      <h3 className="text-base font-display font-bold text-white mb-3">{title} ({items.length})</h3>

      {error && <div className="lh-alert lh-alert-error mb-3">{error}</div>}

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <input
          type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder={placeholder} className="flex-1 lh-input"
        />
        <Button type="submit" disabled={adding || !newName.trim()} loading={adding}>
          {adding ? '…' : '+ Add'}
        </Button>
      </form>

      {items.length === 0 ? (
        <div className="py-8 text-center text-gray-400">No {title.toLowerCase()} configured yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center gap-3">
              {editingId === item.id ? (
                <div className="flex-1 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 lh-input" autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); } }}
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 whitespace-nowrap">Order:</label>
                    <input
                      type="number" value={editOrder} onChange={(e) => setEditOrder(Number(e.target.value))}
                      className="w-20 lh-input"
                    />
                  </div>
                  <div className="flex gap-1">
                    <Button size="xs" onClick={handleSaveEdit} disabled={savingEdit} loading={savingEdit}>
                      {savingEdit ? '…' : 'Save'}
                    </Button>
                    <Button size="xs" variant="secondary" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1">
                    <span className="font-semibold text-sm">{item.name}</span>
                    <span className="text-xs text-gray-400 ml-2">#{item.sort_order ?? 0}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="xs" variant="secondary" onClick={() => startEdit(item)}>Edit</Button>
                    <Button size="xs" variant="danger" onClick={() => handleDelete(item)} disabled={deletingId === item.id}>
                      {deletingId === item.id ? '…' : 'Del'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hierarchical Division Tree ──

function DivisionTree() {
  const [divisions, setDivisions] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addingTo, setAddingTo] = useState(null); // null = root, or parent_id
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editOrder, setEditOrder] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Load seasons first, then divisions for the selected season
  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const ss = await fetchSeasons();
        setSeasons(ss);
        const active = ss.find(s => s.is_active);
        const sid = active ? active.id : (ss.length > 0 ? ss[0].id : null);
        setSelectedSeasonId(sid);
        if (sid) {
          setDivisions(await fetchDivisions(sid));
        } else {
          setDivisions([]);
        }
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const loadDivisions = useCallback(async (seasonId) => {
    setError(null);
    try {
      setDivisions(seasonId ? await fetchDivisions(seasonId) : []);
    } catch (err) { setError(err.message); }
  }, []);

  function handleSeasonChange(e) {
    const sid = e.target.value ? Number(e.target.value) : null;
    setSelectedSeasonId(sid);
    loadDivisions(sid);
  }

  // Build tree structure from flat list
  function buildTree(items, parentId = null) {
    return items
      .filter(i => (i.parent_id || null) === parentId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      .map(item => ({ ...item, children: buildTree(items, item.id) }));
  }

  async function handleAdd(parentId) {
    if (!newName.trim() || !selectedSeasonId) return;
    setAdding(true); setError(null);
    try {
      const siblings = divisions.filter(d => (d.parent_id || null) === parentId);
      await createDivision({ name: newName.trim(), sort_order: siblings.length, parent_id: parentId, season_id: selectedSeasonId });
      setNewName('');
      setAddingTo(null);
      await loadDivisions(selectedSeasonId);
    } catch (err) { setError(err.message); }
    finally { setAdding(false); }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditOrder(item.sort_order ?? 0);
  }

  async function handleSaveEdit(parentId) {
    if (!editName.trim()) return;
    setSavingEdit(true); setError(null);
    try {
      await updateDivision(editingId, { name: editName.trim(), sort_order: editOrder, parent_id: parentId, season_id: selectedSeasonId });
      setEditingId(null);
      await loadDivisions(selectedSeasonId);
    } catch (err) { setError(err.message); }
    finally { setSavingEdit(false); }
  }

  async function handleDelete(item) {
    const childCount = divisions.filter(d => d.parent_id === item.id).length;
    const msg = childCount > 0
      ? `Delete "${item.name}" and its ${childCount} sub-division(s)?`
      : `Delete "${item.name}"?`;
    if (!window.confirm(msg)) return;
    setDeletingId(item.id); setError(null);
    try { await deleteDivision(item.id); await loadDivisions(selectedSeasonId); }
    catch (err) { setError(err.message); }
    finally { setDeletingId(null); }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading divisions…</div>;

  const tree = buildTree(divisions);
  const totalCount = divisions.length;

  return (
    <div>
      <h3 className="text-base font-display font-bold text-white mb-3">Divisions ({totalCount})</h3>

      {/* Season selector */}
      <div className="mb-4">
        <label className="lh-eyebrow block mb-1">Season</label>
        {seasons.length > 0 ? (
          <select value={selectedSeasonId || ''} onChange={handleSeasonChange} className="lh-select max-w-xs">
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            No seasons configured. Go to the Seasons tab to add one first.
          </p>
        )}
      </div>

      {!selectedSeasonId ? (
        <div className="py-8 text-center text-gray-400">Select a season to manage divisions.</div>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-3">
            Create a hierarchy: League → Division → Sub-division → etc. Use "+ Sub" to nest divisions.
          </p>

      {error && <div className="lh-alert lh-alert-error mb-3">{error}</div>}

      {/* Add root division */}
      {addingTo === 'root' ? (
        <div className="flex gap-2 mb-4">
          <input
            type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. North Conference" className="flex-1 lh-input" autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(null); } if (e.key === 'Escape') { setAddingTo(null); setNewName(''); } }}
          />
          <Button onClick={() => handleAdd(null)} disabled={adding || !newName.trim()} loading={adding}>
            {adding ? '…' : 'Add'}
          </Button>
          <Button variant="secondary" onClick={() => { setAddingTo(null); setNewName(''); }}>Cancel</Button>
        </div>
      ) : (
        <Button className="mb-4" onClick={() => { setAddingTo('root'); setNewName(''); }}>
          + Add Top-Level Division
        </Button>
      )}

      {tree.length === 0 ? (
        <div className="py-8 text-center text-gray-400">No divisions configured yet.</div>
      ) : (
        <div className="space-y-1">
          {tree.map(node => (
            <DivisionNode
              key={node.id} node={node} depth={0}
              addingTo={addingTo} setAddingTo={setAddingTo}
              newName={newName} setNewName={setNewName}
              adding={adding} handleAdd={handleAdd}
              editingId={editingId} editName={editName} editOrder={editOrder}
              setEditName={setEditName} setEditOrder={setEditOrder}
              startEdit={startEdit} handleSaveEdit={handleSaveEdit} savingEdit={savingEdit}
              cancelEdit={() => setEditingId(null)}
              handleDelete={handleDelete} deletingId={deletingId}
            />
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}

function DivisionNode({
  node, depth,
  addingTo, setAddingTo, newName, setNewName, adding, handleAdd,
  editingId, editName, editOrder, setEditName, setEditOrder,
  startEdit, handleSaveEdit, savingEdit, cancelEdit,
  handleDelete, deletingId,
}) {
  const indent = depth * 24;
  const depthLabels = ['League', 'Division', 'Sub-division', 'Sub-sub'];
  const depthLabel = depthLabels[Math.min(depth, depthLabels.length - 1)];
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center gap-2"
        style={{ marginLeft: indent }}
      >
        {editingId === node.id ? (
          <div className="flex-1 flex flex-col sm:flex-row gap-2">
            <input
              type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
              className="flex-1 lh-input" autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(node.parent_id); } }}
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 whitespace-nowrap">Order:</label>
              <input
                type="number" value={editOrder} onChange={(e) => setEditOrder(Number(e.target.value))}
                className="w-20 lh-input"
              />
            </div>
            <div className="flex gap-1">
              <Button size="xs" onClick={() => handleSaveEdit(node.parent_id)} disabled={savingEdit} loading={savingEdit}>
                {savingEdit ? '…' : 'Save'}
              </Button>
              <Button size="xs" variant="secondary" onClick={() => { cancelEdit(); setEditName(''); setEditOrder(0); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {hasChildren && <span className="text-gray-400 text-xs">▼</span>}
                <span className="font-semibold text-sm truncate">{node.name}</span>
                <span className="text-xs text-gray-400">#{node.sort_order ?? 0}</span>
              </div>
              <span className="text-xs text-gray-400">{depthLabel}</span>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="xs" variant="chrome" onClick={() => { setAddingTo(node.id); setNewName(''); }} title="Add sub-division">
                + Sub
              </Button>
              <Button size="xs" variant="secondary" onClick={() => startEdit(node)}>Edit</Button>
              <Button size="xs" variant="danger" onClick={() => handleDelete(node)} disabled={deletingId === node.id}>
                {deletingId === node.id ? '…' : 'Del'}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Inline add-child form */}
      {addingTo === node.id && (
        <div className="flex gap-2 mt-1 mb-1" style={{ marginLeft: indent + 24 }}>
          <input
            type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder={`New sub-division under "${node.name}"`}
            className="flex-1 lh-input" autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(node.id); } if (e.key === 'Escape') { setAddingTo(null); setNewName(''); } }}
          />
          <Button size="xs" onClick={() => handleAdd(node.id)} disabled={adding || !newName.trim()} loading={adding}>
            {adding ? '…' : 'Add'}
          </Button>
          <Button size="xs" variant="secondary" onClick={() => { setAddingTo(null); setNewName(''); }}>Cancel</Button>
        </div>
      )}

      {/* Children */}
      {hasChildren && (
        <div className="space-y-1 mt-1">
          {node.children.map(child => (
            <DivisionNode
              key={child.id} node={child} depth={depth + 1}
              addingTo={addingTo} setAddingTo={setAddingTo}
              newName={newName} setNewName={setNewName}
              adding={adding} handleAdd={handleAdd}
              editingId={editingId} editName={editName} editOrder={editOrder}
              setEditName={setEditName} setEditOrder={setEditOrder}
              startEdit={startEdit} handleSaveEdit={handleSaveEdit} savingEdit={savingEdit}
              cancelEdit={cancelEdit}
              handleDelete={handleDelete} deletingId={deletingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Stat Definitions Config ── */
function StatDefinitionsConfig() {
  const [defs, setDefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', abbreviation: '', category: 'batting', data_type: 'integer', sort_order: 0, gc_column_name: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetchStatDefinitions().then(setDefs).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  function startEdit(d) {
    setEditing(d);
    setForm({ name: d.name, abbreviation: d.abbreviation, category: d.category, data_type: d.data_type, sort_order: d.sort_order, gc_column_name: d.gc_column_name || '' });
    setShowForm(true);
  }

  function startNew() {
    setEditing(null);
    setForm({ name: '', abbreviation: '', category: 'batting', data_type: 'integer', sort_order: 0, gc_column_name: '' });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await updateStatDefinition(editing.id, form);
      } else {
        await createStatDefinition(form);
      }
      setShowForm(false);
      setEditing(null);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this stat definition? All recorded values will be lost.')) return;
    try {
      await deleteStatDefinition(id);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleToggleActive(d) {
    try {
      await updateStatDefinition(d.id, { is_active: !d.is_active });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <p className="text-gray-400 py-4">Loading...</p>;

  const categories = ['batting', 'pitching', 'fielding', 'other'];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-white">Stat Definitions</h3>
          <p className="text-sm text-gray-400">Configure which stats can be tracked per player per game. Set a GC Column Name to auto-map from GameChanger imports.</p>
        </div>
        <Button onClick={startNew}>+ Add Stat</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="lh-eyebrow block mb-1">Name</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="lh-input" placeholder="e.g. Hits" />
            </div>
            <div>
              <label className="lh-eyebrow block mb-1">Abbreviation</label>
              <input required value={form.abbreviation} onChange={e => setForm(f => ({ ...f, abbreviation: e.target.value }))} className="lh-input" placeholder="e.g. H" />
            </div>
            <div>
              <label className="lh-eyebrow block mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="lh-select">
                {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="lh-eyebrow block mb-1">Data Type</label>
              <select value={form.data_type} onChange={e => setForm(f => ({ ...f, data_type: e.target.value }))} className="lh-select">
                <option value="integer">Integer</option>
                <option value="decimal">Decimal</option>
                <option value="text">Text</option>
              </select>
            </div>
            <div>
              <label className="lh-eyebrow block mb-1">Sort Order</label>
              <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} className="lh-input" />
            </div>
            <div>
              <label className="lh-eyebrow block mb-1">GC Column Name</label>
              <input value={form.gc_column_name} onChange={e => setForm(f => ({ ...f, gc_column_name: e.target.value }))} className="lh-input" placeholder="e.g. H, AB, RBI" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
            <Button type="submit" disabled={saving} loading={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      )}

      {categories.map(cat => {
        const items = defs.filter(d => d.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat}>
            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">{cat}</h4>
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl divide-y divide-gray-700/50">
              {items.map(d => (
                <div key={d.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${d.is_active ? 'text-white' : 'text-gray-500 line-through'}`}>{d.name}</span>
                    <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">{d.abbreviation}</span>
                    {d.gc_column_name && <span className="text-xs text-action-400">GC: {d.gc_column_name}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleToggleActive(d)} className={`text-xs px-2 py-1 rounded ${d.is_active ? 'text-yellow-400 hover:bg-yellow-500/10' : 'text-action-400 hover:bg-action-500/10'}`}>
                      {d.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => startEdit(d)} className="text-xs text-chrome-400 hover:text-chrome-300 px-2 py-1">Edit</button>
                    <button onClick={() => handleDelete(d.id)} className="text-xs text-signal-400 hover:text-signal-300 px-2 py-1">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!defs.length && !showForm && (
        <p className="text-sm text-gray-500 py-4 text-center">No stat definitions yet. Click "Add Stat" to create one.</p>
      )}
    </div>
  );
}
