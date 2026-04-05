import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login, loading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await login(username, password);
    } catch {
      // error is set in context
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-md border-t-4 border-baseball-600">
        <h1 className="font-heading text-3xl font-bold mb-1 tracking-wide text-blue-800">⚾ ZVBL</h1>
        <p className="text-gray-500 mb-6 text-sm">Sign in to manage your team rosters</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Username</label>
            <input
              id="username" type="text" value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username" required autoComplete="username"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Password</label>
            <input
              id="password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password" required autoComplete="current-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600"
            />
          </div>

          {error && <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-blue-800 text-white font-semibold rounded-lg hover:bg-blue-900 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
