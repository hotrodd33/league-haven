import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchUsers, createUser, updateUser, deleteUser, updateUserPermissions,
  fetchOrganizations, fetchTeams, inviteUser,
  fetchPendingApprovals, approveUser, rejectUser, resetUserApproval,
} from '../api/index.js';
import { Button, Input, Select, Modal, Badge } from './ui/index.js';

function SortIcon({ active, dir }) {
  if (!active) return <span className="ml-1 text-gray-600">↕</span>;
  return <span className="ml-1 text-action-400">{dir === 'asc' ? '↑' : '↓'}</span>;
}

function formatLogin(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })
    + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
}

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  accountant: 'Accountant',
  org_admin: 'Org Admin',
  team_manager: 'Team Manager',
  score_reporter: 'Score Reporter',
  umpire: 'Umpire',
};

const ROLE_COLORS = {
  super_admin: 'lh-badge-danger',
  accountant: 'lh-badge-warn',
  org_admin: 'lh-badge-info',
  team_manager: 'lh-badge-success',
  score_reporter: 'lh-badge-neutral',
  umpire: 'lh-badge-info',
};

export default function UserManager({ onBack, initialTab, showUsersTab = true }) {
  const [tab, setTab] = useState(initialTab || (showUsersTab ? 'users' : 'approvals'));
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingPerms, setEditingPerms] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // Sort state
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true); setError(null);
    try { setUsers(await fetchUsers()); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'users' && showUsersTab) loadUsers(); }, [loadUsers, tab, showUsersTab]);

  async function handleDelete(user) {
    if (!window.confirm(`Delete user "${user.username}"? This will also remove any linked staff/coach record. This cannot be undone.`)) return;
    setDeleting(user.id);
    try {
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setSelectedIds(prev => { const next = new Set(prev); next.delete(user.id); return next; });
    } catch (err) { alert(`Failed to delete: ${err.message}`); }
    finally { setDeleting(null); }
  }

  const [inviting, setInviting] = useState(null);
  async function handleInvite(user) {
    if (!user.email) { alert('User has no email address. Edit the user to add one first.'); return; }
    setInviting(user.id);
    try {
      const result = await inviteUser(user.id);
      alert(result.message || `Invite sent to ${user.email}`);
    } catch (err) { alert(`Failed to send invite: ${err.message}`); }
    finally { setInviting(null); }
  }

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sortedUsers = useMemo(() => {
    const getValue = (u) => {
      if (sortKey === 'name') return (u.name || '').toLowerCase();
      if (sortKey === 'username') return (u.username || '').toLowerCase();
      if (sortKey === 'email') return (u.email || '').toLowerCase();
      if (sortKey === 'role') return u.role || '';
      if (sortKey === 'last_login') return u.last_login_at || '';
      if (sortKey === 'permissions') return (u.permissions?.org_ids?.length || 0) + (u.permissions?.team_ids?.length || 0);
      return '';
    };
    return [...users].sort((a, b) => {
      const av = getValue(a), bv = getValue(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [users, sortKey, sortDir]);

  const selectableIds = useMemo(() => sortedUsers.filter(u => u.role !== 'super_admin').map(u => u.id), [sortedUsers]);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));

  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(selectableIds));
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const count = selectedIds.size;
    if (!window.confirm(`Delete ${count} selected user${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all([...selectedIds].map(id => deleteUser(id)));
      setUsers(prev => prev.filter(u => !selectedIds.has(u.id)));
      setSelectedIds(new Set());
    } catch (err) { alert(`Bulk delete failed: ${err.message}`); }
    finally { setBulkDeleting(false); }
  }

  if (editingPerms) {
    return <PermissionsEditor user={editingPerms} onBack={() => { setEditingPerms(null); loadUsers(); }} />;
  }

  const tabs = [];
  if (showUsersTab) tabs.push({ key: 'users', label: 'Users' });
  tabs.push({ key: 'approvals', label: 'Approvals' });

  return (
    <div>
      {/* Tab bar + header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-4">
          {tabs.length > 1 && (
            <div className="flex border border-gray-700 rounded-lg overflow-hidden">
              {tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`lh-tab ${
                    tab === t.key ? 'lh-tab-active' : 'lh-tab-inactive'
                  }`}>{t.label}</button>
              ))}
            </div>
          )}
          {tab === 'users' && <h2 className="text-xl font-display font-bold text-white">User Accounts ({users.length})</h2>}
          {tab === 'approvals' && <h2 className="text-xl font-display font-bold text-white">Approvals</h2>}
        </div>
        <div className="flex gap-2">
          {tab === 'users' && selectedIds.size > 0 && (
            <Button variant="danger" onClick={handleBulkDelete} disabled={bulkDeleting} loading={bulkDeleting}>
              {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size} selected`}
            </Button>
          )}
          {tab === 'users' && <Button onClick={() => { setEditing(null); setShowForm(true); }}>+ Add User</Button>}
          {onBack && <Button variant="secondary" onClick={onBack}>← Back</Button>}
        </div>
      </div>

      {/* Approvals tab */}
      {tab === 'approvals' && <PendingApprovals />}

      {/* Users tab */}
      {tab === 'users' && (<>
      {loading && <div className="py-8 text-center text-gray-400">Loading users…</div>}
      {error && <div className="lh-alert lh-alert-error">Error: {error}</div>}
      {!loading && !error && (<>

      {users.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          No user accounts.
          <br />
          <button onClick={() => setShowForm(true)} className="text-action-300 underline mt-1 inline-block">Add the first user</button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full bg-gray-800 rounded-lg shadow-sm overflow-hidden text-sm text-gray-200">
              <thead>
                <tr className="bg-gray-800 border-b-2 border-gray-700">
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                      className="w-4 h-4 rounded bg-gray-700 border-gray-500 accent-teal-500 cursor-pointer" />
                  </th>
                  {[
                    { key: 'username', label: 'Username' },
                    { key: 'name', label: 'Name' },
                    { key: 'email', label: 'Email' },
                    { key: 'role', label: 'Role' },
                    { key: 'last_login', label: 'Last Login' },
                    { key: 'permissions', label: 'Permissions' },
                  ].map(col => (
                    <th key={col.key} className="px-3 py-2 text-left eyebrow cursor-pointer select-none hover:text-gray-100"
                      onClick={() => handleSort(col.key)}>
                      {col.label}<SortIcon active={sortKey === col.key} dir={sortDir} />
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left eyebrow">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {sortedUsers.map((u) => (
                  <tr key={u.id} className={`hover:bg-gray-900 ${selectedIds.has(u.id) ? 'bg-gray-900/60' : ''}`}>
                    <td className="px-3 py-2">
                      {u.role !== 'super_admin' && (
                        <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)}
                          className="w-4 h-4 rounded bg-gray-700 border-gray-500 accent-teal-500 cursor-pointer" />
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-sm">{u.username}</td>
                    <td className="px-3 py-2 font-semibold">{u.name}</td>
                    <td className="px-3 py-2 text-sm text-gray-400">{u.email || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 flex-wrap">
                        <span className={`lh-badge ${ROLE_COLORS[u.role] || 'lh-badge-neutral'}`}>
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                        {u.is_umpire && u.role !== 'umpire' && (
                          <span className="inline-block px-2 py-0.5 text-xs font-bold rounded-full bg-teal-900/35 text-teal-200">Umpire</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-400 whitespace-nowrap">
                      {formatLogin(u.last_login_at) || <span className="text-gray-500">Never</span>}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-300">
                      {u.role === 'super_admin' ? (
                        <span className="text-purple-600 font-medium">Full access</span>
                      ) : (
                        <span>
                          {u.permissions.org_ids.length} org{u.permissions.org_ids.length !== 1 ? 's' : ''},
                          {' '}{u.permissions.team_ids.length} team{u.permissions.team_ids.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex gap-1">
                        <Button size="xs" variant="secondary" onClick={() => { setEditing(u); setShowForm(true); }}>Edit</Button>
                        {u.role !== 'super_admin' && (
                          <Button size="xs" variant="chrome" onClick={() => setEditingPerms(u)}>Perms</Button>
                        )}
                        {u.email && (
                          <Button size="xs" variant="ghost" onClick={() => handleInvite(u)} disabled={inviting === u.id}>
                            {inviting === u.id ? '…' : 'Invite'}
                          </Button>
                        )}
                        <Button size="xs" variant="danger" onClick={() => handleDelete(u)} disabled={deleting === u.id}>
                          {deleting === u.id ? '…' : 'Delete'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {sortedUsers.map((u) => (
              <div key={u.id} className={`bg-gray-800 rounded-lg shadow-sm border p-4 text-gray-200 ${selectedIds.has(u.id) ? 'border-teal-600' : 'border-gray-700'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start gap-3">
                    {u.role !== 'super_admin' && (
                      <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)}
                        className="w-4 h-4 mt-0.5 rounded bg-gray-700 border-gray-500 accent-teal-500 cursor-pointer shrink-0" />
                    )}
                    <div>
                      <div className="font-semibold">{u.name}</div>
                      <div className="text-sm text-gray-400 font-mono">{u.username}</div>
                      {u.email && <div className="text-xs text-gray-400">{u.email}</div>}
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formatLogin(u.last_login_at) ? `Last login: ${formatLogin(u.last_login_at)}` : 'Never logged in'}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    <span className={`lh-badge shrink-0 ${ROLE_COLORS[u.role] || 'lh-badge-neutral'}`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                    {u.is_umpire && u.role !== 'umpire' && (
                      <span className="inline-block px-2 py-0.5 text-xs font-bold rounded-full shrink-0 bg-teal-900/35 text-teal-200">Umpire</span>
                    )}
                  </div>
                </div>
                {u.role !== 'super_admin' && (
                  <div className="text-sm text-gray-300 mb-2">
                    {u.permissions.org_ids.length} org{u.permissions.org_ids.length !== 1 ? 's' : ''},
                    {' '}{u.permissions.team_ids.length} team{u.permissions.team_ids.length !== 1 ? 's' : ''}
                  </div>
                )}
                <div className="flex gap-1.5 pt-2 border-t border-gray-700">
                  <Button size="xs" variant="secondary" onClick={() => { setEditing(u); setShowForm(true); }}>Edit</Button>
                  {u.role !== 'super_admin' && (
                    <Button size="xs" variant="chrome" onClick={() => setEditingPerms(u)}>Perms</Button>
                  )}
                  {u.email && (
                    <Button size="xs" variant="ghost" onClick={() => handleInvite(u)} disabled={inviting === u.id}>
                      {inviting === u.id ? '…' : 'Invite'}
                    </Button>
                  )}
                  <Button size="xs" variant="danger" onClick={() => handleDelete(u)} disabled={deleting === u.id}>
                    {deleting === u.id ? '…' : 'Delete'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      </>)}
      </>)}

      {tab === 'users' && showForm && (
        <UserForm
          user={editing}
          onDone={() => { setShowForm(false); setEditing(null); loadUsers(); }}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function UserForm({ user, onDone, onCancel }) {
  const isEditing = !!user;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    username: user?.username || '',
    name: user?.name || '',
    email: user?.email || '',
    role: (user?.role && user.role !== 'umpire') ? user.role : 'score_reporter',
    is_umpire: user?.is_umpire || user?.role === 'umpire' || false,
    password: '',
  });

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      if (isEditing) {
        const data = { name: form.name.trim(), role: form.role, email: form.email.trim() || null, is_umpire: form.is_umpire };
        if (form.password.trim()) data.password = form.password.trim();
        await updateUser(user.id, data);
      } else {
        if (!form.password.trim()) { setError('Password is required'); setSaving(false); return; }
        await createUser({
          username: form.username.trim(),
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          role: form.role,
          is_umpire: form.is_umpire,
          password: form.password.trim(),
        });
      }
      onDone();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onCancel} title={isEditing ? 'Edit User' : 'Add User'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Username *" id="user-username" name="username" type="text" value={form.username}
                onChange={handleChange} required placeholder="username" disabled={isEditing}
                className={isEditing ? 'bg-gray-800 cursor-not-allowed' : ''} />
            <Input label="Full Name *" id="user-name" name="name" type="text" value={form.name}
                onChange={handleChange} required placeholder="John Doe" />
          </div>
          <Input label="Email" id="user-email" name="email" type="email" value={form.email}
              onChange={handleChange} placeholder="user@example.com" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Role *" id="user-role" name="role" value={form.role} onChange={handleChange}>
                <option value="score_reporter">Score Reporter</option>
                <option value="team_manager">Team Manager</option>
                <option value="org_admin">Org Admin</option>
                <option value="accountant">Accountant</option>
                <option value="super_admin">Super Admin</option>
            </Select>
            <Input label={isEditing ? 'New Password (leave blank to keep)' : 'Password *'}
                id="user-password" name="password" type="password" value={form.password}
                onChange={handleChange} placeholder={isEditing ? '••••••••' : 'Password'} />
          </div>
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input name="is_umpire" type="checkbox" checked={form.is_umpire} onChange={handleChange}
                className="w-4 h-4 rounded bg-gray-700 border-gray-500 accent-teal-500 cursor-pointer" />
              <span className="text-sm text-gray-200 font-medium">Also an Umpire</span>
              <span className="text-xs text-gray-400">Grants umpire dashboard access alongside their primary role</span>
            </label>
          </div>
          {error && <div className="lh-alert lh-alert-error">{error}</div>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving} loading={saving}>
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Add User'}
            </Button>
          </div>
        </form>
    </Modal>
  );
}

function PermissionsEditor({ user, onBack }) {
  const [orgs, setOrgs] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [selectedOrgs, setSelectedOrgs] = useState(new Set(user.permissions?.org_ids || []));
  const [selectedTeams, setSelectedTeams] = useState(new Set(user.permissions?.team_ids || []));

  useEffect(() => {
    async function load() {
      try {
        const [orgData, teamData] = await Promise.all([fetchOrganizations(), fetchTeams()]);
        setOrgs(orgData);
        setTeams(teamData);
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  function toggleOrg(orgId) {
    setSelectedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }

  function toggleTeam(teamId) {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      await updateUserPermissions(user.id, {
        org_ids: [...selectedOrgs],
        team_ids: [...selectedTeams],
      });
      onBack();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading…</div>;

  // Group teams by org for display
  const teamsByOrg = {};
  const unassignedTeams = [];
  for (const t of teams) {
    if (t.org_id) {
      if (!teamsByOrg[t.org_id]) teamsByOrg[t.org_id] = [];
      teamsByOrg[t.org_id].push(t);
    } else {
      unassignedTeams.push(t);
    }
  }

  return (
    <div>
      <Button variant="secondary" size="sm" onClick={onBack} className="mb-4">
        ← Back to Users
      </Button>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-4 text-gray-200">
        <h2 className="text-xl font-display font-bold text-white mb-1">Permissions for {user.name}</h2>
        <p className="text-sm text-gray-400 mb-4">
          Select which organizations and teams this user can edit. Granting org access automatically includes all teams under that org.
        </p>

        {/* Organizations */}
        <h3 className="text-base font-display font-bold uppercase text-white tracking-wide mb-2">Organizations</h3>
        {orgs.length === 0 ? (
          <p className="text-sm text-gray-400 mb-4">No organizations created yet.</p>
        ) : (
          <div className="space-y-2 mb-6">
            {orgs.map((org) => (
              <label key={org.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-900 cursor-pointer">
                <input type="checkbox" checked={selectedOrgs.has(org.id)}
                  onChange={() => toggleOrg(org.id)}
                  className="w-4 h-4 text-action-600 rounded border-gray-600 focus:ring-action-500" />
                <div>
                  <span className="font-semibold text-sm">{org.name}</span>
                  {org.team_count > 0 && (
                    <span className="text-xs text-gray-400 ml-2">({org.team_count} team{org.team_count !== 1 ? 's' : ''})</span>
                  )}
                  {selectedOrgs.has(org.id) && teamsByOrg[org.id]?.length > 0 && (
                    <span className="text-xs text-chrome-400 ml-2">→ includes all teams</span>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        {/* Individual Teams */}
        <h3 className="text-base font-display font-bold uppercase text-white tracking-wide mb-2">Individual Teams</h3>
        <p className="text-xs text-gray-400 mb-2">Grant access to specific teams without full org access. Teams under a selected org above are already included.</p>
        {teams.length === 0 ? (
          <p className="text-sm text-gray-400 mb-4">No teams created yet.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {orgs.map((org) => {
              const orgTeams = teamsByOrg[org.id] || [];
              if (orgTeams.length === 0) return null;
              const orgSelected = selectedOrgs.has(org.id);
              return (
                <div key={org.id} className="ml-2">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{org.name}</div>
                  <div className="space-y-1 ml-2">
                    {orgTeams.map((t) => (
                      <label key={t.id} className={`flex items-center gap-3 p-1.5 rounded-lg cursor-pointer ${orgSelected ? 'opacity-50' : 'hover:bg-gray-900'}`}>
                        <input type="checkbox"
                          checked={orgSelected || selectedTeams.has(t.id)}
                          disabled={orgSelected}
                          onChange={() => toggleTeam(t.id)}
                          className="w-4 h-4 text-action-600 rounded border-gray-600 focus:ring-action-500" />
                        <span className="text-sm">{t.name}</span>
                        {t.age_group && <span className="text-xs text-gray-400">{t.age_group}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            {unassignedTeams.length > 0 && (
              <div className="ml-2">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Unassigned</div>
                <div className="space-y-1 ml-2">
                  {unassignedTeams.map((t) => (
                    <label key={t.id} className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-gray-900 cursor-pointer">
                      <input type="checkbox"
                        checked={selectedTeams.has(t.id)}
                        onChange={() => toggleTeam(t.id)}
                        className="w-4 h-4 text-action-600 rounded border-gray-600 focus:ring-action-500" />
                      <span className="text-sm">{t.name}</span>
                      {t.age_group && <span className="text-xs text-gray-400">{t.age_group}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {error && <div className="lh-alert lh-alert-error mb-3">{error}</div>}

        <div className="flex justify-end gap-3 pt-3 border-t border-gray-700">
          <Button variant="secondary" onClick={onBack}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} loading={saving}>
            {saving ? 'Saving…' : 'Save Permissions'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PendingApprovals() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [acting, setActing] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectNotes, setRejectNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setPending(await fetchPendingApprovals()); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(user) {
    setActing(user.id);
    try {
      await approveUser(user.id);
      setPending(prev => prev.filter(u => u.id !== user.id));
    } catch (err) { alert(`Failed to approve: ${err.message}`); }
    finally { setActing(null); }
  }

  async function handleReject() {
    if (!rejectModal) return;
    setActing(rejectModal.id);
    try {
      await rejectUser(rejectModal.id, rejectNotes || null);
      setPending(prev => prev.filter(u => u.id !== rejectModal.id));
      setRejectModal(null);
      setRejectNotes('');
    } catch (err) { alert(`Failed to reject: ${err.message}`); }
    finally { setActing(null); }
  }

  async function handleReset(user) {
    setActing(user.id);
    try {
      await resetUserApproval(user.id);
      load();
    } catch (err) { alert(`Failed to reset: ${err.message}`); }
    finally { setActing(null); }
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading approvals…</div>;
  if (error) return <div className="lh-alert lh-alert-error">Error: {error}</div>;

  const pendingUsers = pending.filter(u => u.approval_status === 'pending');
  const rejectedUsers = pending.filter(u => u.approval_status === 'rejected');

  if (!pending.length) {
    return <div className="py-12 text-center text-gray-400">No pending approvals.</div>;
  }

  function renderUserCard(u) {
    const isPending = u.approval_status === 'pending';
    const perms = u.pending_permissions || [];
    return (
      <div key={u.id} className={`bg-gray-800 rounded-lg border p-4 text-gray-200 ${isPending ? 'border-gray-700' : 'border-red-900/40'}`}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="font-semibold">{u.name}</div>
            <div className="text-sm text-gray-400">{u.email}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Registered {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <div className="flex gap-1 items-center">
            <span className={`lh-badge ${ROLE_COLORS[u.role] || 'lh-badge-neutral'}`}>
              {ROLE_LABELS[u.role] || u.role}
            </span>
            {!isPending && (
              <span className="inline-block px-2 py-0.5 text-xs font-bold rounded-full bg-signal-900/40 text-signal-300">Rejected</span>
            )}
          </div>
        </div>

        {/* Show requested permissions */}
        {perms.length > 0 && (
          <div className="text-xs text-gray-400 mb-3">
            {perms.filter(p => p.team_name).length > 0 && (
              <div>Teams: {perms.filter(p => p.team_name).map(p => p.team_name).join(', ')}</div>
            )}
            {perms.filter(p => p.org_name).length > 0 && (
              <div>Orgs: {perms.filter(p => p.org_name).map(p => p.org_name).join(', ')}</div>
            )}
          </div>
        )}

        {u.approval_notes && (
          <div className="text-xs text-signal-400/80 mb-3 bg-signal-900/20 rounded px-2 py-1">
            Rejection note: {u.approval_notes}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-gray-700">
          {isPending && (
            <>
              <Button size="xs" onClick={() => handleApprove(u)} disabled={acting === u.id}>
                {acting === u.id ? '…' : 'Approve'}
              </Button>
              <Button size="xs" variant="danger" onClick={() => { setRejectModal(u); setRejectNotes(''); }} disabled={acting === u.id}>
                Reject
              </Button>
            </>
          )}
          {!isPending && (
            <Button size="xs" variant="warn" onClick={() => handleReset(u)} disabled={acting === u.id}>
              {acting === u.id ? '…' : 'Reset to Pending'}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {pendingUsers.length > 0 && (
        <div className="mb-6">
          <h3 className="eyebrow text-sm mb-3">Pending ({pendingUsers.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingUsers.map(renderUserCard)}
          </div>
        </div>
      )}

      {rejectedUsers.length > 0 && (
        <div>
          <h3 className="eyebrow text-sm mb-3">Rejected ({rejectedUsers.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rejectedUsers.map(renderUserCard)}
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <Modal open onClose={() => { setRejectModal(null); setRejectNotes(''); }} title={`Reject ${rejectModal.name}?`} size="md">
            <p className="text-sm text-gray-400 mb-3">This user will be blocked from logging in for 30 days.</p>
            <div className="mb-4">
              <label className="lh-eyebrow block mb-1">Reason (optional)</label>
              <textarea value={rejectNotes} onChange={e => setRejectNotes(e.target.value)}
                placeholder="Reason for rejection…" rows={3}
                className="lh-input resize-none" />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => { setRejectModal(null); setRejectNotes(''); }}>Cancel</Button>
              <Button variant="danger" onClick={handleReject} disabled={acting === rejectModal.id} loading={acting === rejectModal.id}>
                {acting === rejectModal.id ? 'Rejecting…' : 'Reject User'}
              </Button>
            </div>
        </Modal>
      )}
    </div>
  );
}
