import { useState, useEffect } from 'react';
import { fetchRegistrationConfig, registerDirector, registerCoach, register, registerAsUmpire, resendConfirmation } from '../api/index.js';
import { formatDOB } from '../utils/dob.js';

const inputCls = "lh-input";
const labelCls = "eyebrow block mb-1";
const btnPrimary = "btn btn-primary btn-md disabled:opacity-60 disabled:cursor-not-allowed";
const btnSecondary = "btn btn-secondary btn-md";
const btnDanger = "btn btn-danger btn-sm";

const EMPTY_TEAM = {
  team_city: '', team_mascot: '', team_color: '', age_group: '', level: '',
  primary_color: '#003366', secondary_color: '#CC0000',
  coach_name: '', coach_email: '', coach_phone: '',
};

const ROLE_OPTIONS = [
  { key: 'coach', label: 'Coach / Team Manager', desc: 'I coach or manage a team', icon: '⚾', accent: 'blue' },
  { key: 'director', label: 'Travel Director / Org Admin', desc: 'I manage an organization with multiple teams', icon: '★', accent: 'amber' },
  { key: 'scorekeeper', label: 'Scorekeeper', desc: 'I report game scores for my assigned teams', icon: '✎', accent: 'green' },
  { key: 'umpire', label: 'Umpire', desc: 'I officiate games and manage my availability', icon: '⚖', accent: 'purple' },
];

const STEP_MAP = {
  director:    ['role', 'info', 'org', 'teams', 'review'],
  coach:       ['role', 'info', 'coach-team', 'review'],
  scorekeeper: ['role', 'info', 'scorekeeper-teams', 'review'],
  umpire:      ['role', 'info', 'umpire-details', 'review'],
};

const STEP_LABELS = {
  director:    ['Role', 'Your Info', 'Organization', 'Teams', 'Review'],
  coach:       ['Role', 'Your Info', 'Your Team', 'Review'],
  scorekeeper: ['Role', 'Your Info', 'Teams', 'Review'],
  umpire:      ['Role', 'Your Info', 'Details', 'Review'],
};

export default function TeamRegistration({ onDone }) {
  const [role, setRole] = useState(null);
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Common user info (all roles)
  const [userInfo, setUserInfo] = useState({
    name: '', email: '', phone: '', username: '', password: '', confirmPassword: '',
  });

  // Director: Organization
  const [orgMode, setOrgMode] = useState('existing');
  const [orgId, setOrgId] = useState('');
  const [newOrg, setNewOrg] = useState({
    name: '', city: '', state: '', contact_name: '', contact_email: '', contact_phone: '',
  });

  // Director: Teams (array) / Coach: single team (teams[0])
  const [teams, setTeams] = useState([{ ...EMPTY_TEAM }]);
  const [directorSkipTeams, setDirectorSkipTeams] = useState(false);

  // Coach: selected org + team mode
  const [coachOrgId, setCoachOrgId] = useState('');
  const [coachTeamMode, setCoachTeamMode] = useState('existing');
  const [coachTeamId, setCoachTeamId] = useState('');

  // Umpire-specific
  const [umpire, setUmpire] = useState({
    org_ids: [], date_of_birth: '', is_certified: false, years_of_experience: '',
  });

  // Scorekeeper: selected team IDs
  const [scorekeeperTeamIds, setScorekeeperTeamIds] = useState([]);

  useEffect(() => {
    fetchRegistrationConfig()
      .then(setConfig)
      .catch(() => setError('Failed to load configuration'))
      .finally(() => setLoading(false));
  }, []);

  const currentStepKey = role ? STEP_MAP[role]?.[step - 1] : 'role';
  const stepLabels = role ? STEP_LABELS[role] : ['Role'];
  const totalSteps = stepLabels.length;

  // ── Validation ──
  function validateInfo() {
    const u = userInfo;
    if (!u.name.trim()) return 'Full name is required';
    if (!u.email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) return 'Invalid email address';
    if (!u.username.trim()) return 'Username is required';
    if (u.username.length < 3) return 'Username must be at least 3 characters';
    if (!u.password) return 'Password is required';
    if (u.password.length < 8) return 'Password must be at least 8 characters';
    if (u.password !== u.confirmPassword) return 'Passwords do not match';
    return null;
  }

  function validateOrg() {
    if (orgMode === 'existing' && !orgId) return 'Please select an organization';
    if (orgMode === 'new' && !newOrg.name.trim()) return 'Organization name is required';
    return null;
  }

  function validateTeams() {
    if (directorSkipTeams) return null;
    for (let i = 0; i < teams.length; i++) {
      if (!teams[i].team_city.trim()) return `Team ${i + 1}: city is required`;
      if (!teams[i].age_group) return `Team ${i + 1}: age group is required`;
      if (teams[i].coach_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teams[i].coach_email)) {
        return `Team ${i + 1}: invalid coach email`;
      }
    }
    return null;
  }

  function validateCoachTeam() {
    if (!coachOrgId) return 'Please select an organization';
    if (coachTeamMode === 'existing') {
      if (!coachTeamId) return 'Please select a team';
    } else {
      const t = teams[0];
      if (!t.team_city.trim()) return 'Team city is required';
      if (!t.age_group) return 'Age group is required';
    }
    return null;
  }

  function validateUmpireDetails() {
    if (!umpire.org_ids.length) return 'Please select at least one organization';
    return null;
  }

  function validateScorekeeperTeams() {
    if (!scorekeeperTeamIds.length) return 'Please select at least one team';
    return null;
  }

  function validateCurrentStep() {
    switch (currentStepKey) {
      case 'role': return role ? null : 'Please select a role';
      case 'info': return validateInfo();
      case 'org': return validateOrg();
      case 'teams': return validateTeams();
      case 'coach-team': return validateCoachTeam();
      case 'umpire-details': return validateUmpireDetails();
      case 'scorekeeper-teams': return validateScorekeeperTeams();
      case 'review': return null;
      default: return null;
    }
  }

  function handleNext() {
    const err = validateCurrentStep();
    if (err) { setError(err); return; }
    setError(null);
    setStep(step + 1);
  }

  function handleBack() {
    setError(null);
    if (step === 2 && role) {
      // Going back from info to role selection
      setStep(1);
    } else {
      setStep(step - 1);
    }
  }

  // Reset to role selection (keeps user info)
  function handleChangeRole() {
    setRole(null);
    setStep(1);
    setError(null);
  }

  function selectRole(r) {
    setRole(r);
    setError(null);
    // Auto-advance to step 2 (info)
    setStep(2);
  }

  // ── Team helpers ──
  function updateTeam(index, field, value) {
    setTeams(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  }
  function addTeam() { setTeams(prev => [...prev, { ...EMPTY_TEAM }]); }
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
    setError(null);
    setSubmitting(true);

    try {
      let result;

      if (role === 'director') {
        result = await registerDirector({
          director: {
            username: userInfo.username.trim(),
            password: userInfo.password,
            name: userInfo.name.trim(),
            email: userInfo.email.trim().toLowerCase(),
            phone: userInfo.phone.trim() || null,
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
          teams: directorSkipTeams ? [] : teams.map(t => ({
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
        });
      } else if (role === 'coach') {
        const payload = {
          username: userInfo.username.trim(),
          password: userInfo.password,
          name: userInfo.name.trim(),
          email: userInfo.email.trim().toLowerCase(),
          phone: userInfo.phone.trim() || null,
          org_id: Number(coachOrgId),
        };
        if (coachTeamMode === 'existing') {
          payload.team_id = Number(coachTeamId);
        } else {
          const t = teams[0];
          payload.team = {
            team_city: t.team_city.trim(),
            team_mascot: t.team_mascot.trim() || null,
            team_color: t.team_color.trim() || null,
            age_group: t.age_group,
            level: t.level || null,
            primary_color: t.primary_color || null,
            secondary_color: t.secondary_color || null,
          };
        }
        result = await registerCoach(payload);
      } else if (role === 'scorekeeper') {
        result = await register(
          userInfo.username.trim(),
          userInfo.password,
          userInfo.name.trim(),
          userInfo.email.trim().toLowerCase(),
          scorekeeperTeamIds,
        );
      } else if (role === 'umpire') {
        result = await registerAsUmpire(
          userInfo.username.trim(),
          userInfo.password,
          userInfo.name.trim(),
          userInfo.email.trim().toLowerCase(),
          userInfo.phone.trim() || null,
          umpire.org_ids.map(Number),
          umpire.date_of_birth || null,
          umpire.is_certified,
          umpire.years_of_experience ? parseInt(umpire.years_of_experience) : null,
        );
      }

      // Do NOT auto-login — user must confirm email first
      setSuccess({ role, ...result });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ═══════════════ Success Screen ═══════════════
  if (success) {
    const extraInfo = {
      director: success.teams_created ? (
        <>
          <p className="text-gray-300 text-sm mb-2">
            <strong>{success.teams_created}</strong> team{success.teams_created !== 1 ? 's' : ''} created.
          </p>
          {success.coaches_invited > 0 && (
            <p className="text-gray-400 text-sm mb-2">
              {success.coaches_invited} coach{success.coaches_invited !== 1 ? 'es' : ''} will receive an invitation.
            </p>
          )}
        </>
      ) : null,
      coach: success.team_name ? (
        <p className="text-gray-300 text-sm mb-2">
          Your team <strong>{success.team_name}</strong> has been registered under <strong>{success.org_name}</strong>.
        </p>
      ) : null,
    };

    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
        <div className="bg-gray-800 rounded-lg shadow-card p-8 w-full max-w-md border-t-4 border-blue-600 text-center">
          <div className="text-4xl mb-4">📧</div>
          <h2 className="font-heading text-2xl font-bold text-blue-300 mb-3">Check Your Email</h2>
          {extraInfo[success.role]}
          <p className="text-gray-300 text-sm mb-4">
            We've sent a confirmation link to <strong className="text-gray-100">{userInfo.email}</strong>. Please click the link to activate your account.
          </p>
          <p className="text-gray-500 text-xs mb-6">
            Didn't receive it? Check your spam folder or click below to resend.
          </p>
          <button
            onClick={async () => {
              try {
                await resendConfirmation(userInfo.email.trim().toLowerCase());
                setError(null);
                alert('Confirmation email resent!');
              } catch (err) {
                setError(err.message);
              }
            }}
            className={btnSecondary + ' w-full mb-3'}
          >
            Resend Confirmation Email
          </button>
          <button
            onClick={() => { window.history.replaceState({}, '', window.location.pathname); onDone(); }}
            className="w-full text-center text-sm text-blue-400 hover:underline"
          >
            ← Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════ Loading ═══════════════
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    );
  }

  // ═══════════════ Team Card (shared between coach and director) ═══════════════
  function renderTeamCard(team, index, { showHeader = true, showCoachFields = false, showActions = false } = {}) {
    return (
      <div key={index} className="bg-gray-900 border border-gray-700 rounded-lg p-4">
        {showHeader && (
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-200">Team {index + 1}</h3>
            {showActions && (
              <div className="flex gap-1.5">
                <button type="button" onClick={() => duplicateTeam(index)} className={btnSecondary + ' !px-2 !py-1 !text-xs'}>Copy</button>
                {teams.length > 1 && (
                  <button type="button" onClick={() => removeTeam(index)} className={btnDanger}>Remove</button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className={labelCls}>City *</label>
            <input type="text" value={team.team_city} onChange={e => updateTeam(index, 'team_city', e.target.value)}
              placeholder="Springfield" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Mascot</label>
            <input type="text" value={team.team_mascot} onChange={e => updateTeam(index, 'team_mascot', e.target.value)}
              placeholder="Eagles" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Color</label>
            <input type="text" value={team.team_color} onChange={e => updateTeam(index, 'team_color', e.target.value)}
              placeholder="Red" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Age Group *</label>
            <select value={team.age_group} onChange={e => updateTeam(index, 'age_group', e.target.value)} className={inputCls}>
              <option value="">— Select —</option>
              {config?.age_groups?.map(ag => (
                <option key={ag.id} value={ag.name}>{ag.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Level</label>
            <select value={team.level} onChange={e => updateTeam(index, 'level', e.target.value)} className={inputCls}>
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
                <input type="color" value={team.primary_color} onChange={e => updateTeam(index, 'primary_color', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
                <span className="text-xs text-gray-400">{team.primary_color}</span>
              </div>
            </div>
            <div className="flex-1">
              <label className={labelCls}>Secondary</label>
              <div className="flex items-center gap-2">
                <input type="color" value={team.secondary_color} onChange={e => updateTeam(index, 'secondary_color', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
                <span className="text-xs text-gray-400">{team.secondary_color}</span>
              </div>
            </div>
          </div>
        </div>

        {showCoachFields && (
          <div className="border-t border-gray-700 pt-3 mt-2">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-2">Coach / Manager Contact</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Name</label>
                <input type="text" value={team.coach_name} onChange={e => updateTeam(index, 'coach_name', e.target.value)}
                  placeholder="Coach name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={team.coach_email} onChange={e => updateTeam(index, 'coach_email', e.target.value)}
                  placeholder="coach@example.com" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input type="tel" value={team.coach_phone} onChange={e => updateTeam(index, 'coach_phone', e.target.value)}
                  placeholder="(555) 123-4567" className={inputCls} />
              </div>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">If an email is provided, the coach will receive a login invitation and be assigned as team manager.</p>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════ Main Render ═══════════════
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
      <div className="bg-gray-800 rounded-lg shadow-card p-6 sm:p-8 w-full max-w-2xl border-t-4 border-baseball-600">
        <h1 className="font-heading text-2xl font-bold mb-1 tracking-wide text-blue-300">⚾ LeagueHaven Registration</h1>
        <p className="text-gray-400 mb-6 text-sm">
          {!role ? 'What best describes your role?' : 'Create your account'}
        </p>

        {/* Progress steps (only show after role is selected) */}
        {role && (
          <div className="flex items-center gap-1 mb-6">
            {stepLabels.map((label, i) => (
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
        )}

        {error && (
          <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>
        )}

        {/* ─── Role Selection ─── */}
        {currentStepKey === 'role' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ROLE_OPTIONS.map(r => {
              const accents = {
                blue:   { border: 'border-blue-500', bg: 'bg-blue-900/20', text: 'text-blue-300' },
                amber:  { border: 'border-amber-500', bg: 'bg-amber-900/20', text: 'text-amber-300' },
                green:  { border: 'border-green-500', bg: 'bg-green-900/20', text: 'text-green-300' },
                purple: { border: 'border-purple-500', bg: 'bg-purple-900/20', text: 'text-purple-300' },
              };
              const a = accents[r.accent];
              return (
                <button
                  key={r.key}
                  onClick={() => selectRole(r.key)}
                  className={`text-left border-2 rounded-xl p-4 transition-all duration-150 hover:scale-[1.02] ${
                    role === r.key ? `${a.border} ${a.bg}` : 'border-gray-700 hover:border-gray-500 bg-gray-900'
                  }`}
                >
                  <div className="text-2xl mb-2">{r.icon}</div>
                  <h3 className={`font-bold text-sm mb-1 ${role === r.key ? a.text : 'text-gray-200'}`}>{r.label}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">{r.desc}</p>
                </button>
              );
            })}
          </div>
        )}

        {/* ─── Your Info (all roles) ─── */}
        {currentStepKey === 'info' && (
          <div className="space-y-4">
            {/* Role badge */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Registering as: <strong className="text-gray-300">{ROLE_OPTIONS.find(r => r.key === role)?.label}</strong>
              </span>
              <button type="button" onClick={handleChangeRole} className="text-xs text-blue-400 hover:underline">Change</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Full Name *</label>
                <input type="text" value={userInfo.name} onChange={e => setUserInfo(u => ({ ...u, name: e.target.value }))}
                  placeholder="John Smith" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email Address *</label>
                <input type="email" value={userInfo.email} onChange={e => setUserInfo(u => ({ ...u, email: e.target.value }))}
                  placeholder="john@example.com" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input type="tel" value={userInfo.phone} onChange={e => setUserInfo(u => ({ ...u, phone: e.target.value }))}
                placeholder="(555) 123-4567" className={inputCls} />
            </div>
            <div className="border-t border-gray-700 pt-4 mt-4">
              <p className="text-xs text-gray-400 mb-3">Create your login credentials</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Username *</label>
                  <input type="text" value={userInfo.username} onChange={e => setUserInfo(u => ({ ...u, username: e.target.value }))}
                    placeholder="jsmith" autoComplete="username" className={inputCls} />
                </div>
                <div className="hidden sm:block" />
                <div>
                  <label className={labelCls}>Password *</label>
                  <input type="password" value={userInfo.password} onChange={e => setUserInfo(u => ({ ...u, password: e.target.value }))}
                    placeholder="At least 8 characters" autoComplete="new-password" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Confirm Password *</label>
                  <input type="password" value={userInfo.confirmPassword} onChange={e => setUserInfo(u => ({ ...u, confirmPassword: e.target.value }))}
                    placeholder="Repeat password" autoComplete="new-password" className={inputCls} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Director: Organization ─── */}
        {currentStepKey === 'org' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button type="button" onClick={() => setOrgMode('existing')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  orgMode === 'existing' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}>
                Join Existing Organization
              </button>
              <button type="button" onClick={() => setOrgMode('new')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  orgMode === 'new' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}>
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

        {/* ─── Director: Teams ─── */}
        {currentStepKey === 'teams' && (
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
              <input
                type="checkbox"
                checked={directorSkipTeams}
                onChange={(e) => setDirectorSkipTeams(e.target.checked)}
                className="w-4 h-4 bg-gray-900 border border-gray-600 rounded"
              />
              <span className="text-sm text-gray-300">I don't have teams to register yet (skip for now)</span>
            </label>

            {directorSkipTeams ? (
              <p className="text-xs text-gray-400 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
                You can complete org admin registration now and add teams later from the Teams page.
              </p>
            ) : (
              <>
                {teams.map((team, i) => renderTeamCard(team, i, { showCoachFields: true, showActions: true }))}
                <button type="button" onClick={addTeam}
                  className="w-full py-2 border-2 border-dashed border-gray-600 rounded-lg text-sm font-semibold text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors">
                  + Add Another Team
                </button>
              </>
            )}
          </div>
        )}

        {/* ─── Coach: Org + Team ─── */}
        {currentStepKey === 'coach-team' && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Organization *</label>
              <select value={coachOrgId} onChange={e => { setCoachOrgId(e.target.value); setCoachTeamId(''); }} className={inputCls}>
                <option value="">— Select your organization —</option>
                {config?.organizations?.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.name}{o.city ? ` (${o.city}${o.state ? ', ' + o.state : ''})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-500 mt-1">Select the organization your team plays under. Contact a league admin if your organization is not listed.</p>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => setCoachTeamMode('existing')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  coachTeamMode === 'existing' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}>
                Join Existing Team
              </button>
              <button type="button" onClick={() => setCoachTeamMode('new')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  coachTeamMode === 'new' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}>
                Create New Team
              </button>
            </div>

            {coachTeamMode === 'existing' ? (
              <div>
                <label className={labelCls}>Select Team *</label>
                <select value={coachTeamId} onChange={e => setCoachTeamId(e.target.value)} className={inputCls}>
                  <option value="">— Choose a team —</option>
                  {(config?.teams?.filter(t => t.org_id === Number(coachOrgId)) || []).map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.age_group ? ` (${t.age_group})` : ''}
                    </option>
                  ))}
                </select>
                {coachOrgId && !(config?.teams?.filter(t => t.org_id === Number(coachOrgId)) || []).length && (
                  <p className="text-[10px] text-amber-400 mt-1">No teams found for this organization. Switch to "Create New Team" to register one.</p>
                )}
              </div>
            ) : (
              renderTeamCard(teams[0], 0, { showHeader: false, showCoachFields: false, showActions: false })
            )}
          </div>
        )}

        {/* ─── Umpire: Details ─── */}
        {currentStepKey === 'umpire-details' && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Organizations *</label>
              <p className="text-[10px] text-gray-500 mb-2">Select the organization(s) you want to umpire for.</p>
              <div className="space-y-1 max-h-48 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg p-2">
                {config?.organizations?.map(o => (
                  <label key={o.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 cursor-pointer">
                    <input type="checkbox" checked={umpire.org_ids.includes(String(o.id))}
                      onChange={e => {
                        setUmpire(u => ({
                          ...u,
                          org_ids: e.target.checked
                            ? [...u.org_ids, String(o.id)]
                            : u.org_ids.filter(id => id !== String(o.id))
                        }));
                      }}
                      className="w-4 h-4 bg-gray-900 border border-gray-600 rounded accent-purple-500" />
                    <span className="text-sm text-gray-200">{o.name}{o.city ? ` (${o.city}${o.state ? ', ' + o.state : ''})` : ''}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Date of Birth</label>
                <input type="date" value={umpire.date_of_birth}
                  onChange={e => setUmpire(u => ({ ...u, date_of_birth: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Years of Experience</label>
                <input type="number" min="0" max="99" value={umpire.years_of_experience}
                  onChange={e => setUmpire(u => ({ ...u, years_of_experience: e.target.value }))}
                  placeholder="0" className={inputCls} />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={umpire.is_certified}
                onChange={e => setUmpire(u => ({ ...u, is_certified: e.target.checked }))}
                className="w-4 h-4 bg-gray-900 border border-gray-600 rounded" />
              <span className="text-sm text-gray-300">I am a certified umpire</span>
            </label>
          </div>
        )}

        {/* ─── Scorekeeper: Team Selection ─── */}
        {currentStepKey === 'scorekeeper-teams' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Select the team(s) you will be keeping score for.</p>
            <div className="space-y-1 max-h-64 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg p-2">
              {config?.organizations?.map(org => {
                const orgTeams = config.teams?.filter(t => t.org_id === org.id) || [];
                if (!orgTeams.length) return null;
                return (
                  <div key={org.id} className="mb-2">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 py-1">{org.name}</div>
                    {orgTeams.map(t => (
                      <label key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 cursor-pointer ml-2">
                        <input type="checkbox" checked={scorekeeperTeamIds.includes(t.id)}
                          onChange={e => {
                            setScorekeeperTeamIds(prev =>
                              e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id)
                            );
                          }}
                          className="w-4 h-4 bg-gray-900 border border-gray-600 rounded accent-green-500" />
                        <span className="text-sm text-gray-200">{t.name}</span>
                        {t.age_group && <span className="text-xs text-gray-500">{t.age_group}</span>}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Review (all roles) ─── */}
        {currentStepKey === 'review' && (
          <div className="space-y-4 text-sm">
            {/* User info summary (all roles) */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Your Information</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300">
                <span className="text-gray-500">Name:</span><span>{userInfo.name}</span>
                <span className="text-gray-500">Email:</span><span>{userInfo.email}</span>
                <span className="text-gray-500">Username:</span><span>{userInfo.username}</span>
                {userInfo.phone && <><span className="text-gray-500">Phone:</span><span>{userInfo.phone}</span></>}
                <span className="text-gray-500">Role:</span>
                <span>{ROLE_OPTIONS.find(r => r.key === role)?.label}</span>
              </div>
            </div>

            {/* Director: Org summary */}
            {role === 'director' && (
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
            )}

            {/* Director: Teams summary */}
            {role === 'director' && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Teams ({teams.length})</h3>
                {directorSkipTeams ? (
                  <p className="text-gray-300 text-sm">No teams will be created right now. You can add teams later.</p>
                ) : (
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
                )}
              </div>
            )}

            {/* Coach: Team summary */}
            {role === 'coach' && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Your Team</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300">
                  <span className="text-gray-500">Organization:</span>
                  <span>{config?.organizations?.find(o => o.id === Number(coachOrgId))?.name || '—'}</span>
                  {coachTeamMode === 'existing' ? (<>
                    <span className="text-gray-500">Team:</span>
                    <span>{config?.teams?.find(t => t.id === Number(coachTeamId))?.name || '—'}</span>
                  </>) : (<>
                    <span className="text-gray-500">Team (new):</span>
                    <span>{[teams[0].team_city, teams[0].team_color, teams[0].age_group, teams[0].level].filter(Boolean).join(' ') || '—'}</span>
                    {teams[0].team_mascot && <><span className="text-gray-500">Mascot:</span><span>{teams[0].team_mascot}</span></>}
                  </>)}
                </div>
                {coachTeamMode === 'new' && (
                  <div className="flex gap-1 mt-2">
                    <span className="w-5 h-5 rounded-full border border-gray-600" style={{ backgroundColor: teams[0].primary_color }} />
                    <span className="w-5 h-5 rounded-full border border-gray-600" style={{ backgroundColor: teams[0].secondary_color }} />
                  </div>
                )}
              </div>
            )}

            {/* Umpire: Details summary */}
            {role === 'umpire' && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Umpire Details</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300">
                  {umpire.org_ids.length > 0 && (
                    <><span className="text-gray-500">Organizations:</span>
                    <span>{umpire.org_ids.map(id => config?.organizations?.find(o => o.id === Number(id))?.name).filter(Boolean).join(', ') || '—'}</span></>
                  )}
                  {umpire.date_of_birth && <><span className="text-gray-500">Date of Birth:</span><span>{formatDOB(umpire.date_of_birth)}</span></>}
                  <span className="text-gray-500">Certified:</span><span>{umpire.is_certified ? 'Yes' : 'No'}</span>
                  {umpire.years_of_experience && <><span className="text-gray-500">Experience:</span><span>{umpire.years_of_experience} years</span></>}
                </div>
              </div>
            )}

            {/* Scorekeeper: Teams summary */}
            {role === 'scorekeeper' && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Selected Teams</h3>
                <div className="space-y-1">
                  {scorekeeperTeamIds.map(id => {
                    const team = config?.teams?.find(t => t.id === id);
                    return team ? (
                      <div key={id} className="text-sm text-gray-300">{team.name}{team.age_group ? ` (${team.age_group})` : ''}</div>
                    ) : null;
                  })}
                </div>
                <p className="text-[10px] text-gray-500 mt-2">Your access will be activated once approved by a coach.</p>
              </div>
            )}

            {/* Director: Coach invitation note */}
            {role === 'director' && teams.some(t => t.coach_email && t.coach_email.toLowerCase() !== userInfo.email.toLowerCase()) && (
              <div className="bg-blue-900/20 border border-blue-800/40 rounded-lg px-3 py-2 text-xs text-blue-300">
                Coaches with email addresses will receive a login invitation with temporary credentials.
              </div>
            )}
          </div>
        )}

        {/* ─── Navigation ─── */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-700">
          <div>
            {step > 1 ? (
              <button type="button" onClick={handleBack} className={btnSecondary}>
                ← Back
              </button>
            ) : (
              <button type="button" onClick={onDone} className={btnSecondary + ' !text-gray-400'}>
                ← Back to Login
              </button>
            )}
          </div>
          <div>
            {currentStepKey === 'role' ? (
              /* Role step has no "Next" — user clicks a card to proceed */
              null
            ) : currentStepKey === 'review' ? (
              <button type="button" onClick={handleSubmit} disabled={submitting} className={btnPrimary}>
                {submitting ? 'Registering…' : 'Submit Registration'}
              </button>
            ) : (
              <button type="button" onClick={handleNext} className={btnPrimary}>
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
