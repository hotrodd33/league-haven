import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  fetchLocations, createLocation, updateLocation, deleteLocation,
  fetchOrganizations,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import FieldCalendar from './FieldCalendar.jsx';

// Fix default marker icons for bundled builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const inputCls = "w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";
const labelCls = "block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1";
const btnPrimary = "px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60";
const btnSecondary = "px-3 py-1.5 bg-gray-700 text-gray-200 text-xs font-semibold rounded hover:bg-gray-600";
const btnDanger = "px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 disabled:opacity-60";
const DEFAULT_MAP_CENTER = [44.4497, -92.2663];

function directionsUrl(loc) {
  const addr = [loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ');
  const dest = addr || `${loc.latitude},${loc.longitude}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

function FitBounds({ locations }) {
  const map = useMap();
  useEffect(() => {
    const pts = locations.filter((l) => l.latitude && l.longitude);
    if (pts.length === 0) return;
    const bounds = L.latLngBounds(pts.map((l) => [l.latitude, l.longitude]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [locations, map]);
  return null;
}

function MapClickPicker({ onPick }) {
  useMapEvents({ click(event) { onPick(event.latlng.lat, event.latlng.lng); } });
  return null;
}

function MapRecenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    map.setView(center, Math.max(map.getZoom(), 14), { animate: true });
  }, [center, map]);
  return null;
}

// Color palette for org markers
const ORG_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

function orgMarkerIcon(color) {
  return L.divIcon({
    className: '',
    html: `<svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12.5" cy="12.5" r="5" fill="#fff"/>
    </svg>`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
}

export default function FieldsPage({ onViewGame }) {
  const { canEditOrg, isAdmin, isAccountant, isOrgAdmin, role, permissions } = useAuth();
  const [locations, setLocations] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formOrgId, setFormOrgId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null);
  const [calendarField, setCalendarField] = useState(null);
  const markerRefs = useRef({});

  // Determine which orgs the user can edit
  const editableOrgIds = new Set();
  if (isAdmin || isAccountant) {
    orgs.forEach(o => editableOrgIds.add(o.id));
  } else {
    (permissions.org_ids || []).forEach(id => editableOrgIds.add(id));
    (permissions.team_org_ids || []).forEach(id => editableOrgIds.add(id));
  }
  const canEditAny = editableOrgIds.size > 0;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [locs, orgList] = await Promise.all([
        fetchLocations(),
        fetchOrganizations(),
      ]);
      setLocations(locs);
      setOrgs(orgList);
    } catch (err) { console.error('Failed to load', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(loc) {
    if (!window.confirm(`Delete field "${loc.name}"?`)) return;
    setDeleting(loc.id);
    try { await deleteLocation(loc.id); setLocations(prev => prev.filter(l => l.id !== loc.id)); }
    catch (err) { alert(`Failed to delete: ${err.message}`); }
    finally { setDeleting(null); }
  }

  function handleRowClick(loc) {
    if (!loc.latitude || !loc.longitude) return;
    setHighlightedId(loc.id);
    const marker = markerRefs.current[loc.id];
    if (marker) marker.openPopup();
  }

  // Group locations by org
  const orgMap = {};
  orgs.forEach(o => { orgMap[o.id] = { ...o, locations: [] }; });
  locations.forEach(loc => {
    if (orgMap[loc.org_id]) orgMap[loc.org_id].locations.push(loc);
  });
  const orgGroups = Object.values(orgMap).filter(g => g.locations.length > 0).sort((a, b) => a.name.localeCompare(b.name));

  // Build org color map
  const orgColorMap = {};
  orgGroups.forEach((g, i) => { orgColorMap[g.id] = ORG_COLORS[i % ORG_COLORS.length]; });

  const pins = locations.filter(l => l.latitude && l.longitude);
  const defaultCenter = pins.length > 0 ? [pins[0].latitude, pins[0].longitude] : DEFAULT_MAP_CENTER;

  if (loading) return <div className="py-12 text-center text-gray-400">Loading fields…</div>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <h1 className="text-2xl font-heading font-bold text-white">Fields</h1>
        {canEditAny && (
          <button onClick={() => { setEditing(null); setFormOrgId(null); setShowForm(true); }} className={btnPrimary}>
            + Add Field
          </button>
        )}
      </div>

      {/* Map */}
      {pins.length > 0 && (
        <div className="rounded-lg overflow-hidden shadow-sm mb-6">
          <MapContainer center={defaultCenter} zoom={10} scrollWheelZoom style={{ height: '420px', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds locations={pins} />
            {pins.map(loc => (
              <Marker
                key={loc.id}
                position={[loc.latitude, loc.longitude]}
                icon={orgMarkerIcon(orgColorMap[loc.org_id] || '#3b82f6')}
                ref={ref => { if (ref) markerRefs.current[loc.id] = ref; }}
                eventHandlers={{
                  click: () => setHighlightedId(loc.id),
                  popupclose: () => setHighlightedId(prev => prev === loc.id ? null : prev),
                }}
              >
                <Popup>
                  <strong>{loc.name}</strong>
                  {loc.org_name && <><br /><span style={{ color: '#888' }}>{loc.org_name}</span></>}
                  {loc.address && <><br />{loc.address}</>}
                  {loc.city && <><br />{loc.city}{loc.state ? `, ${loc.state}` : ''} {loc.zip || ''}</>}
                  {loc.comments && <><br /><em>{loc.comments}</em></>}
                  <br />
                  <a href={directionsUrl(loc)} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
                    Get Directions ↗
                  </a>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Legend */}
          {orgGroups.length > 1 && (
            <div className="bg-gray-800 border-t border-gray-700 px-4 py-2 flex flex-wrap gap-x-4 gap-y-1">
              {orgGroups.map(g => (
                <div key={g.id} className="flex items-center gap-1.5 text-xs text-gray-300">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: orgColorMap[g.id] }} />
                  {g.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fields grouped by org */}
      {locations.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          No field locations yet.
          {canEditAny && (
            <><br /><button onClick={() => { setEditing(null); setFormOrgId(null); setShowForm(true); }} className="text-blue-400 underline mt-1 inline-block">Add a field</button></>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {orgGroups.map(group => {
            const editable = canEditOrg(group.id);
            return (
              <div key={group.id}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: orgColorMap[group.id] }} />
                    <h2 className="text-lg font-heading font-bold text-white">{group.name}</h2>
                    <span className="text-xs text-gray-400">({group.locations.length})</span>
                  </div>
                  {editable && (
                    <button onClick={() => { setEditing(null); setFormOrgId(group.id); setShowForm(true); }}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700">
                      + Add Field
                    </button>
                  )}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block">
                  <table className="w-full bg-gray-800 rounded-lg shadow-sm overflow-hidden text-sm text-gray-200">
                    <thead>
                      <tr className="bg-gray-800 border-b-2 border-gray-700">
                        <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Name</th>
                        <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Address</th>
                        <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Lat / Lng</th>
                        <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide">Comments</th>
                        <th className="px-3 py-2 text-left text-xs font-bold uppercase text-gray-400 tracking-wide w-44">{editable ? 'Actions' : 'Directions'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {group.locations.map(loc => {
                        const hasPin = loc.latitude && loc.longitude;
                        const isHighlighted = highlightedId === loc.id;
                        return (
                          <tr key={loc.id} onClick={() => handleRowClick(loc)}
                            className={`${hasPin ? 'cursor-pointer hover:bg-blue-900/30' : ''} ${isHighlighted ? 'bg-blue-900/30 shadow-[inset_3px_0_0] shadow-blue-500' : ''} transition-colors`}>
                            <td className="px-3 py-2 font-semibold">{loc.name}</td>
                            <td className="px-3 py-2">{[loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ') || '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs">{hasPin ? `${Number(loc.latitude).toFixed(4)}, ${Number(loc.longitude).toFixed(4)}` : '—'}</td>
                            <td className="px-3 py-2 text-gray-300">{loc.comments || '—'}</td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1.5 flex-wrap">
                                <button onClick={e => { e.stopPropagation(); setCalendarField(loc); }}
                                  className="px-2.5 py-1 bg-green-600 text-white text-xs font-semibold rounded hover:bg-green-700">Calendar</button>
                                {hasPin && (
                                  <a href={directionsUrl(loc)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                    className="px-2.5 py-1 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 no-underline">Directions</a>
                                )}
                                {editable && (
                                  <>
                                    <button onClick={e => { e.stopPropagation(); setEditing(loc); setFormOrgId(loc.org_id); setShowForm(true); }} className={btnSecondary}>Edit</button>
                                    <button onClick={e => { e.stopPropagation(); handleDelete(loc); }} disabled={deleting === loc.id} className={btnDanger}>
                                      {deleting === loc.id ? '…' : 'Del'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {group.locations.map(loc => {
                    const hasPin = loc.latitude && loc.longitude;
                    const isHighlighted = highlightedId === loc.id;
                    return (
                      <div key={loc.id} onClick={() => handleRowClick(loc)}
                        className={`bg-gray-800 rounded-lg border p-4 text-gray-200 ${hasPin ? 'cursor-pointer' : ''} ${isHighlighted ? 'border-blue-400 bg-blue-900/30 shadow-card' : 'border-gray-700'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-sm">{loc.name}</h4>
                          {hasPin && <span className="text-[10px] font-mono text-gray-400 shrink-0 ml-2">{Number(loc.latitude).toFixed(4)}, {Number(loc.longitude).toFixed(4)}</span>}
                        </div>
                        {(loc.address || loc.city) && <p className="text-sm text-gray-300 mb-1">{[loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ')}</p>}
                        {loc.comments && <p className="text-xs text-gray-400 mb-2">{loc.comments}</p>}
                        <div className="flex gap-2 pt-2 border-t border-gray-700" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setCalendarField(loc)}
                            className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded hover:bg-green-700">Calendar</button>
                          {hasPin && (
                            <a href={directionsUrl(loc)} target="_blank" rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 no-underline">Directions</a>
                          )}
                          {editable && (
                            <>
                              <button onClick={() => { setEditing(loc); setFormOrgId(loc.org_id); setShowForm(true); }} className={btnSecondary}>Edit</button>
                              <button onClick={() => handleDelete(loc)} disabled={deleting === loc.id} className={btnDanger}>{deleting === loc.id ? '…' : 'Del'}</button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <FieldForm
          orgId={formOrgId}
          editableOrgIds={editableOrgIds}
          orgs={orgs}
          location={editing}
          onDone={() => { setShowForm(false); setEditing(null); setFormOrgId(null); load(); }}
          onCancel={() => { setShowForm(false); setEditing(null); setFormOrgId(null); }}
        />
      )}

      {calendarField && (
        <FieldCalendar field={calendarField} onClose={() => setCalendarField(null)} onViewGame={onViewGame} />
      )}
    </div>
  );
}

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.address) return null;
    const a = data.address;
    return {
      address: [a.house_number, a.road].filter(Boolean).join(' ') || '',
      city: a.city || a.town || a.village || a.hamlet || '',
      state: a.state ? (a['ISO3166-2-lvl4']?.split('-')[1] || a.state) : '',
      zip: a.postcode || '',
    };
  } catch { return null; }
}

function FieldForm({ orgId, editableOrgIds, orgs, location, onDone, onCancel }) {
  const isEditing = !!location;
  const [saving, setSaving] = useState(false);
  const [locatingByAddress, setLocatingByAddress] = useState(false);
  const [locatingByDevice, setLocatingByDevice] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    org_id: orgId || location?.org_id || '',
    name: location?.name || '',
    address: location?.address || '',
    city: location?.city || '',
    state: location?.state || '',
    zip: location?.zip || '',
    latitude: location?.latitude ?? '',
    longitude: location?.longitude ?? '',
    comments: location?.comments || '',
  });

  const editableOrgs = orgs.filter(o => editableOrgIds.has(o.id)).sort((a, b) => a.name.localeCompare(b.name));

  const parsedLat = Number(form.latitude);
  const parsedLng = Number(form.longitude);
  const hasValidPin = Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
  const mapCenter = hasValidPin ? [parsedLat, parsedLng] : DEFAULT_MAP_CENTER;

  async function setCoordinatesAndReverse(lat, lng) {
    const latStr = Number(lat).toFixed(6);
    const lngStr = Number(lng).toFixed(6);
    setForm(prev => ({ ...prev, latitude: latStr, longitude: lngStr }));
    setReverseGeocoding(true);
    const result = await reverseGeocode(lat, lng);
    if (result) {
      setForm(prev => ({
        ...prev,
        address: result.address || prev.address,
        city: result.city || prev.city,
        state: result.state || prev.state,
        zip: result.zip || prev.zip,
      }));
    }
    setReverseGeocoding(false);
  }

  function setCoordinatesOnly(lat, lng) {
    setForm(prev => ({
      ...prev,
      latitude: Number(lat).toFixed(6),
      longitude: Number(lng).toFixed(6),
    }));
  }

  useEffect(() => {
    if (isEditing || !navigator.geolocation) return;
    setLocatingByDevice(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinatesOnly(position.coords.latitude, position.coords.longitude);
        setLocatingByDevice(false);
      },
      () => { setLocatingByDevice(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e) { setForm(prev => ({ ...prev, [e.target.name]: e.target.value })); }

  async function handleLocateByAddress() {
    const q = [form.address, form.city, form.state, form.zip].filter(Boolean).join(', ').trim();
    if (!q) { setError('Enter an address, city/state, or ZIP, then click Find on map.'); return; }
    setLocatingByAddress(true); setError(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('Address lookup failed');
      const results = await res.json();
      if (!Array.isArray(results) || !results.length) throw new Error('No map result found for that address');
      setCoordinatesOnly(results[0].lat, results[0].lon);
    } catch (err) { setError(err.message || 'Failed to find that address on the map'); }
    finally { setLocatingByAddress(false); }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) { setError('Geolocation is not available in this browser.'); return; }
    setLocatingByDevice(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => { setCoordinatesAndReverse(position.coords.latitude, position.coords.longitude); setLocatingByDevice(false); },
      (geoErr) => { setError(geoErr.message || 'Unable to retrieve your current location'); setLocatingByDevice(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError(null);
    if (!form.org_id) { setSaving(false); setError('Please select an organization.'); return; }
    const latitude = form.latitude !== '' ? parseFloat(form.latitude) : null;
    const longitude = form.longitude !== '' ? parseFloat(form.longitude) : null;
    if (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      setSaving(false); setError('Latitude must be a number between -90 and 90.'); return;
    }
    if (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      setSaving(false); setError('Longitude must be a number between -180 and 180.'); return;
    }
    const data = {
      org_id: Number(form.org_id),
      name: form.name.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      zip: form.zip.trim() || null,
      latitude, longitude,
      comments: form.comments.trim() || null,
    };
    try {
      if (isEditing) await updateLocation(location.id, data);
      else await createLocation(data);
      onDone();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-xl p-5 sm:p-6 my-4 text-gray-200">
        <h2 className="text-xl font-heading font-bold text-white mb-4">{isEditing ? 'Edit Field' : 'Add Field'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="field-org" className={labelCls}>Organization *</label>
            <select id="field-org" name="org_id" value={form.org_id} onChange={handleChange} required
              className={inputCls} disabled={isEditing}>
              <option value="">Select organization…</option>
              {editableOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="field-name" className={labelCls}>Field Name *</label>
            <input id="field-name" name="name" type="text" value={form.name} onChange={handleChange} required placeholder="e.g. Community Park Field 1" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_70px_90px] gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="field-address" className={labelCls}>Address</label>
              <input id="field-address" name="address" type="text" value={form.address} onChange={handleChange} placeholder="123 Main St" className={inputCls} />
            </div>
            <div>
              <label htmlFor="field-city" className={labelCls}>City</label>
              <input id="field-city" name="city" type="text" value={form.city} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label htmlFor="field-state" className={labelCls}>State</label>
              <input id="field-state" name="state" type="text" value={form.state} onChange={handleChange} maxLength={2} placeholder="MN" className={inputCls} />
            </div>
            <div>
              <label htmlFor="field-zip" className={labelCls}>ZIP</label>
              <input id="field-zip" name="zip" type="text" value={form.zip} onChange={handleChange} maxLength={10} className={inputCls} />
            </div>
          </div>

          {reverseGeocoding && <p className="text-xs text-blue-400">Looking up address from pin…</p>}

          <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-100">Pin this field on map</p>
                <p className="text-xs text-gray-400">Click the map or drag the pin — address auto-fills from the pin location.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleLocateByAddress} disabled={locatingByAddress}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 disabled:opacity-60">
                  {locatingByAddress ? 'Finding…' : 'Find on map'}
                </button>
                <button type="button" onClick={handleUseMyLocation} disabled={locatingByDevice}
                  className="px-3 py-1.5 bg-gray-700 text-gray-200 text-xs font-semibold rounded hover:bg-gray-600 disabled:opacity-60">
                  {locatingByDevice ? 'Locating…' : 'Use my location'}
                </button>
                <button type="button" onClick={() => setForm(prev => ({ ...prev, latitude: '', longitude: '' }))}
                  className="px-3 py-1.5 bg-gray-800 text-gray-200 text-xs font-semibold rounded border border-gray-600 hover:bg-gray-700">
                  Clear pin
                </button>
              </div>
            </div>

            <div className="rounded-lg overflow-hidden border border-gray-700">
              <MapContainer center={mapCenter} zoom={hasValidPin ? 14 : 4} scrollWheelZoom style={{ height: '260px', width: '100%' }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapRecenter center={mapCenter} />
                <MapClickPicker onPick={setCoordinatesAndReverse} />
                {hasValidPin && (
                  <Marker position={mapCenter} draggable
                    eventHandlers={{
                      dragend: (event) => {
                        const pos = event.target.getLatLng();
                        setCoordinatesAndReverse(pos.lat, pos.lng);
                      },
                    }}>
                    <Popup>Drag to fine-tune field location</Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="field-lat" className={labelCls}>Latitude</label>
              <input id="field-lat" name="latitude" type="number" step="any" value={form.latitude} onChange={handleChange} placeholder="44.4497" className={inputCls} />
            </div>
            <div>
              <label htmlFor="field-lng" className={labelCls}>Longitude</label>
              <input id="field-lng" name="longitude" type="number" step="any" value={form.longitude} onChange={handleChange} placeholder="-92.2663" className={inputCls} />
            </div>
          </div>

          <div>
            <label htmlFor="field-comments" className={labelCls}>Comments</label>
            <textarea id="field-comments" name="comments" value={form.comments} onChange={handleChange} rows={3}
              placeholder="Parking info, field condition notes, etc."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>

          {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600">Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Add Field'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
