import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  fetchLocations, createLocation, updateLocation, deleteLocation,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';

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

export default function FieldLocations({ orgId, orgName }) {
  const { canEditOrg } = useAuth();
  const editable = canEditOrg(orgId);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null);
  const markerRefs = useRef({});

  const load = useCallback(async () => {
    setLoading(true);
    try { setLocations(await fetchLocations(orgId)); }
    catch (err) { console.error('Failed to load locations', err); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(loc) {
    if (!window.confirm(`Delete field "${loc.name}"?`)) return;
    setDeleting(loc.id);
    try { await deleteLocation(loc.id); setLocations((prev) => prev.filter((l) => l.id !== loc.id)); }
    catch (err) { alert(`Failed to delete: ${err.message}`); }
    finally { setDeleting(null); }
  }

  function handleRowClick(loc) {
    if (!loc.latitude || !loc.longitude) return;
    setHighlightedId(loc.id);
    const marker = markerRefs.current[loc.id];
    if (marker) marker.openPopup();
  }

  const pins = locations.filter((l) => l.latitude && l.longitude);
  const defaultCenter = pins.length > 0
    ? [pins[0].latitude, pins[0].longitude]
    : [39.8283, -98.5795];

  return (
    <div className="mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <h3 className="text-base font-bold">Field Locations{orgName ? ` — ${orgName}` : ''}</h3>
        {editable && <button onClick={() => { setEditing(null); setShowForm(true); }} className={btnPrimary}>+ Add Field</button>}
      </div>

      {/* Map */}
      {!loading && pins.length > 0 && (
        <div className="rounded-lg overflow-hidden shadow-sm mb-4">
          <MapContainer center={defaultCenter} zoom={10} scrollWheelZoom style={{ height: '350px', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds locations={pins} />
            {pins.map((loc) => (
              <Marker
                key={loc.id}
                position={[loc.latitude, loc.longitude]}
                ref={(ref) => { if (ref) markerRefs.current[loc.id] = ref; }}
                eventHandlers={{
                  click: () => setHighlightedId(loc.id),
                  popupclose: () => setHighlightedId((prev) => prev === loc.id ? null : prev),
                }}
              >
                <Popup>
                  <strong>{loc.name}</strong>
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
        </div>
      )}

      {/* Locations list */}
      {loading ? (
        <div className="py-6 text-center text-gray-400">Loading locations…</div>
      ) : locations.length === 0 ? (
        <div className="py-8 text-center text-gray-400">No field locations yet.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block mt-3">
            <table className="w-full bg-gray-800 rounded-lg shadow-sm overflow-hidden text-sm">
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
                {locations.map((loc) => {
                  const hasPin = loc.latitude && loc.longitude;
                  const isHighlighted = highlightedId === loc.id;
                  return (
                    <tr
                      key={loc.id}
                      onClick={() => handleRowClick(loc)}
                      className={`
                        ${hasPin ? 'cursor-pointer hover:bg-blue-900/30' : ''}
                        ${isHighlighted ? 'bg-blue-100 shadow-[inset_3px_0_0] shadow-blue-600' : ''}
                        transition-colors
                      `}
                    >
                      <td className="px-3 py-2 font-semibold">{loc.name}</td>
                      <td className="px-3 py-2">{[loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ') || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{hasPin ? `${Number(loc.latitude).toFixed(4)}, ${Number(loc.longitude).toFixed(4)}` : '—'}</td>
                      <td className="px-3 py-2 text-gray-300">{loc.comments || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1.5 flex-wrap">
                          {hasPin && (
                            <a href={directionsUrl(loc)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                              className="px-2.5 py-1 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 no-underline">
                              Directions
                            </a>
                          )}
                          {editable && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); setEditing(loc); setShowForm(true); }} className={btnSecondary}>Edit</button>
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(loc); }} disabled={deleting === loc.id} className={btnDanger}>
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
          <div className="md:hidden space-y-3 mt-3">
            {locations.map((loc) => {
              const hasPin = loc.latitude && loc.longitude;
              const isHighlighted = highlightedId === loc.id;
              return (
                <div
                  key={loc.id}
                  onClick={() => handleRowClick(loc)}
                  className={`
                    bg-gray-800 rounded-lg border p-4
                    ${hasPin ? 'cursor-pointer' : ''}
                    ${isHighlighted ? 'border-blue-400 bg-blue-900/30 shadow-card' : 'border-gray-700'}
                  `}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-sm">{loc.name}</h4>
                    {hasPin && (
                      <span className="text-[10px] font-mono text-gray-400 shrink-0 ml-2">
                        {Number(loc.latitude).toFixed(4)}, {Number(loc.longitude).toFixed(4)}
                      </span>
                    )}
                  </div>
                  {(loc.address || loc.city) && (
                    <p className="text-sm text-gray-300 mb-1">{[loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ')}</p>
                  )}
                  {loc.comments && <p className="text-xs text-gray-400 mb-2">{loc.comments}</p>}
                  <div className="flex gap-2 pt-2 border-t border-gray-700" onClick={(e) => e.stopPropagation()}>
                    {hasPin && (
                      <a href={directionsUrl(loc)} target="_blank" rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 no-underline">
                        Directions
                      </a>
                    )}
                    {editable && (
                      <>
                        <button onClick={() => { setEditing(loc); setShowForm(true); }} className={btnSecondary}>Edit</button>
                        <button onClick={() => handleDelete(loc)} disabled={deleting === loc.id} className={btnDanger}>
                          {deleting === loc.id ? '…' : 'Del'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showForm && (
        <LocationForm orgId={orgId} location={editing}
          onDone={() => { setShowForm(false); setEditing(null); load(); }}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function LocationForm({ orgId, location, onDone, onCancel }) {
  const isEditing = !!location;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: location?.name || '', address: location?.address || '',
    city: location?.city || '', state: location?.state || '',
    zip: location?.zip || '', latitude: location?.latitude ?? '',
    longitude: location?.longitude ?? '', comments: location?.comments || '',
  });

  function handleChange(e) { setForm((prev) => ({ ...prev, [e.target.name]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError(null);
    const data = {
      org_id: orgId,
      name: form.name.trim() || null, address: form.address.trim() || null,
      city: form.city.trim() || null, state: form.state.trim() || null,
      zip: form.zip.trim() || null,
      latitude: form.latitude !== '' ? parseFloat(form.latitude) : null,
      longitude: form.longitude !== '' ? parseFloat(form.longitude) : null,
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
      <div className="bg-gray-800 rounded-xl shadow-xl w-full max-w-xl p-5 sm:p-6 my-4">
        <h2 className="text-xl font-bold mb-4">{isEditing ? 'Edit Field Location' : 'Add Field Location'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="loc-name" className={labelCls}>Field Name *</label>
            <input id="loc-name" name="name" type="text" value={form.name} onChange={handleChange} required placeholder="e.g. Community Park Field 1" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_70px_90px] gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="loc-address" className={labelCls}>Address</label>
              <input id="loc-address" name="address" type="text" value={form.address} onChange={handleChange} placeholder="123 Main St" className={inputCls} />
            </div>
            <div>
              <label htmlFor="loc-city" className={labelCls}>City</label>
              <input id="loc-city" name="city" type="text" value={form.city} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label htmlFor="loc-state" className={labelCls}>State</label>
              <input id="loc-state" name="state" type="text" value={form.state} onChange={handleChange} maxLength={2} placeholder="OH" className={inputCls} />
            </div>
            <div>
              <label htmlFor="loc-zip" className={labelCls}>ZIP</label>
              <input id="loc-zip" name="zip" type="text" value={form.zip} onChange={handleChange} maxLength={10} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="loc-lat" className={labelCls}>Latitude</label>
              <input id="loc-lat" name="latitude" type="number" step="any" value={form.latitude} onChange={handleChange} placeholder="41.4822" className={inputCls} />
            </div>
            <div>
              <label htmlFor="loc-lng" className={labelCls}>Longitude</label>
              <input id="loc-lng" name="longitude" type="number" step="any" value={form.longitude} onChange={handleChange} placeholder="-81.7987" className={inputCls} />
            </div>
          </div>

          <div>
            <label htmlFor="loc-comments" className={labelCls}>Comments</label>
            <textarea id="loc-comments" name="comments" value={form.comments} onChange={handleChange} rows={3}
              placeholder="Parking info, field condition notes, etc."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
          </div>

          {error && <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-700 text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-600">Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Add Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
