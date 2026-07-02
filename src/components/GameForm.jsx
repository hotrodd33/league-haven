import React from 'react';
import { useState, useEffect, useMemo } from 'react';
import {
    createGame, updateGame,
    fetchLocations, fetchScheduleSettings,
    fetchOrganizations, fetchAssignableOfficials,
    checkGameConflicts,
    createReservation,
    fetchAgeGroups, fetchLevels, createTeam,
} from '../api/index.js';
import { formatTime, CoachContact, SCHED_ROLE_LABELS, STATUS_OPTIONS } from './GameSchedule.jsx';
import { FieldForm } from './FieldsPage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Input, Modal } from './ui/index.js';

function toMinutes(hhmm) {
    const [h, m] = String(hhmm).split(':').map(Number);
    return (h * 60) + m;
}

function toHHMM(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function buildTimeSlots(startTime, endTime, increment) {
    const start = toMinutes(startTime); const end = toMinutes(endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return [];
    const step = Number(increment) || 30; const slots = [];
    for (let cur = start; cur <= end; cur += step) {
        slots.push(toHHMM(cur));
    }
    return slots;
}

const DURATION_OPTIONS = (() => {
    const opts = [];
    for (let m = 60; m <= 720; m += 15) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        const label = min === 0 ? `${h} hr${h !== 1 ? 's' : ''}` : `${h}:${String(min).padStart(2, '0')}`;
        opts.push({ value: m, label });
    }
    return opts;
})();

function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}

function buildRecurDates(startDate, recurType, recurDays, recurEndDate, recurCount) {
    if (recurType === 'none') return [startDate];
    const dates = [];
    const limit = recurType === 'count' ? Number(recurCount) : 365;
    let cur = startDate;
    while (dates.length < limit) {
        const dow = new Date(cur + 'T00:00:00').getDay();
        if (recurDays.includes(dow)) dates.push(cur);
        cur = addDays(cur, 1);
        if (recurType === 'until' && cur > recurEndDate) break;
        if (cur > addDays(startDate, 365)) break;
    }
    return dates;
}

function AddFieldModal({ homeOrgId, onDone, onCancel }) {
    const [orgs, setOrgs] = useState([]);
    const [ageGroups, setAgeGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        Promise.all([fetchOrganizations(), fetchAgeGroups()])
            .then(([o, ag]) => { setOrgs(o); setAgeGroups(ag); })
            .finally(() => setLoading(false));
    }, []);
    if (loading) return <Modal open onClose={onCancel} title="Add Field Location" size="lg"><div className="p-6 text-center text-gray-400">Loading...</div></Modal>;
    const editableOrgIds = new Set(orgs.map(o => o.id));
    return (
        <FieldForm orgId={homeOrgId} editableOrgIds={editableOrgIds} orgs={orgs} ageGroups={ageGroups} onDone={onDone} onCancel={onCancel} />
    );
}

export function GameForm({ game, teams, seasons, defaultSeasonId, defaultHomeTeamId, defaultEventType, onDone, onCancel, onTeamsChanged }) {
    const isEditing = !!game;
    const { isSuperAdmin, isOrgAdmin, permissions } = useAuth();
    const [saving, setSaving] = useState(false);

    const [showAddLocationForm, setShowAddLocationForm] = useState(false);
    const [showCreateTeam, setShowCreateTeam] = useState(null); // 'home' | 'away' | null
    const [error, setError] = useState(null);
    const [locations, setLocations] = useState([]);
    const [orgSettings, setOrgSettings] = useState({});
    const [officials, setOfficials] = useState([]);
    const [eventType, setEventType] = useState(defaultEventType || 'game'); // 'game' | 'practice' | 'event' | 'maintenance'
    const [scheduleSettings, setScheduleSettings] = useState({
        game_start_time: '08:00',
        game_end_time: '20:00',
        game_time_increment_minutes: 30,
    });
    const initialStatus = game?.status || 'unscheduled';
    const initialGameDate = game?.game_date || new Date().toISOString().slice(0, 10);
    const [form, setForm] = useState({
        season_id: game?.season_id || defaultSeasonId || '',
        home_team_id: game?.tournament_id ? (game.tournament_team_a_id || '') : (game?.home_team_id || defaultHomeTeamId || ''),
        away_team_id: game?.tournament_id ? (game.tournament_team_b_id || '') : (game?.away_team_id || ''),
        location_id: game?.location_id || '',
        game_date: initialGameDate,
        game_time: game?.game_time?.slice(0, 5) || '',
        game_duration_minutes: game?.game_duration_minutes || 150,
        status: initialStatus,
        home_score: game?.home_score ?? '',
        away_score: game?.away_score ?? '',
        innings_played: game?.innings_played ?? '',
        official_ids: game?.official_ids || [],
        notes: game?.notes || '',
    });

    // Reservation-specific fields (for practice/event/maintenance)
    const [resForm, setResForm] = useState({
        title: '',
        team_id: defaultHomeTeamId ? String(defaultHomeTeamId) : '',
        start_time: '17:00',
        duration_minutes: 120,
    });

    // Recurrence (practice/event only)
    const [recurType, setRecurType] = useState('none'); // 'none' | 'until' | 'count'
    const [recurDays, setRecurDays] = useState(() => [new Date().getDay()]);
    const [recurEndDate, setRecurEndDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() + 42); return d.toISOString().slice(0, 10);
    });
    const [recurCount, setRecurCount] = useState(6);

    const isGame = eventType === 'game';



    const [fieldConflicts, setFieldConflicts] = useState(null);
    const [resWarning, setResWarning] = useState(null);
    const [confirmSave, setConfirmSave] = useState(false);
    const [isDoubleheader, setIsDoubleheader] = useState(false);
    const [awayLocations, setAwayLocations] = useState([]);

    const selectedHomeTeam = teams.find((t) => String(t.id) === String(form.home_team_id));
    const selectedAwayTeam = teams.find((t) => String(t.id) === String(form.away_team_id));
    const interestedOfficialIds = (game?.interested_official_ids || []).map((id) => Number(id));
    const interestedOfficialSet = new Set(interestedOfficialIds);
    const homeOrgId = selectedHomeTeam?.org_id || null;
    const awayOrgId = selectedAwayTeam?.org_id || null;
    const orgOfficialsEnabled = homeOrgId ? !!orgSettings[homeOrgId]?.officials_enabled : false;
    const officialsEnabled = orgOfficialsEnabled || officials.length > 0;

    useEffect(() => {
        fetchOrganizations().then((orgs) => {
            const map = {};
            for (const org of orgs || []) map[org.id] = org;
            setOrgSettings(map);
        }).catch(() => {
            setOrgSettings({});
        });
    }, []);

    useEffect(() => {
        fetchScheduleSettings().then((data) => {
            setScheduleSettings({
                game_start_time: data?.game_start_time || '08:00',
                game_end_time: data?.game_end_time || '20:00',
                game_time_increment_minutes: Number(data?.game_time_increment_minutes) || 30,
            });
        }).catch(() => { });
    }, []);

    useEffect(() => {
        if (!homeOrgId) {
            // For tournament games (no teams yet), load the hosting org's fields.
            const tournamentOrgId = game?.tournament_org_id;
            if (tournamentOrgId) {
                fetchLocations(tournamentOrgId).then((locs) => {
                    setLocations(locs);
                }).catch(() => setLocations([]));
            } else if (form.location_id) {
                // Non-tournament game that already has a location — keep the list populated.
                fetchLocations().then(setLocations).catch(() => setLocations([]));
            } else {
                setLocations([]);
                setOfficials([]);
            }
            return;
        }
        fetchLocations(homeOrgId).then((locs) => {
            setLocations(locs);
            // Don't clear the location on tournament games — the field may belong
            // to a different org than the home team.
            if (form.location_id && !game?.tournament_id && !locs.some((loc) => String(loc.id) === String(form.location_id))) {
                setForm((prev) => ({ ...prev, location_id: '' }));
            }
        }).catch(() => {
            setLocations([]);
        });

        fetchAssignableOfficials(homeOrgId).then((rows) => {
            const list = rows || [];
            setOfficials(list);
            const validIds = new Set(list.map((o) => String(o.id)));
            setForm((prev) => ({
                ...prev,
                official_ids: (prev.official_ids || []).filter((id) => validIds.has(String(id))),
            }));
        }).catch(() => {
            setOfficials([]);
            setForm((prev) => ({ ...prev, official_ids: [] }));
        });
    }, [homeOrgId]);

    // Load away team's org locations when doubleheader is toggled on
    useEffect(() => {
        if (!isDoubleheader || !awayOrgId || awayOrgId === homeOrgId) {
            setAwayLocations([]);
            return;
        }
        fetchLocations(awayOrgId).then((locs) => {
            setAwayLocations(locs);
        }).catch(() => setAwayLocations([]));
    }, [isDoubleheader, awayOrgId, homeOrgId]);

    // For non-game types, load locations from user's org(s)
    useEffect(() => {
        if (isGame) return;
        // Load locations for the user's org(s)
        const orgIds = isSuperAdmin ? null : (permissions?.org_ids || []);
        if (isSuperAdmin) {
            // Load all orgs to get all locations
            fetchOrganizations().then(orgs => {
                const promises = orgs.map(o => fetchLocations(o.id).catch(() => []));
                return Promise.all(promises);
            }).then(results => {
                setLocations(results.flat());
            }).catch(() => setLocations([]));
        } else if (orgIds?.length) {
            Promise.all(orgIds.map(oid => fetchLocations(oid).catch(() => [])))
                .then(results => setLocations(results.flat()))
                .catch(() => setLocations([]));
        }
    }, [isGame, isSuperAdmin]);

    // Time options for reservation types — use the same settings as game times but wider window
    const resTimeOptions = useMemo(() => {
        const start = scheduleSettings.game_start_time || '06:00';
        const end = scheduleSettings.game_end_time || '22:00';
        const inc = scheduleSettings.game_time_increment_minutes || 30;
        return buildTimeSlots(start, end, inc).map(value => {
            const [h, m] = value.split(':').map(Number);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            return { value, label: `${h12}:${String(m).padStart(2, '0')} ${ampm}` };
        });
    }, [scheduleSettings]);

    const timeSlots = buildTimeSlots(
        scheduleSettings.game_start_time,
        scheduleSettings.game_end_time,
        scheduleSettings.game_time_increment_minutes,
    );
    const currentTimeIncluded = form.game_time && !timeSlots.includes(form.game_time);

    function handleChange(e) {
        const { name, value } = e.target;
        if (name === 'home_team_id') {
            const nextTeam = teams.find((t) => String(t.id) === String(value));
            const nextOrgId = nextTeam?.org_id || null;
            const prevOrgId = selectedHomeTeam?.org_id || null;
            setForm((prev) => ({
                ...prev,
                home_team_id: value,
                location_id: nextOrgId !== prevOrgId ? '' : prev.location_id,
            }));
            return;
        }
        setForm(prev => {
            const next = { ...prev, [name]: value };
            // Clear location if age group changed and current location is no longer compatible
            if (name === 'age_group' && prev.location_id) {
                const loc = locations.find(l => String(l.id) === String(prev.location_id));
                if (loc?.age_groups?.length && !loc.age_groups.some(ag => ag.name === value)) {
                    next.location_id = '';
                }
            }
            return next;
        });
    }



    function toggleOfficial(officialId) {
        setForm((prev) => {
            const has = (prev.official_ids || []).some((id) => String(id) === String(officialId));
            return {
                ...prev,
                official_ids: has
                    ? prev.official_ids.filter((id) => String(id) !== String(officialId))
                    : [...(prev.official_ids || []), Number(officialId)],
            };
        });
    }



    async function handleSubmit(e) {
        e.preventDefault(); setSaving(true); setError(null); setResWarning(null);

        // Handle reservation (practice/event/maintenance)
        if (!isGame) {
            if (!resForm.title.trim()) { setSaving(false); setError('Title is required.'); return; }
            if (!form.game_date) { setSaving(false); setError('Date is required.'); return; }
            if (!resForm.start_time) { setSaving(false); setError('Start time is required.'); return; }
            if (!resForm.duration_minutes) { setSaving(false); setError('Duration is required.'); return; }
            if (!form.location_id) { setSaving(false); setError('Location is required for reservations.'); return; }
            if (recurType !== 'none' && recurDays.length === 0) { setSaving(false); setError('Select at least one day of week for recurrence.'); return; }

            // Compute end_time from start + duration
            const [sh, sm] = resForm.start_time.split(':').map(Number);
            const endMin = sh * 60 + sm + Number(resForm.duration_minutes);
            const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

            const recurDates = buildRecurDates(form.game_date, recurType, recurDays, recurEndDate, recurCount);
            if (!recurDates.length) { setSaving(false); setError('No dates match the recurrence pattern.'); return; }

            try {
                let lastWarning = null;
                for (const date of recurDates) {
                    const result = await createReservation({
                        location_id: Number(form.location_id),
                        team_id: resForm.team_id ? Number(resForm.team_id) : null,
                        title: resForm.title.trim(),
                        event_type: eventType,
                        event_date: date,
                        start_time: resForm.start_time,
                        end_time: endTime,
                        notes: form.notes.trim() || null,
                    });
                    if (result?.warning) lastWarning = result.warning;
                }
                if (lastWarning) { setResWarning(lastWarning); setSaving(false); return; }
                onDone();
            } catch (err) { setError(err.message); }
            finally { setSaving(false); }
            return;
        }

        const data = {
            season_id: form.season_id ? Number(form.season_id) : null,
            home_team_id: Number(form.home_team_id),
            away_team_id: Number(form.away_team_id),
            location_id: form.location_id ? Number(form.location_id) : null,
            game_date: form.game_date || null,
            game_time: form.game_time || null,
            game_duration_minutes: Number(form.game_duration_minutes) || 150,
            status: form.status,
            home_score: form.home_score !== '' ? Number(form.home_score) : null,
            away_score: form.away_score !== '' ? Number(form.away_score) : null,
            innings_played: form.innings_played !== '' ? Number(form.innings_played) : null,
            official_ids: form.official_ids || [],
            notes: form.notes.trim() || null,
        };

        // Check for field reservation conflicts when scheduling a game with location + time
        if (data.location_id && data.game_time && !confirmSave) {
            try {
                const result = await checkGameConflicts(data.location_id, data.game_date, data.game_time, data.game_duration_minutes);
                if (result.has_conflicts || result.has_warnings) {
                    setFieldConflicts(result);
                    setSaving(false);
                    return;
                }
            } catch { /* proceed if check fails */ }
        }

        try {
            const saved = isEditing ? await updateGame(game.id, data) : await createGame(data);
            setConfirmSave(false);
            setFieldConflicts(null);
            onDone(saved);
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    }

    function handleConfirmSave() {
        setConfirmSave(true);
        setFieldConflicts(null);
        // Re-trigger submit
        const fakeEvent = { preventDefault: () => { } };
        handleSubmit(fakeEvent);
    }

    // Build team optgroups — all teams visible for scheduling (coaches need to pick opponents)
    const visibleTeams = teams;
    const teamsByOrg = {};
    const ungroupedTeams = [];
    for (const t of visibleTeams) {
        if (t.org_name) {
            if (!teamsByOrg[t.org_name]) teamsByOrg[t.org_name] = [];
            teamsByOrg[t.org_name].push(t);
        } else {
            ungroupedTeams.push(t);
        }
    }
    const orgNames = Object.keys(teamsByOrg).sort();

    function TeamSelect({ id, name, value }) {
        return (
            <div>
                <select id={id} name={name} value={value} onChange={(e) => {
                    if (e.target.value === '__create__') {
                        e.target.value = value; // revert selection
                        setShowCreateTeam(name === 'home_team_id' ? 'home' : 'away');
                        return;
                    }
                    handleChange(e);
                }} required className="lh-select">
                    <option value="">— Select Team —</option>
                    {orgNames.map(orgName => (
                        <optgroup key={orgName} label={orgName}>
                            {teamsByOrg[orgName].map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </optgroup>
                    ))}
                    {ungroupedTeams.length > 0 && (
                        <optgroup label="Unassigned">
                            {ungroupedTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </optgroup>
                    )}
                    {!game?.tournament_id && <option value="__create__">＋ Create New Team…</option>}
                </select>
            </div>
        );
    }

    // Determine if user can create reservations (needs canEditOrg for at least one org)
    const canCreateReservation = isSuperAdmin || isOrgAdmin;

    // Available event types based on permissions
    const eventTypeOptions = [
        { value: 'game', label: 'Game' },
        ...(canCreateReservation ? [
            { value: 'practice', label: 'Practice' },
            { value: 'event', label: 'Event' },
            { value: 'maintenance', label: 'Maintenance' },
        ] : []),
    ];

    return (
        <Modal open onClose={onCancel} title={isEditing ? 'Edit Game' : isGame ? 'Schedule Game' : `Schedule ${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`} size="lg">
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Event Type Toggle — only on create, not edit */}
                {!isEditing && eventTypeOptions.length > 1 && (
                    <div>
                        <label className="lh-eyebrow block mb-1">Type</label>
                        <div className="flex gap-1 p-1 bg-gray-900 rounded-lg">
                            {eventTypeOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setEventType(opt.value)}
                                    className={`flex-1 lh-tab ${eventType === opt.value
                                        ? 'lh-tab-active'
                                        : 'lh-tab-inactive'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {isGame ? (
                    <>
                        {/* Season */}
                        <div>
                            <label htmlFor="game-season" className="lh-eyebrow block mb-1">Season</label>
                            <select id="game-season" name="season_id" value={form.season_id} onChange={handleChange} className="lh-select">
                                <option value="">— None —</option>
                                {seasons.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.year}){s.is_active ? ' ★' : ''}</option>
                                ))}
                            </select>
                        </div>

                        {/* Teams */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="game-home" className="lh-eyebrow block mb-1">Home Team *</label>
                                <TeamSelect id="game-home" name="home_team_id" value={form.home_team_id} />
                                {game?.home_sched_name && (
                                    <div className="mt-1">
                                        <CoachContact label={SCHED_ROLE_LABELS[game.home_sched_role] || 'Contact'} name={game.home_sched_name} email={game.home_sched_email} phone={game.home_sched_phone} />
                                    </div>
                                )}
                            </div>
                            <div>
                                <label htmlFor="game-away" className="lh-eyebrow block mb-1">Away Team *</label>
                                <TeamSelect id="game-away" name="away_team_id" value={form.away_team_id} />
                                {game?.away_sched_name && (
                                    <div className="mt-1">
                                        <CoachContact label={SCHED_ROLE_LABELS[game.away_sched_role] || 'Contact'} name={game.away_sched_name} email={game.away_sched_email} phone={game.away_sched_phone} />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Date/Time/Duration */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="game-date" className="lh-eyebrow block mb-1">Date</label>
                                <input id="game-date" name="game_date" type="date" value={form.game_date} onChange={handleChange} onTouchEnd={(e) => e.stopPropagation()} className="lh-input" />
                            </div>
                            <div>
                                <label htmlFor="game-time" className="lh-eyebrow block mb-1">Start Time</label>
                                <select id="game-time" name="game_time" value={form.game_time} onChange={handleChange} className="lh-select">
                                    <option value="">— Select Time —</option>
                                    {timeSlots.map((slot) => (
                                        <option key={slot} value={slot}>{formatTime(slot)}</option>
                                    ))}
                                    {currentTimeIncluded && (
                                        <option value={form.game_time}>{formatTime(form.game_time)} (custom)</option>
                                    )}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="game-duration" className="lh-eyebrow block mb-1">Duration</label>
                                <select id="game-duration" name="game_duration_minutes" value={form.game_duration_minutes} onChange={handleChange} className="lh-select">
                                    {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Location */}
                        <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <label htmlFor="game-location" className="lh-eyebrow mb-0">Location</label>
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={isDoubleheader}
                                            onChange={e => {
                                                setIsDoubleheader(e.target.checked);
                                                if (!e.target.checked) setAwayLocations([]);
                                            }}
                                            className="accent-green-500"
                                        />
                                        Doubleheader
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setShowAddLocationForm(true)}
                                        disabled={!homeOrgId}
                                        className="text-xs font-semibold text-action-300 hover:text-action-100 underline disabled:opacity-50 disabled:no-underline"
                                    >
                                        + Add new field
                                    </button>
                                </div>
                            </div>
                            <select id="game-location" name="location_id" value={form.location_id} onChange={handleChange} className="lh-select" disabled={!homeOrgId && !game?.tournament_id}>
                                <option value="">— None —</option>
                                {isDoubleheader ? (
                                    <>
                                        <optgroup label={selectedHomeTeam?.org_name || 'Home Team Fields'}>
                                            {locations
                                                .filter(l => !form.age_group || !l.age_groups?.length || l.age_groups.some(ag => ag.name === form.age_group))
                                                .map(l => (
                                                    <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ''}</option>
                                                ))}
                                        </optgroup>
                                        {awayOrgId && awayOrgId !== homeOrgId && (
                                            <optgroup label={selectedAwayTeam?.org_name || 'Away Team Fields'}>
                                                {awayLocations
                                                    .filter(l => !form.age_group || !l.age_groups?.length || l.age_groups.some(ag => ag.name === form.age_group))
                                                    .map(l => (
                                                        <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ''}</option>
                                                    ))}
                                            </optgroup>
                                        )}
                                    </>
                                ) : (
                                    locations
                                        .filter(l => !form.age_group || !l.age_groups?.length || l.age_groups.some(ag => ag.name === form.age_group))
                                        .map(l => (
                                            <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ''}</option>
                                        ))
                                )}
                            </select>
                            {!homeOrgId ? (
                                <p className="text-xs text-gray-400 mt-1">Select a home team first to see that organization&apos;s fields.</p>
                            ) : locations.length === 0 ? (
                                <p className="text-xs text-gray-400 mt-1">No fields found for {selectedHomeTeam?.org_name || 'this organization'}.</p>
                            ) : null}
                        </div>

                        {officialsEnabled && (
                            <div>
                                <label className="lh-eyebrow block mb-1">Umpire Assignment</label>
                                {officials.length === 0 ? (
                                    <p className="text-xs text-gray-400">No officials available for this organization. Add officials in the Officials module.</p>
                                ) : (
                                    <div className="space-y-1 bg-gray-900 border border-gray-700 rounded-lg p-3 max-h-52 overflow-y-auto">
                                        {officials.map((official) => {
                                            const checked = (form.official_ids || []).some((id) => String(id) === String(official.id));
                                            const interested = interestedOfficialSet.has(Number(official.id));
                                            const rowCls = checked
                                                ? 'border border-action-500/40 bg-action-900/20'
                                                : interested
                                                    ? 'border border-amber-400/50 bg-amber-500/10'
                                                    : 'border border-signal-500/20 bg-signal-900/10';
                                            const dotCls = checked ? 'bg-action-400' : interested ? 'bg-amber-300' : 'bg-signal-500';
                                            return (
                                                <label key={official.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${rowCls}`}>
                                                    <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
                                                    <span className="flex-1 text-sm text-gray-200 truncate">
                                                        {official.name}
                                                        <span className="text-xs text-gray-400 ml-1">({official.org_ids?.length ? 'Org' : 'League'})</span>
                                                    </span>
                                                    <input type="checkbox" checked={checked} onChange={() => toggleOfficial(official.id)} className="accent-green-500" />
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                                <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-action-400 inline-block" /> Assigned</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-300 inline-block" /> Interested</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-signal-500 inline-block" /> No status</span>
                                </div>
                            </div>
                        )}

                        {/* Status + Score + Innings */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <label htmlFor="game-status" className="lh-eyebrow block mb-1">Status</label>
                                <select id="game-status" name="status" value={form.status} onChange={handleChange} className="lh-select">
                                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="game-home-score" className="lh-eyebrow block mb-1">Home Score</label>
                                <input id="game-home-score" name="home_score" type="number" min="0" value={form.home_score} onChange={handleChange} className="lh-input" placeholder="—" />
                            </div>
                            <div>
                                <label htmlFor="game-away-score" className="lh-eyebrow block mb-1">Away Score</label>
                                <input id="game-away-score" name="away_score" type="number" min="0" value={form.away_score} onChange={handleChange} className="lh-input" placeholder="—" />
                            </div>
                            <div>
                                <label htmlFor="game-innings" className="lh-eyebrow block mb-1">Innings</label>
                                <input id="game-innings" name="innings_played" type="number" min="1" max="99" value={form.innings_played} onChange={handleChange} className="lh-input" placeholder="6" />
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Reservation fields — Practice / Event / Maintenance */}
                        <Input label="Title *" id="res-title" value={resForm.title}
                            onChange={e => setResForm(prev => ({ ...prev, title: e.target.value }))}
                            required placeholder="e.g. 10U Practice" />

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="res-team" className="lh-eyebrow block mb-1">Team</label>
                                <select id="res-team" value={resForm.team_id}
                                    onChange={e => setResForm(prev => ({ ...prev, team_id: e.target.value }))}
                                    className="lh-select">
                                    <option value="">— None —</option>
                                    {visibleTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="res-date" className="lh-eyebrow block mb-1">Date *</label>
                                <input id="res-date" name="game_date" type="date" value={form.game_date} onChange={handleChange} onTouchEnd={(e) => e.stopPropagation()} required className="lh-input" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="res-start" className="lh-eyebrow block mb-1">Start Time *</label>
                                <select id="res-start" value={resForm.start_time}
                                    onChange={e => setResForm(prev => ({ ...prev, start_time: e.target.value }))}
                                    required className="lh-select">
                                    <option value="">— Select —</option>
                                    {resTimeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="res-duration" className="lh-eyebrow block mb-1">Duration *</label>
                                <select id="res-duration" value={resForm.duration_minutes}
                                    onChange={e => setResForm(prev => ({ ...prev, duration_minutes: Number(e.target.value) }))}
                                    required className="lh-select">
                                    {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Location — required for reservations */}
                        <div>
                            <label htmlFor="res-location" className="lh-eyebrow block mb-1">Location *</label>
                            <select id="res-location" name="location_id" value={form.location_id} onChange={handleChange} required className="lh-select">
                                <option value="">— Select Field —</option>
                                {locations.map(l => (
                                    <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ''}</option>
                                ))}
                            </select>
                        </div>

                        {/* Recurrence */}
                        <div className="space-y-3 border border-white/10 rounded-lg p-3">
                            <div className="flex items-center gap-3">
                                <span className="lh-eyebrow">Repeat</span>
                                <select value={recurType} onChange={e => setRecurType(e.target.value)} className="lh-select flex-1">
                                    <option value="none">No repeat (single date)</option>
                                    <option value="until">Repeat until date</option>
                                    <option value="count">Repeat N times</option>
                                </select>
                            </div>
                            {recurType !== 'none' && (
                                <>
                                    <div>
                                        <label className="lh-eyebrow block mb-1">Days of Week</label>
                                        <div className="flex flex-wrap gap-2">
                                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                                                <button key={i} type="button"
                                                    onClick={() => setRecurDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                                                    className={`px-2.5 py-1 rounded text-sm font-medium border transition-colors ${recurDays.includes(i) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/20 text-white/60 hover:border-white/40'}`}>
                                                    {d}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {recurType === 'until' && (
                                        <div>
                                            <label className="lh-eyebrow block mb-1">End Date</label>
                                            <input type="date" value={recurEndDate} onChange={e => setRecurEndDate(e.target.value)} className="lh-input" />
                                        </div>
                                    )}
                                    {recurType === 'count' && (
                                        <div>
                                            <label className="lh-eyebrow block mb-1">Number of Occurrences</label>
                                            <input type="number" min="1" max="60" value={recurCount} onChange={e => setRecurCount(Number(e.target.value))} className="lh-input w-24" />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </>
                )}

                {/* Notes */}
                <div>
                    <label htmlFor="game-notes" className="lh-eyebrow block mb-1">Notes</label>
                    <textarea id="game-notes" name="notes" value={form.notes} onChange={handleChange} rows={2} placeholder="Any additional info…"
                        className="lh-input" />
                </div>

                {/* Proximity warning after reservation saved */}
                {resWarning && (
                    <div className="bg-yellow-900/30 border border-yellow-600 text-yellow-200 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
                        <span className="text-yellow-400 font-bold mt-0.5">⚠</span>
                        <div className="flex-1">
                            <p>{resWarning}</p>
                            <Button size="xs" variant="secondary" className="mt-2" onClick={() => { setResWarning(null); onDone(); }}>
                                OK, got it
                            </Button>
                        </div>
                    </div>
                )}

                {error && <div className="lh-alert lh-alert-error">{error}</div>}

                {fieldConflicts && (
                    <div className="bg-amber-900/30 border border-amber-600 text-amber-200 text-sm px-4 py-3 rounded-lg space-y-2">
                        {fieldConflicts.has_conflicts ? (
                            <>
                                <div className="font-bold text-amber-100">Field Conflict Detected</div>
                                <p className="text-xs text-amber-300">
                                    This game runs from {formatTime(fieldConflicts.game_start)} to {formatTime(fieldConflicts.game_end)}. The following existing reservations overlap:
                                </p>
                                {fieldConflicts.conflicts.map((c, i) => (
                                    <div key={i} className="bg-amber-950/40 rounded px-3 py-2 text-xs space-y-1">
                                        <div className="font-semibold text-white">{c.title} <span className="text-amber-400 font-normal">({c.event_type})</span></div>
                                        <div className="text-amber-300">{formatTime(c.start_time)} – {formatTime(c.end_time)}{c.team_name ? ` • ${c.team_name}` : ''}</div>
                                        {c.created_by_name && (
                                            <div className="text-amber-200">
                                                Booked by: <span className="font-semibold text-white">{c.created_by_name}</span>
                                                {c.created_by_email && (
                                                    <> — <a href={`mailto:${c.created_by_email}?subject=Field%20Reservation%20Conflict&body=Hi%20${encodeURIComponent(c.created_by_name)}%2C%0A%0AYour%20reservation%20%22${encodeURIComponent(c.title)}%22%20on%20${encodeURIComponent(form.game_date)}%20conflicts%20with%20a%20scheduled%20game.%20Games%20have%20priority%20so%20your%20reservation%20will%20need%20to%20be%20moved.%0A%0AThank%20you.`}
                                                        className="text-chrome-400 underline hover:text-chrome-300">
                                                        {c.created_by_email}
                                                    </a></>
                                                )}
                                                {c.created_at && (
                                                    <span className="ml-1 text-amber-400">on {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(c.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <p className="text-xs text-amber-400">Games always have priority. Please contact the person(s) above to notify them their reservation needs to move.</p>
                                <div className="flex gap-2 pt-1">
                                    <Button size="xs" variant="warn" onClick={handleConfirmSave}>
                                        Schedule Anyway
                                    </Button>
                                    <Button size="xs" variant="secondary" onClick={() => { setFieldConflicts(null); setConfirmSave(false); }}>
                                        Cancel
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="font-bold text-amber-100">⚠ Nearby Reservations</div>
                                <p className="text-xs text-amber-300">
                                    The following reservations are within 3 hours of this game ({formatTime(fieldConflicts.game_start)}). They don't overlap but may want a heads-up:
                                </p>
                                {fieldConflicts.warnings.map((c, i) => (
                                    <div key={i} className="bg-amber-950/40 rounded px-3 py-2 text-xs space-y-1">
                                        <div className="font-semibold text-white">{c.title} <span className="text-amber-400 font-normal">({c.event_type})</span></div>
                                        <div className="text-amber-300">{formatTime(c.start_time)} – {formatTime(c.end_time)}{c.team_name ? ` • ${c.team_name}` : ''}</div>
                                        {c.created_by_name && <div className="text-amber-200">Booked by: <span className="font-semibold text-white">{c.created_by_name}</span></div>}
                                    </div>
                                ))}
                                <div className="flex gap-2 pt-1">
                                    <Button size="xs" onClick={handleConfirmSave}>
                                        Save Game
                                    </Button>
                                    <Button size="xs" variant="secondary" onClick={() => { setFieldConflicts(null); setConfirmSave(false); }}>
                                        Cancel
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="secondary" onClick={onCancel}>Cancel</Button>
                    <Button type="submit" disabled={saving} loading={saving}>
                        {saving ? 'Saving…' : isEditing ? 'Update' : isGame ? 'Schedule Game' : `Book ${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`}
                    </Button>
                </div>
            </form>

            {showAddLocationForm && (
                <AddFieldModal
                    homeOrgId={homeOrgId}
                    onDone={async () => {
                        const updated = await fetchLocations(homeOrgId);
                        setLocations(updated);
                        if (updated.length) {
                            const newest = updated.reduce((a, b) => (a.id > b.id ? a : b));
                            setForm(prev => ({ ...prev, location_id: String(newest.id) }));
                        }
                        setShowAddLocationForm(false);
                    }}
                    onCancel={() => setShowAddLocationForm(false)}
                />
            )}

            {showCreateTeam && (
                <QuickCreateTeamForm
                    onCreated={(newTeam) => {
                        const field = showCreateTeam === 'home' ? 'home_team_id' : 'away_team_id';
                        setForm(prev => ({ ...prev, [field]: String(newTeam.id) }));
                        setShowCreateTeam(null);
                        if (onTeamsChanged) onTeamsChanged();
                    }}
                    onCancel={() => setShowCreateTeam(null)}
                />
            )}
        </Modal>
    );
}

function QuickCreateTeamForm({ onCreated, onCancel }) {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [ageGroups, setAgeGroups] = useState([]);
    const [levels, setLevels] = useState([]);
    const [orgs, setOrgs] = useState([]);
    const [form, setForm] = useState({
        team_city: '',
        team_mascot: '',
        team_color: '',
        age_group: '',
        level: '',
        org_id: '',
        primary_color: '#003366',
        secondary_color: '#CC0000',
    });

    useEffect(() => {
        Promise.all([fetchAgeGroups(), fetchLevels(), fetchOrganizations()])
            .then(([ag, lv, og]) => { setAgeGroups(ag); setLevels(lv); setOrgs(og); })
            .catch(() => { });
    }, []);

    const shortName = [form.team_city, form.team_color, form.age_group, form.level].filter(Boolean).join(' ');

    function handleChange(e) {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const data = {
                team_city: form.team_city.trim(),
                team_color: form.team_color.trim(),
                team_mascot: form.team_mascot.trim(),
                age_group: form.age_group || null,
                level: form.level || null,
                primary_color: form.primary_color || null,
                secondary_color: form.secondary_color || null,
                org_id: form.org_id ? Number(form.org_id) : null,
            };
            const newTeam = await createTeam(data);
            onCreated(newTeam);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal open onClose={onCancel} title="Create Opponent Team" size="md">
            <p className="text-xs text-gray-400 mb-4">Quickly add a team that doesn&apos;t exist yet. Organization is optional for opponent teams.</p>

            <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                    <Input label="Team City *" id="qt-city" name="team_city" type="text" value={form.team_city} onChange={handleChange} required placeholder="e.g. Austin" />
                    <Input label="Team Mascot" id="qt-mascot" name="team_mascot" type="text" value={form.team_mascot} onChange={handleChange} placeholder="e.g. Thunder" />
                    <Input label="Team Color" id="qt-color" name="team_color" type="text" value={form.team_color} onChange={handleChange} placeholder="e.g. Red" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label htmlFor="qt-primary" className="lh-eyebrow block mb-1">Primary Color</label>
                        <div className="flex items-center gap-2">
                            <input id="qt-primary" type="color" value={form.primary_color} onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))} className="w-10 h-8 rounded border border-gray-600 cursor-pointer p-0.5" />
                            <input type="text" value={form.primary_color} onChange={e => setForm(prev => ({ ...prev, primary_color: e.target.value }))} className="lh-input flex-1 font-mono text-xs" maxLength={7} />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="qt-secondary" className="lh-eyebrow block mb-1">Secondary Color</label>
                        <div className="flex items-center gap-2">
                            <input id="qt-secondary" type="color" value={form.secondary_color} onChange={e => setForm(prev => ({ ...prev, secondary_color: e.target.value }))} className="w-10 h-8 rounded border border-gray-600 cursor-pointer p-0.5" />
                            <input type="text" value={form.secondary_color} onChange={e => setForm(prev => ({ ...prev, secondary_color: e.target.value }))} className="lh-input flex-1 font-mono text-xs" maxLength={7} />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label htmlFor="qt-age" className="lh-eyebrow block mb-1">Age Group</label>
                        {ageGroups.length > 0 ? (
                            <select id="qt-age" name="age_group" value={form.age_group} onChange={handleChange} className="lh-select">
                                <option value="">— Select —</option>
                                {ageGroups.map(ag => <option key={ag.id} value={ag.name}>{ag.name}</option>)}
                            </select>
                        ) : (
                            <input id="qt-age" name="age_group" type="text" value={form.age_group} onChange={handleChange} placeholder="e.g. 12U" className="lh-input" />
                        )}
                    </div>
                    <div>
                        <label htmlFor="qt-level" className="lh-eyebrow block mb-1">Level</label>
                        {levels.length > 0 ? (
                            <select id="qt-level" name="level" value={form.level} onChange={handleChange} className="lh-select">
                                <option value="">— Select —</option>
                                {levels.map(lv => <option key={lv.id} value={lv.name}>{lv.name}</option>)}
                            </select>
                        ) : (
                            <input id="qt-level" name="level" type="text" value={form.level} onChange={handleChange} placeholder="e.g. Competitive" className="lh-input" />
                        )}
                    </div>
                </div>

                <div>
                    <label htmlFor="qt-org" className="lh-eyebrow block mb-1">Organization</label>
                    <select id="qt-org" name="org_id" value={form.org_id} onChange={handleChange} className="lh-select">
                        <option value="">— None (opponent) —</option>
                        {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Leave blank for external opponent teams.</p>
                </div>

                {shortName && (
                    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                        <span className="text-xs font-semibold text-gray-400 uppercase">Team Name: </span>
                        <span className="font-semibold text-gray-200">{shortName}</span>
                    </div>
                )}

                {error && <div className="lh-alert lh-alert-error">{error}</div>}

                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="secondary" onClick={onCancel}>Cancel</Button>
                    <Button type="submit" disabled={saving} loading={saving}>{saving ? 'Creating…' : 'Create Team'}</Button>
                </div>
            </form>
        </Modal>
    );
}