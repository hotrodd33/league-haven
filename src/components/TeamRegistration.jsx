import { useState, useEffect } from 'react';
import { fetchRegistrationConfig, registerDirector } from '../api/index.js';

const inputCls = "w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1";
const btnPrimary = "px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm";
const btnSecondary = "px-4 py-2 bg-gray-700 text-gray-200 font-semibold rounded-lg hover:bg-gray-600 transition-colors text-sm";
const btnDanger = "px-3 py-1.5 text-xs font-semibold bg-red-900/40 text-red-300 rounded hover:bg-red-900/60 transition-colors";

const EMPTY_TEAM = {
  team_city: '',
  team_mascot: '',
  team_color: '',
  age_group: '',
  level: '',
  primary_color: '#003366',
  secondary_color: '#CC0000',
  coach_name: '',
  coach_email: '',
  coach_phone: '',
};

export default function TeamRegistration({ onDone }) {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Step 1: Director info
  const [director, setDirector] = useState({
    name: '', email: '', phone: '', username: '', password: '', confirmPassword: '',
  });

  // Step 2: Organization
  const [orgMode, setOrgMode] = useState('existing'); // 'existing' | 'new'
  const [orgId, setOrgId] = useState('');
  const [newOrg, setNewOrg] = useState({
    name: '', city: '', state: '', contact_name: '', contact_email: '', contact_phone: '',
  });

  // Step 3: Teams
  const [teams, setTeams] = useState([{ ...EMPTY_TEAM }]);

  useEffect(() => {
    fetchRegistrationConfig()
      .then(setConfig)
      .catch(() => setError('Failed to load configuration'))
      .finally(() => setLoading(false));
  }, []);

  // ── Validation helpers ──
  function validateStep1() {
    if (!director.name.trim()) return 'Full name is required';
    if (!director.email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(director.email)) return 'Invalid email address';
    if (!director.username.trim()) return 'Username is required';
    if (director.username.length < 3) return 'Username must be at least 3 characters';
    if (!director.password) return 'Password is required';
    if (director.password.length < 8) return 'Password must be at least 8 characters';
    if (director.password !== director.confirmPassword) return 'Passwords do not match';
    return null;
  }

  function validateStep2() {
    if (orgMode === 'existing' && !orgId) return 'Please select an organization';
    if (orgMode === 'new' && !newOrg.name.trim()) return 'Organization name is required';
    return null;
  }

  function validateStep3() {
    for (let i = 0; i < teams.length; i++) {
      if (!teams[i].team_city.trim()) return `Team ${i + 1}: city is required`;
      if (!teams[i].age_group) return `Team ${i + 1}: age group is required`;
      if (teams[i].coach_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teams[i].coach_email)) {
        return `Team ${i + 1}: invalid coach email`;
      }
    }
    return null;
  }

  function handleNext() {
    let err;
    if (step === 1) err = validateStep1();
    if (step === 2) err = validateStep2();
    if (step === 3) err = validateStep3();
    if (err) { setError(err); return; }
    setError(null);
    setStep(step + 1);
  }

  function handleBack() {
    setError(null);
    setStep(step - 1);
  }

  // ── Team helpers ──
  function updateTeam(index, field, value) {
    setTeams(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  }

  function addTeam() {
    setTeams(prev => [...prev, { ...EMPTY_TEAM }]);
  }

  function removeTeam(index) {
    if (teams.length === 1) return;
    setTeams(prev => prev.filter((_, i) => i !== index));
  }

  function duplicateTeam(index) {
    const source = teams[index];
    setTeams(prev => [
      ...prev.slice(0, index + 1),
      { ...source, coach_name: '', coach_email: '', coach_phone: '' },
      ...prev.slice(index + 1),
    ]);
  }

  // ── Submit ──
  async function handleSubmit() {
    const err = validateStep3();
    if (err) { setError(err); return; }
    setError(null);
    setSubmitting(true);

    try {
      const payload = {
        director: {
          username: director.username.trim(),
          password: director.password,
          name: director.name.trim(),
          email: director.email.trim().toLowerCase(),
          phone: director.phone.trim() || null,
        },
        organization: orgMode === 'existing'
          ? { id: Number(orgId) }
          : {
              name: newOrg.name.trim(),
              city: newOrg.city.trim() || null,
              state: newOrg.state.trim() || null,
              contact_name: newOrg.contact_name.trim() || null,
              contact_email: newOrg.contact_email.trim() || null,
              contact_phone: newOrg.contact_phone.trim() || null,
            },
        teams: teams.map(t => ({
          team_city: t.team_city.trim(),
          team_mascot: t.team_mascot.trim() || null,
          team_color: t.team_color.trim() || null,
          age_group: t.age_group,
          level: t.level || null,
          primary_color: t.primary_color || null,
          secondary_color: t.secondary_color || null,
          coach_name: t.coach_name.trim() || null,
          coach_email: t.coach_email.trim().toLowerCase() || null,
          coach_phone: t.coach_phone.trim() || null,
        })),
      };

      const result = await registerDirector(payload);

      // Save auth and redirect
      const saved = {
        token: result.token,
        user: result.user,
        permissions: result.permissions || { org_ids: [], team_ids: [] },
      };
      localStorage.setItem('zvbl_roster_auth', JSON.stringify(saved));

      setSuccess({
        teams_created: result.teams_created,
        coaches_invited: result.coaches_invited,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
        <div className="bg-gray-800 rounded-lg shadow-card p-8 w-full max-w-md border-t-4 border-green-600 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="font-heading text-2xl font-bold text-green-300 mb-3">Registration Complete!</h2>
          <p className="text-gray-300 text-sm mb-2">
            <strong>{success.teams_created}</strong> team{success.teams_created !== 1 ? 's' : ''} created successfully.
          </p>
          {success.coaches_invited > 0 && (
            <p className="text-gray-400 text-sm mb-4">
              {success.coaches_invited} coach{success.coaches_invited !== 1 ? 'es' : ''} will receive an email invitation.
            </p>
          )}
          <button
            onClick={() => { window.history.replaceState({}, '', window.location.pathname); onDone(); }}
            className={btnPrimary + ' w-full mt-4'}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-gray-400 text-sm">Loading registration form…</div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
      <div className="bg-gray-800 rounded-lg shadow-card p-6 sm:p-8 w-full max-w-2xl border-t-4 border-baseball-600">
        <h1 className="font-heading text-2xl font-bold mb-1 tracking-wide text-blue-300">⚾ Team Registration</h1>
        <p className="text-gray-400 mb-6 text-sm">Register your organization and teams with ZVBL</p>

        {/* Progress steps */}
        <div className="flex items-center gap-1 mb-6">
          {['Your Info', 'Organization', 'Teams', 'Review'].map((label, i) => (
            <div key={label} className="flex-1 flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                step > i + 1 ? 'bg-green-600 text-white' :
                step === i + 1 ? 'bg-blue-600 text-white' :
                'bg-gray-700 text-gray-400'
              }`}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] uppercase tracking-wide font-semibold ${
                step === i + 1 ? 'text-blue-300' : 'text-gray-500'
              }`}>{label}</span>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>
        )}

        {/* Step 1: Director Info */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Full Name *</label>
                <input type="text" value={director.name} onChange={e => setDirector(d => ({ ...d, name: e.target.value }))}
                  placeholder="John Smith" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email Address *</label>
                <input type="email" value={director.email} onChange={e => setDirector(d => ({ ...d, email: e.target.value }))}
                  placeholder="john@example.com" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input type="tel" value={director.phone} onChange={e => setDirector(d => ({ ...d, phone: e.target.value }))}
                placeholder="(555) 123-4567" className={inputCls} />
            </div>
            <div className="border-t border-gray-700 pt-4 mt-4">
              <p className="text-xs text-gray-400 mb-3">Create your login credentials</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Username *</label>
                  <input type="text" value={director.username} onChange={e => setDirector(d => ({ ...d, username: e.target.value }))}
                    placeholder="jsmith" autoComplete="username" className={inputCls} />
                </div>
                <div className="hidden sm:block" /> {/* spacer */}
                <div>
                  <label className={labelCls}>Password *</label>
                  <input type="password" value={director.password} onChange={e => setDirector(d => ({ ...d, password: e.target.value }))}
                    placeholder="At least 8 characters" autoComplete="new-password" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Confirm Password *</label>
                  <input type="password" value={director.confirmPassword} onChange={e => setDirector(d => ({ ...d, confirmPassword: e.target.value }))}
                    placeholder="Repeat password" autoComplete="new-password" className={inputCls} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Organization */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOrgMode('existing')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  orgMode === 'existing' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Join Existing Organization
              </button>
              <button
                type="button"
                onClick={() => setOrgMode('new')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  orgMode === 'new' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Create New Organization
              </button>
            </div>

            {orgMode === 'existing' ? (
              <div>
                <label className={labelCls}>Select Organization *</label>
                <select value={orgId} onChange={e => setOrgId(e.target.value)} className={inputCls}>
                  <option value="">— Choose an organization —</option>
                  {config?.organizations?.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.name}{o.city ? ` (${o.city}${o.state ? ', ' + o.state : ''})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Organization Name *</label>
                  <input type="text" value={newOrg.name} onChange={e => setNewOrg(o => ({ ...o, name: e.target.value }))}
                    placeholder="Springfield Baseball Club" className={inputCls} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>City</label>
                    <input type="text" value={newOrg.city} onChange={e => setNewOrg(o => ({ ...o, city: e.target.value }))}
                      placeholder="Springfield" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>State</label>
                    <input type="text" value={newOrg.state} onChange={e => setNewOrg(o => ({ ...o, state: e.target.value }))}
                      placeholder="IL" maxLength={2} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Contact Name</label>
                    <input type="text" value={newOrg.contact_name} onChange={e => setNewOrg(o => ({ ...o, contact_name: e.target.value }))}
                      placeholder="Director name" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Contact Email</label>
                    <input type="email" value={newOrg.contact_email} onChange={e => setNewOrg(o => ({ ...o, contact_email: e.target.value }))}
                      placeholder="org@example.com" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Contact Phone</label>
                    <input type="tel" value={newOrg.contact_phone} onChange={e => setNewOrg(o => ({ ...o, contact_phone: e.target.value }))}
                      placeholder="(555) 123-4567" className={inputCls} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Teams */}
        {step === 3 && (
          <div className="space-y-4">
            {teams.map((team, i) => (
              <div key={i} className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-200">Team {i + 1}</h3>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => duplicateTeam(i)} className={btnSecondary + ' !px-2 !py-1 !text-xs'} title="Duplicate team">
                      Copy
                    </button>
                    {teams.length > 1 && (
                      <button type="button" onClick={() => removeTeam(i)} className={btnDanger} title="Remove team">
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>City *</label>
                    <input type="text" value={team.team_city} onChange={e => updateTeam(i, 'team_city', e.target.value)}
                      placeholder="Springfield" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Mascot</label>
                    <input type="text" value={team.team_mascot} onChange={e => updateTeam(i, 'team_mascot', e.target.value)}
                      placeholder="Eagles" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Color</label>
                    <input type="text" value={team.team_color} onChange={e => updateTeam(i, 'team_color', e.target.value)}
                      placeholder="Red" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Age Group *</label>
                    <select value={team.age_group} onChange={e => updateTeam(i, 'age_group', e.target.value)} className={inputCls}>
                      <option value="">— Select —</option>
                      {config?.age_groups?.map(ag => (
                        <option key={ag.id} value={ag.name}>{ag.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Level</label>
                    <select value={team.level} onChange={e => updateTeam(i, 'level', e.target.value)} className={inputCls}>
                      <option value="">— Select —</option>
                      {config?.levels?.map(l => (
                        <option key={l.id} value={l.name}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className={labelCls}>Primary</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={team.primary_color} onChange={e => updateTeam(i, 'primary_color', e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
                        <span className="text-xs text-gray-400">{team.primary_color}</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className={labelCls}>Secondary</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={team.secondary_color} onChange={e => updateTeam(i, 'secondary_color', e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
                        <span className="text-xs text-gray-400">{team.secondary_color}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coach info */}
                <div className="border-t border-gray-700 pt-3 mt-2">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-2">Coach / Manager Contact</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Name</label>
                      <input type="text" value={team.coach_name} onChange={e => updateTeam(i, 'coach_name', e.target.value)}
                        placeholder="Coach name" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Email</label>
                      <input type="email" value={team.coach_email} onChange={e => updateTeam(i, 'coach_email', e.target.value)}
                        placeholder="coach@example.com" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Phone</label>
                      <input type="tel" value={team.coach_phone} onChange={e => updateTeam(i, 'coach_phone', e.target.value)}
                        placeholder="(555) 123-4567" className={inputCls} />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">If an email is provided, the coach will receive a login invitation and be assigned as team manager.</p>
                </div>
              </div>
            ))}

            <button type="button" onClick={addTeam}
              className="w-full py-2 border-2 border-dashed border-gray-600 rounded-lg text-sm font-semibold text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors">
              + Add Another Team
            </button>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-4 text-sm">
            {/* Director summary */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Your Information</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300">
                <span className="text-gray-500">Name:</span><span>{director.name}</span>
                <span className="text-gray-500">Email:</span><span>{director.email}</span>
                <span className="text-gray-500">Username:</span><span>{director.username}</span>
                {director.phone && <><span className="text-gray-500">Phone:</span><span>{director.phone}</span></>}
              </div>
            </div>

            {/* Org summary */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Organization</h3>
              {orgMode === 'existing' ? (
                <p className="text-gray-300">{config?.organizations?.find(o => o.id === Number(orgId))?.name || '—'}</p>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300">
                  <span className="text-gray-500">Name:</span><span>{newOrg.name}</span>
                  {newOrg.city && <><span className="text-gray-500">City:</span><span>{newOrg.city}</span></>}
                  {newOrg.state && <><span className="text-gray-500">State:</span><span>{newOrg.state}</span></>}
                </div>
              )}
            </div>

            {/* Teams summary */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">
                Teams ({teams.length})
              </h3>
              <div className="space-y-3">
                {teams.map((t, i) => {
                  const teamName = [t.team_city, t.team_color, t.age_group, t.level].filter(Boolean).join(' ');
                  return (
                    <div key={i} className="flex items-start justify-between border-b border-gray-700 pb-2 last:border-0 last:pb-0">
                      <div>
                        <p className="text-gray-200 font-semibold">{teamName || `Team ${i + 1}`}</p>
                        {t.team_mascot && <p className="text-xs text-gray-400">Mascot: {t.team_mascot}</p>}
                        {t.coach_name && <p className="text-xs text-gray-400">Coach: {t.coach_name} {t.coach_email ? `(${t.coach_email})` : ''}</p>}
                      </div>
                      <div className="flex gap-1">
                        <span className="w-5 h-5 rounded-full border border-gray-600" style={{ backgroundColor: t.primary_color }} />
                        <span className="w-5 h-5 rounded-full border border-gray-600" style={{ backgroundColor: t.secondary_color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {teams.some(t => t.coach_email && t.coach_email.toLowerCase() !== director.email.toLowerCase()) && (
              <div className="bg-blue-900/20 border border-blue-800/40 rounded-lg px-3 py-2 text-xs text-blue-300">
                Coaches with email addresses will receive a login invitation with temporary credentials.
              </div>
            )}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-700">
          <div>
            {step > 1 ? (
              <button type="button" onClick={handleBack} className={btnSecondary}>
                ← Back
              </button>
            ) : (
              <button type="button" onClick={onDone} className={btnSecondary + ' !text-gray-400'}>
                ← Cancel
              </button>
            )}
          </div>
          <div>
            {step < 4 ? (
              <button type="button" onClick={handleNext} className={btnPrimary}>
                Next →
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={submitting} className={btnPrimary}>
                {submitting ? 'Registering…' : 'Submit Registration'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
