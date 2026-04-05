import { useState, useEffect, useCallback } from 'react';
import {
  fetchAgeGroups, createAgeGroup, updateAgeGroup, deleteAgeGroup,
  fetchLevels, createLevel, updateLevel, deleteLevel,
  fetchDivisions, createDivision, updateDivision, deleteDivision,
} from '../api/index.js';

const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600";
const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1";
const btnPrimary = "px-4 py-2 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 transition-colors disabled:opacity-60";
const btnSecondary = "px-4 py-2 bg-gray-200 text-gray-800 text-sm font-semibold rounded-lg hover:bg-gray-300 transition-colors";

export default function LeagueConfig({ onBack }) {
  const [tab, setTab] = useState('age_groups');

  const tabCls = (t) => `px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
    tab === t ? 'bg-blue-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
  }`;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold">League Configuration</h2>
        {onBack && <button onClick={onBack} className={btnSecondary}>← Back</button>}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Configure age groups, levels, and divisions for the league. These populate dropdowns when creating or editing teams.
      </p>
      <div className="flex gap-2 mb-5">
        <button className={tabCls('age_groups')} onClick={() => setTab('age_groups')}>Age Groups</button>
        <button className={tabCls('levels')} onClick={() => setTab('levels')}>Levels</button>
        <button className={tabCls('divisions')} onClick={() => setTab('divisions')}>Divisions</button>
      </div>
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

  if (loading) return <div className="py-8 text-center text-gray-500">Loading {title.toLowerCase()}…</div>;

  return (
    <div>
      <h3 className="text-base font-bold mb-3">{title} ({items.length})</h3>

      {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-3">{error}</div>}

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
        <div className="py-8 text-center text-gray-500">No {title.toLowerCase()} configured yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
              {editingId === item.id ? (
                <div className="flex-1 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                    className={`flex-1 ${inputCls}`} autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(); } }}
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 whitespace-nowrap">Order:</label>
                    <input
                      type="number" value={editOrder} onChange={(e) => setEditOrder(Number(e.target.value))}
                      className={`w-20 ${inputCls}`}
                    />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={handleSaveEdit} disabled={savingEdit}
                      className="px-3 py-1.5 text-xs font-semibold bg-blue-800 text-white rounded hover:bg-blue-900 disabled:opacity-60">
                      {savingEdit ? '…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-xs font-semibold bg-gray-200 text-gray-800 rounded hover:bg-gray-300">
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
                      className="px-2.5 py-1 text-xs font-semibold bg-gray-200 text-gray-800 rounded hover:bg-gray-300">
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

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setDivisions(await fetchDivisions()); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build tree structure from flat list
  function buildTree(items, parentId = null) {
    return items
      .filter(i => (i.parent_id || null) === parentId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      .map(item => ({ ...item, children: buildTree(items, item.id) }));
  }

  async function handleAdd(parentId) {
    if (!newName.trim()) return;
    setAdding(true); setError(null);
    try {
      const siblings = divisions.filter(d => (d.parent_id || null) === parentId);
      await createDivision({ name: newName.trim(), sort_order: siblings.length, parent_id: parentId });
      setNewName('');
      setAddingTo(null);
      await load();
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
      await updateDivision(editingId, { name: editName.trim(), sort_order: editOrder, parent_id: parentId });
      setEditingId(null);
      await load();
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
    try { await deleteDivision(item.id); await load(); }
    catch (err) { setError(err.message); }
    finally { setDeletingId(null); }
  }

  if (loading) return <div className="py-8 text-center text-gray-500">Loading divisions…</div>;

  const tree = buildTree(divisions);
  const totalCount = divisions.length;

  return (
    <div>
      <h3 className="text-base font-bold mb-3">Divisions ({totalCount})</h3>
      <p className="text-xs text-gray-500 mb-3">
        Create a hierarchy: League → Division → Sub-division → etc. Use "+ Sub" to nest divisions.
      </p>

      {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-3">{error}</div>}

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
        <div className="py-8 text-center text-gray-500">No divisions configured yet.</div>
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
        className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-2"
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
              <label className="text-xs text-gray-500 whitespace-nowrap">Order:</label>
              <input
                type="number" value={editOrder} onChange={(e) => setEditOrder(Number(e.target.value))}
                className={`w-20 ${inputCls}`}
              />
            </div>
            <div className="flex gap-1">
              <button onClick={() => handleSaveEdit(node.parent_id)} disabled={savingEdit}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-800 text-white rounded hover:bg-blue-900 disabled:opacity-60">
                {savingEdit ? '…' : 'Save'}
              </button>
              <button onClick={() => { cancelEdit(); setEditName(''); setEditOrder(0); }}
                className="px-3 py-1.5 text-xs font-semibold bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
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
                className="px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded hover:bg-blue-200">
                + Sub
              </button>
              <button onClick={() => startEdit(node)}
                className="px-2 py-1 text-xs font-semibold bg-gray-200 text-gray-800 rounded hover:bg-gray-300">
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
