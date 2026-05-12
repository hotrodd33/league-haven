export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as MacIntel with touch support
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
}

export function directionsUrl(destination) {
  const q = encodeURIComponent(destination || '');
  // maps:// is a URL scheme the iOS OS intercepts in any browser
  // (Safari, Chrome, Edge, Firefox), guaranteeing Apple Maps opens.
  return isIOS()
    ? `maps://?daddr=${q}`
    : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

export function locationDirectionsUrl(loc) {
  const addr = [loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ');
  const dest = addr || (loc.latitude != null && loc.longitude != null
    ? `${loc.latitude},${loc.longitude}`
    : '');
  return directionsUrl(dest);
}
