import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STALE } from '../lib/queryConfig.js';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchDirectory } from '../api/index.js';
import TeamLogo from './TeamLogo.jsx';
import ContactModal from './ContactModal.jsx';
import { Button, Card } from './ui';

const ROLE_LABELS = {
  head_coach: 'Head Coach',
  assistant_coach: 'Asst. Coach',
  scorekeeper: 'Scorekeeper',
  org_admin: 'Org Admin',
};

function OrgLogo({ src, name, size = 'w-10 h-10' }) {
  if (!src) return (
    <div className={`${size} bg-gray-700 rounded-full flex items-center justify-center text-lg font-bold text-gray-400 shrink-0`}>
      {(name || '?')[0]}
    </div>
  );
  return <img src={src} alt="" className={`${size} object-contain rounded shrink-0`} />;
}

export default function Directory({ onEditTeam }) {
  const { canEditTeam } = useAuth();
  const [expanded, setExpanded] = useState(null);
  const [expandedOrgs, setExpandedOrgs] = useState(new Set());
  const printRef = useRef();
  const [contactModal, setContactModal] = useState(null);

  const { data: orgs = [], isLoading: loading, error } = useQuery({
    queryKey: ['directory'],
    queryFn: fetchDirectory,
    staleTime: STALE.HOUR,
  });

  function handlePrint() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const html = buildPrintHTML(orgs);
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.addEventListener('afterprint', () => printWindow.close());
    setTimeout(() => printWindow.print(), 300);
  }

  if (loading) return <div className="py-8 text-center text-gray-400">Loading directory…</div>;
  if (error) return <div className="lh-alert lh-alert-error">{error.message}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-bold tracking-wide text-action-300">Team Directory</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => setContactModal({ scope: 'league', scopeLabel: 'Entire League' })}
            icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
          >
            Email League
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handlePrint}
            className="print:hidden"
            icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm0-12V3a1 1 0 011-1h4a1 1 0 011 1v4" /></svg>}
          >
            Print
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {orgs.map(org => (
          <div key={org.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
            {/* Org header — clickable to expand/collapse */}
            <div className="w-full text-left px-4 sm:px-6 py-4 border-b border-gray-700 bg-gray-900 hover:bg-gray-800 transition-colors cursor-pointer">
              <div className="flex items-center gap-4" onClick={() => setExpandedOrgs(prev => {
                const next = new Set(prev);
                next.has(org.id) ? next.delete(org.id) : next.add(org.id);
                return next;
              })}>
                <OrgLogo src={org.logo_url} name={org.name} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-lg font-semibold tracking-wide text-action-300 truncate">{org.name}</h3>
                  <div className="text-xs text-gray-400">
                    {org.teams.length} team{org.teams.length !== 1 ? 's' : ''}
                    {org.city && ` · ${org.city}${org.state ? ', ' + org.state : ''}`}
                  </div>
                </div>
                {/* Org contact */}
                {(org.contact_name || org.contact_email || org.contact_phone) && (
                  <div className="hidden sm:block text-right text-sm shrink-0">
                    {org.contact_name && <div className="font-semibold text-gray-200">{org.contact_name}</div>}
                    {org.contact_email && <div className="text-action-300 text-xs">{org.contact_email}</div>}
                    {org.contact_phone && <div className="text-gray-400 text-xs">{org.contact_phone}</div>}
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setContactModal({ scope: 'org', scopeId: org.id, scopeLabel: org.name }); }}
                  className="p-1.5 text-gray-400 hover:text-action-300 hover:bg-action-900/30 rounded transition-colors shrink-0"
                  title={`Email ${org.name}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </button>
                <span className={`text-gray-400 text-xs transition-transform ${expandedOrgs.has(org.id) ? 'rotate-90' : ''}`}>▶</span>
              </div>
              {/* Org contact — mobile */}
              {(org.contact_name || org.contact_email || org.contact_phone) && (
                <div className="sm:hidden mt-3 text-sm">
                  {org.contact_name && <div className="font-semibold text-gray-200">{org.contact_name}</div>}
                  {org.contact_email && <div className="text-action-300 text-xs">{org.contact_email}</div>}
                  {org.contact_phone && <div className="text-gray-400 text-xs">{org.contact_phone}</div>}
                </div>
              )}
            </div>

            {/* Teams — shown when org is expanded */}
            {expandedOrgs.has(org.id) && org.teams.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {org.teams.map(team => {
                  const isExpanded = expanded === team.id;
                  const headCoach = team.staff.find(s => s.role === 'head_coach');
                  const editable = onEditTeam && canEditTeam(team.id, org.id);
                  return (
                    <div key={team.id}>
                      <div className="flex items-center">
                        <button
                          onClick={() => setExpanded(isExpanded ? null : team.id)}
                          className="flex-1 text-left px-4 sm:px-6 py-3 hover:bg-gray-900 transition-colors flex items-center gap-3"
                        >
                          <TeamLogo src={team.logo_url} name={team.long_name || team.name} ageGroup={team.age_group} level={team.level} cityAbbr={team.city_abbr} primaryColor={team.primary_color} secondaryColor={team.secondary_color} size="w-7 h-7" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm">{team.long_name || team.name}</div>
                            <div className="text-xs text-gray-400">
                              {[team.age_group, team.level].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          {headCoach && (
                            <div className="hidden sm:block text-right text-sm shrink-0">
                              <div className="font-medium text-gray-300">{headCoach.name}</div>
                              <div className="text-xs text-gray-400">Head Coach</div>
                            </div>
                          )}
                          <span className={`text-gray-400 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                        </button>
                        {editable && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onEditTeam(team.id, org.id); }}
                            className="mr-1 p-1.5 text-gray-400 hover:text-action-300 hover:bg-action-900/30 rounded transition-colors"
                            title="Manage team"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setContactModal({ scope: 'team', scopeId: team.id, scopeLabel: team.long_name || team.name }); }}
                          className="mr-3 sm:mr-5 p-1.5 text-gray-400 hover:text-action-300 hover:bg-action-900/30 rounded transition-colors"
                          title={`Email ${team.long_name || team.name}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="bg-gray-900 px-4 sm:px-6 py-3 border-t border-gray-700">
                          {team.staff.length > 0 ? (
                            <div className="space-y-2">
                              {team.staff.map((s, i) => (
                                <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-block w-24 text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">
                                      {ROLE_LABELS[s.role] || s.role}
                                    </span>
                                    <span className="font-semibold text-gray-200">{s.name}</span>
                                  </div>
                                  <div className="flex gap-4 text-xs sm:ml-auto">
                                    {s.email && <span className="text-action-300">{s.email}</span>}
                                    {s.phone && <span className="text-gray-400">{s.phone}</span>}
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
            ) : expandedOrgs.has(org.id) ? (
              <div className="px-4 sm:px-6 py-6 text-sm text-gray-400 text-center">No teams in this organization.</div>
            ) : null}
          </div>
        ))}

        {orgs.length === 0 && (
          <div className="py-12 text-center text-gray-400">No organizations found.</div>
        )}
      </div>

      {contactModal && (
        <ContactModal
          scope={contactModal.scope}
          scopeId={contactModal.scopeId}
          scopeLabel={contactModal.scopeLabel}
          onClose={() => setContactModal(null)}
        />
      )}
    </div>
  );
}

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildPrintHTML(orgs) {
  const rows = orgs.map(org => {
    const orgContact = [
      org.contact_name ? `<strong>${esc(org.contact_name)}</strong>` : '',
      org.contact_email ? esc(org.contact_email) : '',
      org.contact_phone ? esc(org.contact_phone) : '',
    ].filter(Boolean).join(' &middot; ');

    const teamRows = org.teams.map(team => {
      const staffRows = team.staff.map(s =>
        `<tr>
          <td style="padding:2px 12px 2px 40px;font-size:12px;color:#888;">${esc(ROLE_LABELS[s.role] || s.role)}</td>
          <td style="padding:2px 8px;font-size:13px;">${esc(s.name)}</td>
          <td style="padding:2px 8px;font-size:12px;color:#1d4ed8;">${esc(s.email)}</td>
          <td style="padding:2px 8px;font-size:12px;color:#666;">${esc(s.phone)}</td>
        </tr>`
      ).join('');
      return `<tr style="border-top:1px solid #e5e7eb;">
        <td colspan="4" style="padding:6px 12px;font-weight:600;font-size:14px;">
          ${esc(team.long_name || team.name)}
          <span style="font-weight:400;color:#888;font-size:12px;margin-left:8px;">${esc([team.age_group, team.level].filter(Boolean).join(' · '))}</span>
        </td>
      </tr>${staffRows || '<tr><td colspan="4" style="padding:2px 40px;font-size:12px;color:#aaa;">No staff assigned</td></tr>'}`;
    }).join('');

    return `<div style="margin-bottom:24px;border:1px solid #d1d5db;border-radius:8px;overflow:hidden;">
      <div style="background:#f9fafb;padding:10px 16px;border-bottom:1px solid #e5e7eb;">
        <div style="font-size:16px;font-weight:700;color:#1e3a5f;">${esc(org.name)}</div>
        ${orgContact ? `<div style="font-size:12px;color:#555;margin-top:2px;">${orgContact}</div>` : ''}
        ${org.city ? `<div style="font-size:11px;color:#999;">${esc(org.city)}${org.state ? ', ' + esc(org.state) : ''}</div>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;">${teamRows || '<tr><td style="padding:12px;color:#aaa;text-align:center;">No teams</td></tr>'}</table>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><title>LeagueHaven Team Directory</title>
<style>@media print{body{margin:0.5in;}}</style></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#222;max-width:800px;margin:0 auto;padding:20px;">
<h1 style="font-size:22px;color:#1e3a5f;margin-bottom:4px;">LeagueHaven Team Directory</h1>
<div style="font-size:12px;color:#999;margin-bottom:20px;">Printed ${new Date().toLocaleDateString()}</div>
${rows}
</body></html>`;
}
