import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input } from './ui';

/**
 * Inline registration form for parents/guardians.
 * Registers with role=guardian (approved immediately, no team permissions).
 * After registration the AuthContext logs them in automatically.
 */
export default function GuardianRegister({ onBack }) {
  const { registerGuardian } = useAuth();
  const [form, setForm] = useState({ username: '', password: '', name: '', email: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await registerGuardian(form.username, form.password, form.name, form.email);
      // AuthContext sets auth state → App re-renders → user lands on GuardianHome
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-400">
        Create a parent/guardian account. You'll be able to search for your child and submit a claim request.
      </p>

      <Input
        label="Full Name"
        id="g-name"
        type="text"
        value={form.name}
        onChange={(e) => setField('name', e.target.value)}
        placeholder="Your full name"
        required
        autoComplete="name"
      />
      <Input
        label="Email"
        id="g-email"
        type="email"
        value={form.email}
        onChange={(e) => setField('email', e.target.value)}
        placeholder="you@example.com"
        required
        autoComplete="email"
      />
      <Input
        label="Username"
        id="g-username"
        type="text"
        value={form.username}
        onChange={(e) => setField('username', e.target.value)}
        placeholder="Choose a username"
        required
        autoComplete="username"
      />
      <div className="relative">
        <Input
          label="Password"
          id="g-password"
          type={showPassword ? 'text' : 'password'}
          value={form.password}
          onChange={(e) => setField('password', e.target.value)}
          placeholder="At least 8 characters"
          required
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-200 text-sm"
          tabIndex={-1}
        >
          {showPassword ? '🙈' : '👁️'}
        </button>
      </div>

      {error && <div className="lh-alert lh-alert-error">{error}</div>}

      <Button type="submit" size="sm" loading={loading} className="w-full">
        {loading ? 'Creating account…' : 'Create Guardian Account'}
      </Button>
      <Button variant="ghost" size="sm" onClick={onBack} className="w-full">
        ← Back to sign in
      </Button>
    </form>
  );
}
