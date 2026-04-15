import { useState, useEffect, useCallback } from 'react';
import {
  fetchUsers, createUser, updateUser, deleteUser, updateUserPermissions,
  fetchOrganizations, fetchTeams, inviteUser,
  fetchPendingApprovals, approveUser, rejectUser, resetUserApproval,
} from '../api/index.js';

const inputCls = "w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1";
const btnPrimary = "px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60";
const btnSecondary = "px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600 transition-colors";
const btnDanger = "px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 disabled:opacity-60";
const btnSm = "px-3 py-1.5 text-xs font-semibold rounded";

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
  super_admin: 'bg-purple-900/35 text-purple-200',
  accountant: 'bg-amber-900/35 text-amber-200',
  org_admin: 'bg-blue-900/40 text-blue-200',
  team_manager: 'bg-green-900/35 text-green-300',
  score_reporter: 'bg-gray-800 text-gray-300',
  umpire: 'bg-teal-900/35 text-teal-200',
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

  const loadUsers = useCallback(async () => {
    setLoading(true); setError(null);
    try { setUsers(await fetchUsers()); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'users' && showUsersTab) loadUsers(); }, [loadUsers, tab, showUsersTab]);

  async function handleDelete(user) {
    if (!window.confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    setDeleting(user.id);
    try {
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
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
                  className={`px-4 py-2 text-sm font-semibold transition-colors ${
                    tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}>{t.label}</button>
              ))}
            </div>
          )}
          {tab === 'users' && <h2 className="text-xl font-heading font-bold text-white">User Accounts ({users.length})</h2>}
          {tab === 'approvals' && <h2 className="text-xl font-heading font-bold text-white">Approvals</h2>}
        </div>
        <div className="flex gap-2">
          {tab === 'users' && <button onClick={() => { setEditing(null); setShowForm(true); }} className={btnPrimary}>+ Add User</button>}
          {onBack && <button onClick={onBack} className={btnSecondary}>← Back</button>}
        </div>
      </div>

      {/* Approvals tab */}
      {tab === 'approvals' && <PendingApprovals />}

      {/* Users tab */}
      {tab === 'users' && (<>
      {loading && <div className="py-8 text-center text-gray-400">Loading users…</div>}
      {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">Error: {error}</div>}
      {!loading && !error && (<>

      {users.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          No user accounts.
          <br />
          <button onClick={() => setShowForm(true)} className="text-field-300 underline mt-1 inline-block">Add the first user</button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full bg-gray-800 rounded-lg shadow-sm overflow-hidden text-sm text-gray-200">
              <thead>
                <tr className="bg-gray-800 border-b-2 border-gray-700">
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Username</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Email</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Role</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Last Login</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Permissions</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-900">
                    <td className="px-3 py-2 font-mono text-sm">{u.username}</td>
                    <td className="px-3 py-2 font-semibold">{u.name}</td>
                    <td className="px-3 py-2 text-sm text-gray-400">{u.email || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-full ${ROLE_COLORS[u.role] || 'bg-gray-800 text-gray-300'}`}>
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
                        <button onClick={() => { setEditing(u); setShowForm(true); }} className={`${btnSm} bg-gray-700 text-gray-200 hover:bg-gray-600`}>Edit</button>
                        {u.role !== 'super_admin' && (
                          <button onClick={() => setEditingPerms(u)} className={`${btnSm} bg-blue-900/40 text-blue-200 hover:bg-blue-800/60`}>Perms</button>
                        )}
                        {u.email && (
                          <button onClick={() => handleInvite(u)} disabled={inviting === u.id}
                            className={`${btnSm} bg-green-900/35 text-green-300 hover:bg-green-800/60`}>
                            {inviting === u.id ? '…' : 'Invite'}
                          </button>
                        )}
                        <button onClick={() => handleDelete(u)} disabled={deleting === u.id} className={btnDanger}>
                          {deleting === u.id ? '…' : 'Delete'}
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
            {users.map((u) => (
              <div key={u.id} className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-4 text-gray-200">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold">{u.name}</div>
                    <div className="text-sm text-gray-400 font-mono">{u.username}</div>
                    {u.email && <div className="text-xs text-gray-400">{u.email}</div>}
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatLogin(u.last_login_at) ? `Last login: ${formatLogin(u.last_login_at)}` : 'Never logged in'}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-full shrink-0 ${ROLE_COLORS[u.role] || 'bg-gray-800 text-gray-300'}`}>
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
                  <button onClick={() => { setEditing(u); setShowForm(true); }} className={`${btnSm} bg-gray-700 text-gray-200 hover:bg-gray-600`}>Edit</button>
                  {u.role !== 'super_admin' && (
                    <button onClick={() => setEditingPerms(u)} className={`${btnSm} bg-blue-900/40 text-blue-200 hover:bg-blue-800/60`}>Perms</button>
                  )}
                  {u.email && (
                    <button onClick={() => handleInvite(u)} disabled={inviting === u.id}
                      className={`${btnSm} bg-green-900/35 text-green-300 hover:bg-green-800/60`}>
                      {inviting === u.id ? '…' : 'Invite'}
                    </button>
                  )}
                  <button onClick={() => handleDelete(u)} disabled={deleting === u.id} className={btnDanger}>
                    {deleting === u.id ? '…' : 'Delete'}
                  </button>
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-5 sm:p-6 my-4 text-gray-200">
        <h2 className="text-xl font-heading font-bold text-white mb-4">{isEditing ? 'Edit User' : 'Add User'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="user-username" className={labelCls}>Username *</label>
              <input id="user-username" name="username" type="text" value={form.username}
                onChange={handleChange} required placeholder="username" disabled={isEditing}
                className={`${inputCls} ${isEditing ? 'bg-gray-800 cursor-not-allowed' : ''}`} />
            </div>
            <div>
              <label htmlFor="user-name" className={labelCls}>Full Name *</label>
              <input id="user-name" name="name" type="text" value={form.name}
                onChange={handleChange} required placeholder="John Doe" className={inputCls} />
            </div>
          </div>
          <div>
            <label htmlFor="user-email" className={labelCls}>Email</label>
            <input id="user-email" name="email" type="email" value={form.email}
              onChange={handleChange} placeholder="user@example.com" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="user-role" className={labelCls}>Role *</label>
              <select id="user-role" name="role" value={form.role} onChange={handleChange} className={inputCls}>
                <option value="score_reporter">Score Reporter</option>
                <option value="team_manager">Team Manager</option>
                <option value="org_admin">Org Admin</option>
                <option value="accountant">Accountant</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            <div>
              <label htmlFor="user-password" className={labelCls}>
                {isEditing ? 'New Password (leave blank to keep)' : 'Password *'}
              </label>
              <input id="user-password" name="password" type="password" value={form.password}
                onChange={handleChange} placeholder={isEditing ? '••••••••' : 'Password'}
                className={inputCls} />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input name="is_umpire" type="checkbox" checked={form.is_umpire} onChange={handleChange}
                className="w-4 h-4 rounded bg-gray-700 border-gray-500 accent-teal-500 cursor-pointer" />
              <span className="text-sm text-gray-200 font-medium">Also an Umpire</span>
              <span className="text-xs text-gray-400">Grants umpire dashboard access alongside their primary role</span>
            </label>
          </div>
          {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
      <button onClick={onBack} className="px-3 py-1.5 text-sm font-semibold bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 mb-4">
        ← Back to Users
      </button>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-4 text-gray-200">
        <h2 className="text-xl font-heading font-bold text-white mb-1">Permissions for {user.name}</h2>
        <p className="text-sm text-gray-400 mb-4">
          Select which organizations and teams this user can edit. Granting org access automatically includes all teams under that org.
        </p>

        {/* Organizations */}
        <h3 className="text-base font-heading font-bold uppercase text-white tracking-wide mb-2">Organizations</h3>
        {orgs.length === 0 ? (
          <p className="text-sm text-gray-400 mb-4">No organizations created yet.</p>
        ) : (
          <div className="space-y-2 mb-6">
            {orgs.map((org) => (
              <label key={org.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-900 cursor-pointer">
                <input type="checkbox" checked={selectedOrgs.has(org.id)}
                  onChange={() => toggleOrg(org.id)}
                  className="w-4 h-4 text-blue-600 rounded border-gray-600 focus:ring-blue-500" />
                <div>
                  <span className="font-semibold text-sm">{org.name}</span>
                  {org.team_count > 0 && (
                    <span className="text-xs text-gray-400 ml-2">({org.team_count} team{org.team_count !== 1 ? 's' : ''})</span>
                  )}
                  {selectedOrgs.has(org.id) && teamsByOrg[org.id]?.length > 0 && (
                    <span className="text-xs text-blue-600 ml-2">→ includes all teams</span>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        {/* Individual Teams */}
        <h3 className="text-base font-heading font-bold uppercase text-white tracking-wide mb-2">Individual Teams</h3>
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
                          className="w-4 h-4 text-blue-600 rounded border-gray-600 focus:ring-blue-500" />
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
                        className="w-4 h-4 text-blue-600 rounded border-gray-600 focus:ring-blue-500" />
                      <span className="text-sm">{t.name}</span>
                      {t.age_group && <span className="text-xs text-gray-400">{t.age_group}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg mb-3">{error}</div>}

        <div className="flex justify-end gap-3 pt-3 border-t border-gray-700">
          <button onClick={onBack} className={btnSecondary}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className={btnPrimary}>
            {saving ? 'Saving…' : 'Save Permissions'}
          </button>
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
  if (error) return <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">Error: {error}</div>;

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
            <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-full ${ROLE_COLORS[u.role] || 'bg-gray-800 text-gray-300'}`}>
              {ROLE_LABELS[u.role] || u.role}
            </span>
            {!isPending && (
              <span className="inline-block px-2 py-0.5 text-xs font-bold rounded-full bg-red-900/40 text-red-300">Rejected</span>
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
          <div className="text-xs text-red-400/80 mb-3 bg-red-900/20 rounded px-2 py-1">
            Rejection note: {u.approval_notes}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-gray-700">
          {isPending && (
            <>
              <button onClick={() => handleApprove(u)} disabled={acting === u.id}
                className={`${btnSm} bg-green-900/40 text-green-300 hover:bg-green-800/60`}>
                {acting === u.id ? '…' : 'Approve'}
              </button>
              <button onClick={() => { setRejectModal(u); setRejectNotes(''); }} disabled={acting === u.id}
                className={`${btnSm} bg-red-900/40 text-red-300 hover:bg-red-900/60`}>
                Reject
              </button>
            </>
          )}
          {!isPending && (
            <button onClick={() => handleReset(u)} disabled={acting === u.id}
              className={`${btnSm} bg-amber-900/40 text-amber-300 hover:bg-amber-800/60`}>
              {acting === u.id ? '…' : 'Reset to Pending'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {pendingUsers.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Pending ({pendingUsers.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingUsers.map(renderUserCard)}
          </div>
        </div>
      )}

      {rejectedUsers.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-3">Rejected ({rejectedUsers.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rejectedUsers.map(renderUserCard)}
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-5 text-gray-200">
            <h3 className="text-lg font-heading font-bold text-white mb-3">Reject {rejectModal.name}?</h3>
            <p className="text-sm text-gray-400 mb-3">This user will be blocked from logging in for 30 days.</p>
            <div className="mb-4">
              <label className={labelCls}>Reason (optional)</label>
              <textarea value={rejectNotes} onChange={e => setRejectNotes(e.target.value)}
                placeholder="Reason for rejection…" rows={3}
                className={inputCls + ' resize-none'} />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setRejectModal(null); setRejectNotes(''); }} className={btnSecondary}>Cancel</button>
              <button onClick={handleReject} disabled={acting === rejectModal.id} className={btnDanger}>
                {acting === rejectModal.id ? 'Rejecting…' : 'Reject User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
