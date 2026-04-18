import { useEffect, useState } from 'react';
import { fetchMe, fetchNotificationPrefs, updateNotificationPrefs, sendTestPush } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { UserIcon, UsersIcon, BuildingIcon, CogIcon, BellIcon } from './ui/icons.jsx';
import { usePushNotifications } from '../hooks/usePushNotifications.js';
import { Button, Card, CardBody, CardHeader, Badge } from './ui';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  org_admin: 'Organization Admin',
  team_manager: 'Team Manager',
  score_reporter: 'Score Reporter',
  accountant: 'Accountant',
  umpire: 'Umpire',
};

const ROLE_COLORS = {
  super_admin: 'danger',
  org_admin: 'info',
  team_manager: 'success',
  score_reporter: 'warning',
  accountant: 'info',
  umpire: 'warning',
};

function formatDate(d) {
  if (!d) return 'Never';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function MyAccount({ onChangePassword }) {
  const { isSuperAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const push = usePushNotifications();
  const [prefs, setPrefs] = useState({ schedule_changes: true, cancellations: true, announcements: true });
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    fetchMe()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
    fetchNotificationPrefs()
      .then(setPrefs)
      .catch(() => {});
  }, []);

  const togglePref = async (key) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setPrefsLoading(true);
    try { await updateNotificationPrefs(updated); } catch { setPrefs(prefs); }
    setPrefsLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-chrome-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) return <p className="text-gray-400 text-center py-10">Failed to load account info.</p>;

  const { user, organizations, teams } = data;
  const roleColor = ROLE_COLORS[user.role] || 'lh-badge-neutral';

  const initials = (user.name || user.username || '?')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">

      {/* Profile Card */}
      <Card variant="bordered">
        <div className="bg-gradient-to-r from-chrome-900/60 to-action-900/40 px-6 py-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-action-900 text-action-400 flex items-center justify-center text-2xl font-bold border-2 border-action-700">
            {initials}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-100">{user.name}</h2>
            <p className="text-sm text-gray-400">@{user.username}</p>
          </div>
        </div>
        <CardBody>
          <div className="grid sm:grid-cols-2 gap-4">
            <InfoRow icon={<UserIcon className="w-4 h-4" />} label="Email" value={user.email || 'Not set'} />
            <InfoRow icon={<CogIcon className="w-4 h-4" />} label="Role"
              value={<Badge variant={roleColor}>{ROLE_LABELS[user.role] || user.role}</Badge>}
            />
            <InfoRow label="Member Since" value={formatDate(user.created_at)} />
            <InfoRow label="Last Login" value={formatDate(user.last_login_at)} />
            {user.is_umpire && <InfoRow label="Umpire" value="Yes" />}
          </div>
          <div className="mt-5">
            <Button size="sm" onClick={onChangePassword}>
              Change Password
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Notifications */}
      <Card variant="bordered">
        <CardBody>
          <h3 className="text-base font-bold text-gray-100 mb-1 flex items-center gap-2">
            <BellIcon className="w-5 h-5 text-gray-400" />
            Notifications
          </h3>
          <p className="text-sm text-gray-400 mb-4">
            Receive push notifications for schedule changes, cancellations, and league announcements.
          </p>

          {!push.supported ? (
            <p className="text-sm text-gray-500">Push notifications are not supported on this browser.</p>
          ) : push.permission === 'denied' ? (
            <div className="lh-alert lh-alert-info">
              Notifications are blocked. Please enable them in your browser settings.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-200">
                    {push.subscribed ? 'Notifications enabled' : 'Notifications disabled'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {push.subscribed
                      ? 'Toggle categories below to choose what you receive.'
                      : 'Enable to get notified about schedule changes and important updates.'}
                  </p>
                </div>
                <Button
                  variant={push.subscribed ? 'secondary' : 'primary'}
                  size="sm"
                  loading={push.loading}
                  onClick={push.subscribed ? push.unsubscribe : push.subscribe}
                >
                  {push.loading ? 'Loading...' : push.subscribed ? 'Disable' : 'Enable'}
                </Button>
            </div>

            {push.subscribed && (
              <div className="space-y-2 pt-2 border-t border-gray-700">
                <PrefToggle
                  label="Schedule Changes"
                  description="Game date or time is updated"
                  checked={prefs.schedule_changes}
                  disabled={prefsLoading}
                  onChange={() => togglePref('schedule_changes')}
                />
                <PrefToggle
                  label="Cancellations"
                  description="Game is cancelled or postponed"
                  checked={prefs.cancellations}
                  disabled={prefsLoading}
                  onChange={() => togglePref('cancellations')}
                />
                <PrefToggle
                  label="Announcements"
                  description="League-wide or team announcements from admins"
                  checked={prefs.announcements}
                  disabled={prefsLoading}
                  onChange={() => togglePref('announcements')}
                />
                <div className="pt-2">
                  <Button
                    size="xs"
                    onClick={async () => {
                      setTestResult('Sending...');
                      try {
                        const r = await sendTestPush();
                        if (r.sent > 0) {
                          setTestResult(`Sent! (${r.sent} delivered)`);
                        } else if (r.details) {
                          const errs = r.details.filter(d => d.status === 'failed').map(d => `${d.statusCode}: ${d.error}`).join('; ');
                          setTestResult(`Failed: ${errs || r.error || 'Unknown error'}`);
                        } else {
                          setTestResult(r.error || `No subscriptions found`);
                        }
                      } catch (e) {
                        setTestResult(`Error: ${e.message}`);
                      }
                    }}
                  >
                    Send Test Notification
                  </Button>
                  {testResult && (
                    <p className={`text-xs mt-1.5 ${testResult.startsWith('Sent') ? 'text-action-400' : testResult.startsWith('Error') ? 'text-signal-400' : 'text-gray-400'}`}>
                      {testResult}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        </CardBody>
      </Card>

      {/* Permissions Summary */}
      <Card variant="bordered">
        <CardBody>
          <h3 className="text-base font-bold text-gray-100 mb-1 flex items-center gap-2">
            <CogIcon className="w-5 h-5 text-gray-400" />
            Permissions
          </h3>
          <p className="text-sm text-gray-400 mb-4">What you can access and manage in the system.</p>

        {isSuperAdmin ? (
          <div className="lh-alert lh-alert-error">
            <span className="font-semibold">Full Access</span> — As a Super Admin you have unrestricted access to all organizations, teams, and settings.
          </div>
        ) : (
          <div className="space-y-3">
            <PermissionLine
              label={ROLE_LABELS[user.role] || user.role}
              description={roleDescriptions[user.role] || 'Standard user access.'}
              color={roleColor}
            />
          </div>
        )}
        </CardBody>
      </Card>

      {/* Organizations */}
      {!isSuperAdmin && organizations.length > 0 && (
        <Card variant="bordered">
          <CardBody>
            <h3 className="text-base font-bold text-gray-100 mb-4 flex items-center gap-2">
              <BuildingIcon className="w-5 h-5 text-gray-400" />
              My Organizations
            </h3>
          <div className="grid gap-2">
            {organizations.map(org => (
              <div key={org.id} className="flex items-center gap-3 px-4 py-3 bg-gray-900/50 rounded-lg border border-gray-700/50">
                <BuildingIcon className="w-5 h-5 text-chrome-400 shrink-0" />
                <span className="text-sm font-medium text-gray-200">{org.name}</span>
              </div>
            ))}
          </div>
          </CardBody>
        </Card>
      )}

      {/* Teams */}
      {!isSuperAdmin && teams.length > 0 && (
        <Card variant="bordered">
          <CardBody>
            <h3 className="text-base font-bold text-gray-100 mb-4 flex items-center gap-2">
              <UsersIcon className="w-5 h-5 text-gray-400" />
              My Teams
            </h3>
          <div className="grid gap-2">
            {teams.map(team => (
              <div key={team.id} className="flex items-center justify-between px-4 py-3 bg-gray-900/50 rounded-lg border border-gray-700/50">
                <div>
                  <p className="text-sm font-medium text-gray-200">{team.name}</p>
                  <p className="text-xs text-gray-400">
                    {[team.age_group, team.level, team.org_name].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
          </CardBody>
        </Card>
      )}

      {isSuperAdmin && (
        <p className="text-sm text-gray-500 text-center">
          Super Admins have access to all organizations and teams.
        </p>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
        {icon} {label}
      </span>
      <span className="text-sm text-gray-200">{typeof value === 'string' ? value : value}</span>
    </div>
  );
}

function PermissionLine({ label, description, color }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-gray-900/50 rounded-lg border border-gray-700/50">
      <Badge variant={color} className="shrink-0 mt-0.5">{label}</Badge>
      <span className="text-sm text-gray-400">{description}</span>
    </div>
  );
}

const roleDescriptions = {
  org_admin: 'You can manage organizations you are assigned to, their teams, rosters, and officials.',
  team_manager: 'You can manage rosters and players for teams you are assigned to.',
  score_reporter: 'You can report game scores for teams you are assigned to.',
  accountant: 'You can view and manage league fees and officials.',
  umpire: 'You can view your assigned games and report availability.',
};

function PrefToggle({ label, description, checked, disabled, onChange }) {
  return (
    <label className="flex items-center justify-between px-4 py-3 bg-gray-900/50 rounded-lg border border-gray-700/50 cursor-pointer hover:bg-gray-900/70 transition-colors">
      <div>
        <p className="text-sm font-medium text-gray-200">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="sr-only peer"
        />
        <div className="w-10 h-5 bg-gray-600 rounded-full peer peer-checked:bg-action-600 peer-disabled:opacity-50 transition-colors" />
        <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full peer-checked:translate-x-5 transition-transform" />
      </div>
    </label>
  );
}
