import { useEffect, useRef, useState } from 'react';

const DEFAULT_IDLE_MS = 10 * 60 * 1000;

function setIfChanged(setter, next) {
  setter((prev) => (prev === next ? prev : next));
}

// True while the tab is visible and the user has interacted recently.
// Background and abandoned tabs stay false so they do not poll the API.
export function useTabActive(idleMs = DEFAULT_IDLE_MS) {
  const [active, setActive] = useState(() => typeof document !== 'undefined' && !document.hidden);

  useEffect(() => {
    let idleTimer = null;

    function clearIdle() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
    }

    function markActive() {
      if (document.hidden) {
        clearIdle();
        setIfChanged(setActive, false);
        return;
      }
      setIfChanged(setActive, true);
      clearIdle();
      idleTimer = setTimeout(() => setIfChanged(setActive, false), idleMs);
    }

    markActive();

    const opts = { passive: true };
    window.addEventListener('pointerdown', markActive, opts);
    window.addEventListener('keydown', markActive);
    window.addEventListener('scroll', markActive, opts);
    document.addEventListener('visibilitychange', markActive);

    return () => {
      clearIdle();
      window.removeEventListener('pointerdown', markActive);
      window.removeEventListener('keydown', markActive);
      window.removeEventListener('scroll', markActive);
      document.removeEventListener('visibilitychange', markActive);
    };
  }, [idleMs]);

  return active;
}

export function useDocumentVisible() {
  const [visible, setVisible] = useState(() => typeof document !== 'undefined' && !document.hidden);

  useEffect(() => {
    function onChange() {
      setIfChanged(setVisible, !document.hidden);
    }
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return visible;
}

// Refetch once when `active` flips from false to true. Skips the initial mount.
export function useRefetchWhenActive(active, refetch) {
  const wasActive = useRef(active);

  useEffect(() => {
    if (active && !wasActive.current) refetch();
    wasActive.current = active;
  }, [active, refetch]);
}
