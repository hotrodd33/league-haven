import { useState, useEffect, useCallback } from 'react';
import {
  fetchAgeGroups, createAgeGroup, updateAgeGroup, deleteAgeGroup,
  fetchLevels, createLevel, updateLevel, deleteLevel,
  fetchDivisions, createDivision, updateDivision, deleteDivision,
  fetchSeasons, createSeason, updateSeason, deleteSeason,
  fetchBranding, updateBranding, uploadBrandingLogo, deleteBrandingLogo,
} from '../api/index.js';

const inputCls = "w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1";
const btnPrimary = "px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60";
const btnSecondary = "px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600 transition-colors";

export default function LeagueConfig({ onBack }) {
  const [tab, setTab] = useState('age_groups');

  const tabCls = (t) => `px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
    tab === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
  }`;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold">League Configuration</h2>
        {onBack && <button onClick={onBack} className={btnSecondary}>← Back</button>}
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Configure age groups, levels, and divisions for the league. These populate dropdowns when creating or editing teams.
      </p>
      <div className="flex gap-2 mb-5 flex-wrap">
        <button className={tabCls('branding')} onClick={() => setTab('branding')}>Branding</button>
        <button className={tabCls('seasons')} onClick={() => setTab('seasons')}>Seasons</button>
        <button className={tabCls('age_groups')} onClick={() => setTab('age_groups')}>Age Groups</button>
        <button className={tabCls('levels')} onClick={() => setTab('levels')}>Levels</button>
        <button className={tabCls('divisions')} onClick={() => setTab('divisions')}>Divisions</button>
      </div>
      {tab === 'branding' && <BrandingConfig />}
      {tab === 'seasons' && <SeasonList />}
      {tab === 'age_groups' && (
        <ConfigList
          title="Age Groups" placeholder="e.g. 8U, 10U, 12U, 14U"
          fetchItems={fetchAgeGroups} createItem={createAgeGroup}
          updateItem={updateAgeGroup} deleteItem={deleteAgeGroup}
        />
      )}
      {tab === 'levels' && (
        <ConfigList
          title="Levels" placeholder="e.g. Recreational, Competitive, Elite"
          fetchItems={fetchLevels} createItem={createLevel}
          updateItem={updateLevel} deleteItem={deleteLevel}
        />
      )}
      {tab === 'divisions' && <DivisionTree />}
    </div>
  );
}

function BrandingConfig() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingName, setSavingName] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [form, setForm] = useState({ app_name: 'ZVBL', logo_url: null });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBranding();
      setForm({
        app_name: data?.app_name || 'ZVBL',
        logo_url: data?.logo_url || null,
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
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingName(false);
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
      <h3 className="text-base font-bold">App Branding</h3>
      <p className="text-xs text-gray-400">
        Set the app name and logo shown in the main sidebar header.
      </p>

      {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}

      <form onSubmit={handleSaveName} className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
        <div>
          <label className={labelCls}>Application Name</label>
          <input
            type="text"
            maxLength={48}
            value={form.app_name}
            onChange={(e) => setForm((prev) => ({ ...prev, app_name: e.target.value }))}
            className={inputCls}
            placeholder="League app name"
          />
        </div>
        <button type="submit" disabled={savingName || !(form.app_name || '').trim()} className={btnPrimary}>
          {savingName ? 'Saving…' : 'Save Name'}
        </button>
      </form>

      <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
        <label className={labelCls}>Application Logo</label>
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
          <label className={`${btnPrimary} cursor-pointer ${uploadingLogo ? 'opacity-60 pointer-events-none' : ''}`}>
            {uploadingLogo ? 'Uploading…' : 'Upload Logo'}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          </label>
          <button
            type="button"
            onClick={handleRemoveLogo}
            disabled={!form.logo_url || removingLogo}
            className="px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors disabled:opacity-60"
          >
            {removingLogo ? 'Removing…' : 'Remove Logo'}
          </button>
        </div>
      </div>
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
      <h3 className="text-base font-bold mb-3">Seasons ({seasons.length})</h3>
      <p className="text-xs text-gray-400 mb-3">
        Manage league seasons. The active season is used as the default when assigning divisions. Deleting a season removes all its divisions.
      </p>

      {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg mb-3">{error}</div>}

      {showForm ? (
        <form onSubmit={handleSave} className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Year *</label>
              <input type="number" value={form.year} onChange={(e) => setForm(prev => ({ ...prev, year: Number(e.target.value) }))}
                required min="2000" max="2100" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                required placeholder="e.g. Spring 2026" className={inputCls} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
              className="rounded border-gray-600" />
            Set as active season
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !form.name.trim()} className={btnPrimary}>
              {saving ? '…' : editingSeason ? 'Update' : 'Add Season'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className={btnSecondary}>Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={openAdd} className={`${btnPrimary} mb-4`}>+ Add Season</button>
      )}

      {seasons.length === 0 ? (
        <div className="py-8 text-center text-gray-400">No seasons configured yet.</div>
      ) : (
        <div className="space-y-2">
          {seasons.map(s => (
            <div key={s.id} className={`bg-gray-800 border rounded-lg p-3 flex items-center gap-3 ${s.is_active ? 'border-green-400 bg-green-900/30' : 'border-gray-700'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{s.name}</span>
                  <span className="text-xs text-gray-400">({s.year})</span>
                  {s.is_active && <span className="text-xs font-semibold text-green-300 bg-green-900/35 px-1.5 py-0.5 rounded">Active</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {!s.is_active && (
                  <button onClick={() => handleSetActive(s)}
                    className="px-2 py-1 text-xs font-semibold bg-green-900/35 text-green-300 rounded hover:bg-green-800/60">
                    Set Active
                  </button>
                )}
                <button onClick={() => openEdit(s)}
                  className="px-2 py-1 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600">
                  Edit
                </button>
                <button onClick={() => handleDelete(s)} disabled={deletingId === s.id}
                  className="px-2 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60">
                  {deletingId === s.id ? '…' : 'Del'}
                </button>
              </div>
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
      <h3 className="text-base font-bold mb-3">{title} ({items.length})</h3>

      {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg mb-3">{error}</div>}

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <input
          type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder={placeholder} className={`flex-1 ${inputCls}`}
        />
        <button type="submit" disabled={adding || !newName.trim()} className={btnPrimary}>
          {adding ? '…' : '+ Add'}
        </button>
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
                    className={`flex-1 ${inputCls}`} autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); } }}
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-400 whitespace-nowrap">Order:</label>
                    <input
                      type="number" value={editOrder} onChange={(e) => setEditOrder(Number(e.target.value))}
                      className={`w-20 ${inputCls}`}
                    />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={handleSaveEdit} disabled={savingEdit}
                      className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60">
                      {savingEdit ? '…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1">
                    <span className="font-semibold text-sm">{item.name}</span>
                    <span className="text-xs text-gray-400 ml-2">#{item.sort_order ?? 0}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(item)}
                      className="px-2.5 py-1 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(item)} disabled={deletingId === item.id}
                      className="px-2.5 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60">
                      {deletingId === item.id ? '…' : 'Del'}
                    </button>
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
      <h3 className="text-base font-bold mb-3">Divisions ({totalCount})</h3>

      {/* Season selector */}
      <div className="mb-4">
        <label className={labelCls}>Season</label>
        {seasons.length > 0 ? (
          <select value={selectedSeasonId || ''} onChange={handleSeasonChange} className={inputCls + ' max-w-xs'}>
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

      {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg mb-3">{error}</div>}

      {/* Add root division */}
      {addingTo === 'root' ? (
        <div className="flex gap-2 mb-4">
          <input
            type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. North Conference" className={`flex-1 ${inputCls}`} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(null); } if (e.key === 'Escape') { setAddingTo(null); setNewName(''); } }}
          />
          <button onClick={() => handleAdd(null)} disabled={adding || !newName.trim()} className={btnPrimary}>
            {adding ? '…' : 'Add'}
          </button>
          <button onClick={() => { setAddingTo(null); setNewName(''); }} className={btnSecondary}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => { setAddingTo('root'); setNewName(''); }} className={`${btnPrimary} mb-4`}>
          + Add Top-Level Division
        </button>
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
              className={`flex-1 ${inputCls}`} autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(node.parent_id); } }}
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 whitespace-nowrap">Order:</label>
              <input
                type="number" value={editOrder} onChange={(e) => setEditOrder(Number(e.target.value))}
                className={`w-20 ${inputCls}`}
              />
            </div>
            <div className="flex gap-1">
              <button onClick={() => handleSaveEdit(node.parent_id)} disabled={savingEdit}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60">
                {savingEdit ? '…' : 'Save'}
              </button>
              <button onClick={() => { cancelEdit(); setEditName(''); setEditOrder(0); }}
                className="px-3 py-1.5 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
              >Cancel</button>
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
              <button onClick={() => { setAddingTo(node.id); setNewName(''); }}
                title="Add sub-division"
                className="px-2 py-1 text-xs font-semibold bg-blue-900/40 text-blue-200 rounded hover:bg-blue-800/60">
                + Sub
              </button>
              <button onClick={() => startEdit(node)}
                className="px-2 py-1 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600">
                Edit
              </button>
              <button onClick={() => handleDelete(node)} disabled={deletingId === node.id}
                className="px-2 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60">
                {deletingId === node.id ? '…' : 'Del'}
              </button>
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
            className={`flex-1 ${inputCls}`} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(node.id); } if (e.key === 'Escape') { setAddingTo(null); setNewName(''); } }}
          />
          <button onClick={() => handleAdd(node.id)} disabled={adding || !newName.trim()} className={btnPrimary}>
            {adding ? '…' : 'Add'}
          </button>
          <button onClick={() => { setAddingTo(null); setNewName(''); }} className={btnSecondary}>Cancel</button>
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
