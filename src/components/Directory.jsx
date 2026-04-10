import { useState, useEffect } from 'react';
import { fetchDirectory } from '../api/index.js';

const ROLE_LABELS = {
  head_coach: 'Head Coach',
  assistant_coach: 'Asst. Coach',
  travel_director: 'Travel Dir.',
};

function OrgLogo({ src, name, size = 'w-10 h-10' }) {
  if (!src) return (
    <div className={`${size} bg-gray-200 rounded-full flex items-center justify-center text-lg font-bold text-gray-500 shrink-0`}>
      {(name || '?')[0]}
    </div>
  );
  return <img src={src} alt="" className={`${size} object-contain rounded shrink-0`} />;
}

export default function Directory() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetchDirectory()
      .then(setOrgs)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-8 text-center text-gray-500">Loading directory…</div>;
  if (error) return <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>;

  return (
    <div>
      <h2 className="font-heading text-2xl font-bold tracking-wide text-blue-800 mb-6">Team Directory</h2>

      <div className="space-y-6">
        {orgs.map(org => (
          <div key={org.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Org header */}
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-4">
                <OrgLogo src={org.logo_url} name={org.name} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-heading text-lg font-semibold tracking-wide text-blue-900 truncate">{org.name}</h3>
                  <div className="text-xs text-gray-500">
                    {org.teams.length} team{org.teams.length !== 1 ? 's' : ''}
                    {org.city && ` · ${org.city}${org.state ? ', ' + org.state : ''}`}
                  </div>
                </div>
                {/* Org contact */}
                {(org.contact_name || org.contact_email || org.contact_phone) && (
                  <div className="hidden sm:block text-right text-sm shrink-0">
                    {org.contact_name && <div className="font-semibold text-gray-800">{org.contact_name}</div>}
                    {org.contact_email && <div className="text-blue-700 text-xs">{org.contact_email}</div>}
                    {org.contact_phone && <div className="text-gray-500 text-xs">{org.contact_phone}</div>}
                  </div>
                )}
              </div>
              {/* Org contact — mobile */}
              {(org.contact_name || org.contact_email || org.contact_phone) && (
                <div className="sm:hidden mt-3 text-sm">
                  {org.contact_name && <div className="font-semibold text-gray-800">{org.contact_name}</div>}
                  {org.contact_email && <div className="text-blue-700 text-xs">{org.contact_email}</div>}
                  {org.contact_phone && <div className="text-gray-500 text-xs">{org.contact_phone}</div>}
                </div>
              )}
            </div>

            {/* Teams */}
            {org.teams.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {org.teams.map(team => {
                  const isExpanded = expanded === team.id;
                  const headCoach = team.staff.find(s => s.role === 'head_coach');
                  return (
                    <div key={team.id}>
                      <button
                        onClick={() => setExpanded(isExpanded ? null : team.id)}
                        className="w-full text-left px-4 sm:px-6 py-3 hover:bg-gray-50 transition-colors flex items-center gap-4"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm">{team.name}</div>
                          <div className="text-xs text-gray-500">
                            {[team.age_group, team.level].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        {headCoach && (
                          <div className="hidden sm:block text-right text-sm shrink-0">
                            <div className="font-medium text-gray-700">{headCoach.name}</div>
                            <div className="text-xs text-gray-400">Head Coach</div>
                          </div>
                        )}
                        <span className={`text-gray-400 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                      </button>

                      {isExpanded && (
                        <div className="bg-gray-50 px-4 sm:px-6 py-3 border-t border-gray-100">
                          {team.staff.length > 0 ? (
                            <div className="space-y-2">
                              {team.staff.map((s, i) => (
                                <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-block w-24 text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">
                                      {ROLE_LABELS[s.role] || s.role}
                                    </span>
                                    <span className="font-semibold text-gray-800">{s.name}</span>
                                  </div>
                                  <div className="flex gap-4 text-xs sm:ml-auto">
                                    {s.email && <span className="text-blue-700">{s.email}</span>}
                                    {s.phone && <span className="text-gray-500">{s.phone}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-400">No staff assigned to this team.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 sm:px-6 py-6 text-sm text-gray-400 text-center">No teams in this organization.</div>
            )}
          </div>
        ))}

        {orgs.length === 0 && (
          <div className="py-12 text-center text-gray-400">No organizations found.</div>
        )}
      </div>
    </div>
  );
}
