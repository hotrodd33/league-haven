import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  fetchLocations, createLocation, updateLocation, deleteLocation,
} from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { locationDirectionsUrl as directionsUrl } from '../utils/directions.js';
import { Button, Input, Card, CardBody, Modal, Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell } from './ui';

// Fix default marker icons for bundled builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DEFAULT_MAP_CENTER = [44.4497, -92.2663]; // Lake City, MN

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
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
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
    : DEFAULT_MAP_CENTER;

  return (
    <div className="mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <h3 className="text-base font-display font-bold text-white">Field Locations{orgName ? ` — ${orgName}` : ''}</h3>
        {editable && <Button onClick={() => { setEditing(null); setShowForm(true); }}>+ Add Field</Button>}
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
            <table className="w-full bg-gray-800 rounded-lg shadow-sm overflow-hidden text-sm text-gray-200">
              <thead>
                <tr className="bg-gray-800 border-b-2 border-gray-700">
                  <th className="px-3 py-2 text-left eyebrow">Name</th>
                  <th className="px-3 py-2 text-left eyebrow">Address</th>
                  <th className="px-3 py-2 text-left eyebrow">Lat / Lng</th>
                  <th className="px-3 py-2 text-left eyebrow">Comments</th>
                  <th className="px-3 py-2 text-left eyebrow w-44">{editable ? 'Actions' : 'Directions'}</th>
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
                        ${hasPin ? 'cursor-pointer hover:bg-chrome-900/30' : ''}
                        ${isHighlighted ? 'bg-chrome-900/30 shadow-[inset_3px_0_0] shadow-chrome-500' : ''}
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
                              className="btn btn-xs btn-primary no-underline">
                              Directions
                            </a>
                          )}
                          {editable && (
                            <>
                              <Button size="xs" variant="secondary" onClick={(e) => { e.stopPropagation(); setEditing(loc); setShowForm(true); }}>Edit</Button>
                              <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); handleDelete(loc); }} disabled={deleting === loc.id}>
                                {deleting === loc.id ? '…' : 'Del'}
                              </Button>
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
                    bg-gray-800 rounded-lg border p-4 text-gray-200
                    ${hasPin ? 'cursor-pointer' : ''}
                    ${isHighlighted ? 'border-chrome-400 bg-chrome-900/30 shadow-card' : 'border-gray-700'}
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
                        className="btn btn-xs btn-primary no-underline">
                        Directions
                      </a>
                    )}
                    {editable && (
                      <>
                        <Button size="xs" variant="secondary" onClick={() => { setEditing(loc); setShowForm(true); }}>Edit</Button>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(loc)} disabled={deleting === loc.id}>
                          {deleting === loc.id ? '…' : 'Del'}
                        </Button>
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

export function LocationForm({ orgId, location, onDone, onCancel }) {
  const isEditing = !!location;
  const [saving, setSaving] = useState(false);
  const [locatingByAddress, setLocatingByAddress] = useState(false);
  const [locatingByDevice, setLocatingByDevice] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: location?.name || '', address: location?.address || '',
    city: location?.city || '', state: location?.state || '',
    zip: location?.zip || '', latitude: location?.latitude ?? '',
    longitude: location?.longitude ?? '', comments: location?.comments || '',
  });

  const parsedLat = Number(form.latitude);
  const parsedLng = Number(form.longitude);
  const hasValidPin = Number.isFinite(parsedLat) && Number.isFinite(parsedLng);
  const mapCenter = hasValidPin ? [parsedLat, parsedLng] : DEFAULT_MAP_CENTER;

  function setCoordinates(lat, lng) {
    setForm((prev) => ({
      ...prev,
      latitude: Number(lat).toFixed(6),
      longitude: Number(lng).toFixed(6),
    }));
  }

  async function setCoordinatesAndReverse(lat, lng) {
    setCoordinates(lat, lng);
    setReverseGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'LeagueHaven/1.0' } });
      if (res.ok) {
        const data = await res.json();
        if (data.address) {
          const a = data.address;
          // Build street address: prefer house_number + road, fall back to any
          // named path/route, then park/leisure/amenity name for fields with no road.
          const streetAddr = [a.house_number, a.road || a.pedestrian || a.footway || a.path].filter(Boolean).join(' ')
            || a.leisure || a.amenity || a.building || a.tourism || '';
          setForm(prev => ({
            ...prev,
            address: streetAddr || prev.address,
            city: a.city || a.town || a.village || a.hamlet || prev.city,
            state: a.state ? (a['ISO3166-2-lvl4']?.split('-')[1] || a.state) : prev.state,
            zip: a.postcode || prev.zip,
          }));
        }
      }
    } catch (err) {
      console.warn('Reverse geocoding failed:', err.message);
    } finally { setReverseGeocoding(false); }
  }

  // Auto-use device location for new fields
  useEffect(() => {
    if (isEditing || !navigator.geolocation) return;
    setLocatingByDevice(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates(position.coords.latitude, position.coords.longitude);
        setLocatingByDevice(false);
      },
      () => { setLocatingByDevice(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e) { setForm((prev) => ({ ...prev, [e.target.name]: e.target.value })); }

  async function handleLocateByAddress() {
    const q = [form.address, form.city, form.state, form.zip].filter(Boolean).join(', ').trim();
    if (!q) {
      setError('Enter an address, city/state, or ZIP, then click Find on map.');
      return;
    }
    setLocatingByAddress(true);
    setError(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });
      if (!res.ok) throw new Error('Address lookup failed');
      const results = await res.json();
      if (!Array.isArray(results) || !results.length) {
        throw new Error('No map result found for that address');
      }
      setCoordinates(results[0].lat, results[0].lon);
    } catch (err) {
      setError(err.message || 'Failed to find that address on the map');
    } finally {
      setLocatingByAddress(false);
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser.');
      return;
    }
    setLocatingByDevice(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinatesAndReverse(position.coords.latitude, position.coords.longitude);
        setLocatingByDevice(false);
      },
      (geoErr) => {
        setError(geoErr.message || 'Unable to retrieve your current location');
        setLocatingByDevice(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError(null);
    const latitude = form.latitude !== '' ? parseFloat(form.latitude) : null;
    const longitude = form.longitude !== '' ? parseFloat(form.longitude) : null;
    if (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      setSaving(false);
      setError('Latitude must be a number between -90 and 90.');
      return;
    }
    if (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      setSaving(false);
      setError('Longitude must be a number between -180 and 180.');
      return;
    }
    const data = {
      org_id: orgId,
      name: form.name.trim() || null, address: form.address.trim() || null,
      city: form.city.trim() || null, state: form.state.trim() || null,
      zip: form.zip.trim() || null,
      latitude,
      longitude,
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
    <Modal open onClose={onCancel} size="lg" title={isEditing ? 'Edit Field Location' : 'Add Field Location'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Field Name *" id="loc-name" name="name" type="text" value={form.name} onChange={handleChange} required placeholder="e.g. Community Park Field 1" />

          <div className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_70px_90px] gap-3">
            <Input wrapperClassName="col-span-2 sm:col-span-1" label="Address" id="loc-address" name="address" type="text" value={form.address} onChange={handleChange} placeholder="123 Main St" />
            <Input label="City" id="loc-city" name="city" type="text" value={form.city} onChange={handleChange} />
            <Input label="State" id="loc-state" name="state" type="text" value={form.state} onChange={handleChange} maxLength={2} placeholder="OH" />
            <Input label="ZIP" id="loc-zip" name="zip" type="text" value={form.zip} onChange={handleChange} maxLength={10} />
          </div>

          {reverseGeocoding && <p className="text-xs text-chrome-400">Looking up address from pin…</p>}

          <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-100">Pin this field on map</p>
                <p className="text-xs text-gray-400">Click the map or drag the pin — address auto-fills from the pin location.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="xs"
                  onClick={handleLocateByAddress}
                  disabled={locatingByAddress}
                  loading={locatingByAddress}
                >
                  {locatingByAddress ? 'Finding…' : 'Find on map'}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={handleUseMyLocation}
                  disabled={locatingByDevice}
                >
                  {locatingByDevice ? 'Locating…' : 'Use my location'}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  onClick={() => setForm((prev) => ({ ...prev, latitude: '', longitude: '' }))}
                >
                  Clear pin
                </Button>
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
                  <Marker
                    position={mapCenter}
                    draggable
                    eventHandlers={{
                      dragend: (event) => {
                        const marker = event.target;
                        const pos = marker.getLatLng();
                        setCoordinatesAndReverse(pos.lat, pos.lng);
                      },
                    }}
                  >
                    <Popup>Drag to fine-tune field location</Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Latitude" id="loc-lat" name="latitude" type="number" step="any" value={form.latitude} onChange={handleChange} placeholder="41.4822" />
            <Input label="Longitude" id="loc-lng" name="longitude" type="number" step="any" value={form.longitude} onChange={handleChange} placeholder="-81.7987" />
          </div>

          <div>
            <label htmlFor="loc-comments" className="eyebrow block">Comments</label>
            <textarea id="loc-comments" name="comments" value={form.comments} onChange={handleChange} rows={3}
              placeholder="Parking info, field condition notes, etc."
              className="lh-input mt-1" />
          </div>

          {error && <div className="lh-alert lh-alert-error">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving} loading={saving}>
              {saving ? 'Saving…' : isEditing ? 'Update' : 'Add Location'}
            </Button>
          </div>
        </form>
    </Modal>
  );
}
