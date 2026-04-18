import { useState, useCallback } from 'react';

const STORAGE_KEY = 'lh-ticker-dismissed';
const TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export function useTickerDismiss() {
  const [dismissedAt, setDismissedAt] = useState(() => {
    try { return Number(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
  });

  const isDismissed = !!dismissedAt && (Date.now() - dismissedAt < TTL_MS);

  const dismiss = useCallback(() => {
    const now = Date.now();
    try { localStorage.setItem(STORAGE_KEY, String(now)); } catch {}
    setDismissedAt(now);
  }, []);

  return { isDismissed, dismiss };
}
