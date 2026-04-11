import { useState, useEffect, useCallback } from 'react';
import {
  fetchOrganizations, createOrganization, updateOrganization, deleteOrganization,
  fetchTeams, updateTeam, uploadOrgLogo, removeOrgLogo,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import FieldLocations from './FieldLocations.jsx';

const inputCls = "w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1";
const btnPrimary = "px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60";
const btnSecondary = "px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600 transition-colors";
const btnDanger = "px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 disabled:opacity-60";
const btnSm = "px-3 py-1.5 text-xs font-semibold rounded";

export default function OrgManager({ onBack }) {
  const { isAdmin, canEditOrg } = useAuth();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const loadOrgs = useCallback(async () => {
    setLoading(true); setError(null);
    try { setOrgs(await fetchOrganizations()); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  async function handleDelete(org) {
    if (!window.confirm(`Delete "${org.name}" and all its field locations? Teams will be unlinked.`)) return;
    setDeleting(org.id);
    try { await deleteOrganization(org.id); setOrgs((prev) => prev.filter((o) => o.id !== org.id)); if (selectedOrg?.id === org.id) setSelectedOrg(null); }
    catch (err) { alert(`Failed to delete: ${err.message}`); }
    finally { setDeleting(null); }
  }

  function handleFormDone() { setShowForm(false); setEditing(null); loadOrgs(); }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading organizations…</div>;
  if (error) return <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">Error: {error}</div>;

  if (selectedOrg) {
    return <OrgDetailView org={selectedOrg} onBack={() => { setSelectedOrg(null); loadOrgs(); }} />;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold">Organizations ({orgs.length})</h2>
        <div className="flex gap-2">
          {isAdmin && <button onClick={() => { setEditing(null); setShowForm(true); }} className={btnPrimary}>+ Add Organization</button>}
          {onBack && <button onClick={onBack} className={btnSecondary}>← Teams</button>}
        </div>
      </div>

      {orgs.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          No organizations yet.
          {isAdmin && (
            <>
              <br />
              <button onClick={() => setShowForm(true)} className="text-blue-300 underline mt-1 inline-block">Add the first organization</button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map((org) => (
            <div key={org.id} onClick={() => setSelectedOrg(org)}
              className="bg-gray-800 border border-gray-700 rounded-xl p-4 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {org.logo_url && <img src={org.logo_url} alt="" className="w-8 h-8 object-contain rounded shrink-0" />}
                  <h3 className="font-bold text-base truncate">{org.name}</h3>
                </div>
                <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ml-2">
                  {org.team_count} team{org.team_count !== 1 ? 's' : ''}
                </span>
              </div>
              {org.contact_name && <p className="text-sm text-gray-300">{org.contact_name}</p>}
              {org.city && org.state && <p className="text-sm text-gray-400">{org.city}, {org.state}</p>}
              {org.locations.length > 0 && (
                <p className="text-sm text-gray-400">{org.locations.length} field location{org.locations.length !== 1 ? 's' : ''}</p>
              )}
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700" onClick={(e) => e.stopPropagation()}>
                {canEditOrg(org.id) && <button onClick={() => { setEditing(org); setShowForm(true); }} className={`${btnSm} bg-gray-700 text-gray-200 hover:bg-gray-600`}>Edit</button>}
                {isAdmin && (
                  <button onClick={() => handleDelete(org)} disabled={deleting === org.id} className={btnDanger}>
                    {deleting === org.id ? '…' : 'Delete'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <OrgForm org={editing} onDone={handleFormDone} onCancel={() => { setShowForm(false); setEditing(null); }} />}
    </div>
  );
}

function OrgCard({ org }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 mb-4">
      <div className="flex items-center gap-3 mb-3">
        {org.logo_url && <img src={org.logo_url} alt="" className="w-12 h-12 object-contain rounded" />}
        <h2 className="text-xl font-bold">{org.name}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {org.contact_name && <div><span className="font-semibold">Contact:</span> {org.contact_name}</div>}
        {org.contact_email && <div><span className="font-semibold">Email:</span> {org.contact_email}</div>}
        {org.contact_phone && <div><span className="font-semibold">Phone:</span> {org.contact_phone}</div>}
        {(org.address || org.city) && <div><span className="font-semibold">Address:</span> {[org.address, org.city, org.state, org.zip].filter(Boolean).join(', ')}</div>}
        {org.notes && <div className="col-span-full"><span className="font-semibold">Notes:</span> {org.notes}</div>}
      </div>
    </div>
  );
}

function OrgForm({ org, onDone, onCancel }) {
  const isEditing = !!org;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(org?.logo_url || null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [form, setForm] = useState({
    name: org?.name || '', contact_name: org?.contact_name || '',
    contact_email: org?.contact_email || '', contact_phone: org?.contact_phone || '',
    address: org?.address || '', city: org?.city || '',
    state: org?.state || '', zip: org?.zip || '', notes: org?.notes || '',
  });

  function handleChange(e) { setForm((prev) => ({ ...prev, [e.target.name]: e.target.value })); }

  function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setRemoveLogo(false);
    setLogoPreview(URL.createObjectURL(file));
  }

  function handleRemoveLogo() {
    setLogoFile(null);
    setRemoveLogo(true);
    setLogoPreview(null);
  }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError(null);
    const data = {};
    for (const [key, value] of Object.entries(form)) data[key] = value.trim() || null;
    try {
      let savedOrg;
      if (isEditing) {
        savedOrg = await updateOrganization(org.id, data);
      } else {
        savedOrg = await createOrganization(data);
      }
      const orgId = savedOrg.id;
      if (logoFile) {
        await uploadOrgLogo(orgId, logoFile);
      } else if (removeLogo && isEditing) {
        await removeOrgLogo(orgId);
      }
      onDone();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-xl p-5 sm:p-6 my-4">
        <h2 className="text-xl font-bold mb-4">{isEditing ? 'Edit Organization' : 'Add Organization'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="org-name" className={labelCls}>Organization Name *</label>
            <input id="org-name" name="name" type="text" value={form.name} onChange={handleChange} required placeholder="e.g. Lake City Baseball" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Logo</label>
            <div className="flex items-center gap-3">
              {logoPreview && <img src={logoPreview} alt="Logo preview" className="w-16 h-16 object-contain rounded border border-gray-700" />}
              <div className="flex flex-col gap-1">
                <label className="px-3 py-1.5 text-xs font-semibold bg-gray-700 text-gray-200 rounded hover:bg-gray-600 cursor-pointer inline-block w-fit">
                  {logoPreview ? 'Change' : 'Upload'}
                  <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                </label>
                {logoPreview && (
                  <button type="button" onClick={handleRemoveLogo} className="px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-400 rounded hover:bg-red-200 w-fit">Remove</button>
                )}
                <p className="text-xs text-gray-400">Max 500 KB. PNG, JPEG, GIF, WebP, or SVG.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="org-contact-name" className={labelCls}>Contact Name</label>
              <input id="org-contact-name" name="contact_name" type="text" value={form.contact_name} onChange={handleChange} placeholder="John Doe" className={inputCls} />
            </div>
            <div>
              <label htmlFor="org-contact-email" className={labelCls}>Contact Email</label>
              <input id="org-contact-email" name="contact_email" type="email" value={form.contact_email} onChange={handleChange} placeholder="contact@example.com" className={inputCls} />
            </div>
            <div>
              <label htmlFor="org-contact-phone" className={labelCls}>Contact Phone</label>
              <input id="org-contact-phone" name="contact_phone" type="tel" value={form.contact_phone} onChange={handleChange} placeholder="(555) 123-4567" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_80px_100px] gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="org-address" className={labelCls}>Address</label>
              <input id="org-address" name="address" type="text" value={form.address} onChange={handleChange} placeholder="123 Main St" className={inputCls} />
            </div>
            <div>
              <label htmlFor="org-city" className={labelCls}>City</label>
              <input id="org-city" name="city" type="text" value={form.city} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label htmlFor="org-state" className={labelCls}>State</label>
              <input id="org-state" name="state" type="text" value={form.state} onChange={handleChange} maxLength={2} placeholder="OH" className={inputCls} />
            </div>
            <div>
              <label htmlFor="org-zip" className={labelCls}>ZIP</label>
              <input id="org-zip" name="zip" type="text" value={form.zip} onChange={handleChange} maxLength={10} placeholder="44107" className={inputCls} />
            </div>
          </div>

          <div>
            <label htmlFor="org-notes" className={labelCls}>Notes</label>
            <textarea id="org-notes" name="notes" value={form.notes} onChange={handleChange} rows={3} placeholder="Any additional info…"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>

          {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Add Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OrgDetailView({ org: initialOrg, onBack }) {
  const [org, setOrg] = useState(initialOrg);
  const [allTeams, setAllTeams] = useState([]);

  const reload = useCallback(async () => {
    const [orgs, teams] = await Promise.all([fetchOrganizations(), fetchTeams()]);
    const fresh = orgs.find((o) => o.id === initialOrg.id);
    if (fresh) setOrg(fresh);
    setAllTeams(teams);
  }, [initialOrg.id]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <div>
      <button onClick={onBack} className="px-3 py-1.5 text-sm font-semibold bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 mb-4">
        ← Back to Organizations
      </button>
      <OrgCard org={org} />
      <OrgTeams org={org} allTeams={allTeams} onChanged={reload} />
      <FieldLocations orgId={org.id} orgName={org.name} />
    </div>
  );
}

function OrgTeams({ org, allTeams, onChanged }) {
  const { isAdmin } = useAuth();
  const [assigning, setAssigning] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');

  const orgTeams = org.teams || [];
  const unassignedTeams = allTeams.filter((t) => !t.org_id);

  async function handleAssign() {
    if (!selectedTeamId) return;
    setAssigning(true);
    try {
      const team = allTeams.find((t) => t.id === Number(selectedTeamId));
      await updateTeam(selectedTeamId, { name: team.name, age_group: team.age_group, division: team.division, org_id: org.id });
      setSelectedTeamId(''); onChanged();
    } catch (err) { alert(`Failed to assign: ${err.message}`); }
    finally { setAssigning(false); }
  }

  async function handleUnassign(team) {
    if (!window.confirm(`Remove "${team.name}" from this organization?`)) return;
    try { await updateTeam(team.id, { name: team.name, age_group: team.age_group, division: team.division, org_id: null }); onChanged(); }
    catch (err) { alert(`Failed to unassign: ${err.message}`); }
  }

  return (
    <div className="mt-6">
      <h3 className="text-base font-bold mb-2">Teams ({orgTeams.length})</h3>

      {orgTeams.length > 0 ? (
        <>
          {/* Desktop */}
          <div className="hidden sm:block">
            <table className="w-full bg-gray-800 rounded-lg shadow-sm overflow-hidden text-sm">
              <thead>
                <tr className="bg-gray-800 border-b-2 border-gray-700">
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400">Team Name</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400">Age Group</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400">Level</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400">Division(s)</th>
                  {isAdmin && <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 w-24">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {orgTeams.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-900">
                    <td className="px-3 py-2 font-semibold">{t.long_name || t.name}</td>
                    <td className="px-3 py-2">{t.age_group || '—'}</td>
                    <td className="px-3 py-2">{t.level || '—'}</td>
                    <td className="px-3 py-2">{t.divisions?.length ? t.divisions.map(d => d.name).join(', ') : (t.division || '—')}</td>
                    {isAdmin && <td className="px-3 py-2"><button onClick={() => handleUnassign(t)} className={btnDanger}>Remove</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile */}
          <div className="sm:hidden space-y-2">
            {orgTeams.map((t) => (
              <div key={t.id} className="bg-gray-800 rounded-lg border border-gray-700 p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">{t.long_name || t.name}</div>
                  <div className="text-xs text-gray-400">{[t.age_group, t.level, t.divisions?.length ? t.divisions.map(d => d.name).join(', ') : t.division].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                {isAdmin && <button onClick={() => handleUnassign(t)} className={btnDanger}>Remove</button>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="py-4 text-center text-gray-400 text-sm">No teams assigned yet.</div>
      )}

      {isAdmin && unassignedTeams.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-3">
          <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)}
            className="flex-1 sm:flex-none sm:min-w-[220px] px-3 py-2 border border-gray-600 rounded-lg text-sm bg-gray-800">
            <option value="">— Assign a team —</option>
            {unassignedTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={handleAssign} disabled={!selectedTeamId || assigning}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {assigning ? '…' : 'Assign'}
          </button>
        </div>
      )}
    </div>
  );
}
