import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { forgotPassword, fetchOrganizations } from '../api/index.js';

const inputCls = "w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1";

export default function Login({ onResetPassword }) {
  const { login, register, registerUmpire, loading, error } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'register-umpire' | 'forgot'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [isCertified, setIsCertified] = useState(false);
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [orgId, setOrgId] = useState('');
  const [organizations, setOrganizations] = useState([]);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // Load organizations when switching to umpire register mode
  const handleUmpireMode = async () => {
    setMode('register-umpire');
    try {
      const orgs = await fetchOrganizations();
      setOrganizations(orgs);
    } catch (err) {
      console.error('Failed to fetch organizations:', err);
    }
  };

  async function handleLogin(e) {
    e.preventDefault();
    try { await login(username, password); } catch { /* context sets error */ }
  }

  async function handleRegister(e) {
    e.preventDefault();
    try { await register(username, password, name, email); } catch { /* context sets error */ }
  }

  async function handleRegisterUmpire(e) {
    e.preventDefault();
    try { await registerUmpire(username, password, name, email, phone || null, orgId || null, dateOfBirth || null, isCertified, yearsOfExperience ? parseInt(yearsOfExperience) : null); } catch { /* context sets error */ }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setForgotLoading(true); setForgotMsg('');
    try {
      const result = await forgotPassword(forgotEmail);
      setForgotMsg(result.message || 'If that email exists, a reset link has been sent.');
    } catch (err) { setForgotMsg(err.message); }
    finally { setForgotLoading(false); }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
      <div className="bg-gray-800 rounded-lg shadow-card p-8 w-full max-w-md border-t-4 border-baseball-600">
        <h1 className="font-heading text-3xl font-bold mb-1 tracking-wide text-blue-300">⚾ ZVBL</h1>
        <p className="text-gray-400 mb-6 text-sm">
          {mode === 'login' ? 'Sign in to manage your team' : mode === 'register' ? 'Create your account' : mode === 'register-umpire' ? 'Register as an umpire' : 'Reset your password'}
        </p>

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="username" className={labelCls}>Username or Email</label>
              <input id="username" type="text" value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your username or email" required autoComplete="username"
                className={inputCls} />
            </div>
            <div>
              <label htmlFor="password" className={labelCls}>Password</label>
              <input id="password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password" required autoComplete="current-password"
                className={inputCls} />
            </div>
            {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <div className="flex justify-between text-sm">
              <button type="button" onClick={() => { setMode('forgot'); setForgotMsg(''); }} className="text-blue-400 hover:underline">
                Forgot password?
              </button>
              <div className="flex gap-2 text-sm">
                <button type="button" onClick={() => setMode('register')} className="text-blue-400 hover:underline">
                  Create account
                </button>
                <span className="text-gray-400">•</span>
                <button type="button" onClick={handleUmpireMode} className="text-green-400 hover:underline">
                  Umpire signup
                </button>
                <span className="text-gray-400">•</span>
                <button type="button" onClick={() => { window.location.href = '?register'; }} className="text-amber-400 hover:underline">
                  Register teams
                </button>
              </div>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-name" className={labelCls}>Full Name</label>
                <input id="reg-name" type="text" value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe" required className={inputCls} />
              </div>
              <div>
                <label htmlFor="reg-email" className={labelCls}>Email</label>
                <input id="reg-email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" required className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="reg-username" className={labelCls}>Username</label>
              <input id="reg-username" type="text" value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username" required autoComplete="username"
                className={inputCls} />
            </div>
            <div>
              <label htmlFor="reg-password" className={labelCls}>Password</label>
              <input id="reg-password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8+ chars, upper, lower, number" required minLength={8} autoComplete="new-password"
                className={inputCls} />
              <p className="text-xs text-gray-500 mt-1">At least 8 characters with uppercase, lowercase, and a number</p>
            </div>
            {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm">
              {loading ? 'Creating account…' : 'Register'}
            </button>
            <p className="text-xs text-gray-400 text-center">
              You'll start as a Score Reporter. An admin will assign your team permissions.
            </p>
            <button type="button" onClick={() => setMode('login')} className="w-full text-center text-sm text-blue-400 hover:underline">
              Already have an account? Sign in
            </button>
          </form>
        )}

        {mode === 'register-umpire' && (
          <form onSubmit={handleRegisterUmpire} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ump-name" className={labelCls}>Full Name</label>
                <input id="ump-name" type="text" value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe" required className={inputCls} />
              </div>
              <div>
                <label htmlFor="ump-email" className={labelCls}>Email</label>
                <input id="ump-email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" required className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="ump-phone" className={labelCls}>Phone</label>
              <input id="ump-phone" type="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567" className={inputCls} />
            </div>
            <div>
              <label htmlFor="ump-org" className={labelCls}>Organization (Optional)</label>
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)}
                className={inputCls}>
                <option value="">Select an organization...</option>
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ump-dob" className={labelCls}>Date of Birth</label>
                <input id="ump-dob" type="date" value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className={inputCls} />
              </div>
              <div>
                <label htmlFor="ump-exp" className={labelCls}>Years of Experience</label>
                <input id="ump-exp" type="number" min="0" max="99" value={yearsOfExperience}
                  onChange={(e) => setYearsOfExperience(e.target.value)}
                  placeholder="0" className={inputCls} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input id="ump-certified" type="checkbox" checked={isCertified}
                onChange={(e) => setIsCertified(e.target.checked)}
                className="w-4 h-4 bg-gray-900 border border-gray-600 rounded cursor-pointer" />
              <label htmlFor="ump-certified" className="text-sm text-gray-300 cursor-pointer">
                I am certified
              </label>
            </div>
            <div>
              <label htmlFor="ump-username" className={labelCls}>Username</label>
              <input id="ump-username" type="text" value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username" required autoComplete="username"
                className={inputCls} />
            </div>
            <div>
              <label htmlFor="ump-password" className={labelCls}>Password</label>
              <input id="ump-password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8+ chars, upper, lower, number" required minLength={8} autoComplete="new-password"
                className={inputCls} />
              <p className="text-xs text-gray-500 mt-1">At least 8 characters with uppercase, lowercase, and a number</p>
            </div>
            {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm">
              {loading ? 'Creating account…' : 'Register as Umpire'}
            </button>
            <p className="text-xs text-gray-400 text-center">
              You'll be able to view games and express interest in umping opportunities.
            </p>
            <button type="button" onClick={() => setMode('login')} className="w-full text-center text-sm text-blue-400 hover:underline">
              Already have an account? Sign in
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className={labelCls}>Email Address</label>
              <input id="forgot-email" type="email" value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com" required className={inputCls} />
            </div>
            {forgotMsg && (
              <div className="bg-blue-900/30 text-blue-400 text-sm px-3 py-2 rounded-lg">{forgotMsg}</div>
            )}
            <button type="submit" disabled={forgotLoading}
              className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm">
              {forgotLoading ? 'Sending…' : 'Send Reset Link'}
            </button>
            <button type="button" onClick={() => setMode('login')} className="w-full text-center text-sm text-blue-400 hover:underline">
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
