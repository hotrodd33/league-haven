import { useState, useEffect, useCallback } from 'react';
import { fetchVapidKey, pushSubscribe, pushUnsubscribe, fetchPushStatus } from '../api/index.js';

/**
 * Convert a base64 VAPID key to a Uint8Array for the Push API.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Hook for managing push notification subscriptions.
 * Returns { supported, permission, subscribed, loading, subscribe, unsubscribe }
 */
export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window;
    setSupported(ok);
    if (!ok) { setLoading(false); return; }

    setPermission(Notification.permission);

    // Check server-side status
    fetchPushStatus()
      .then((data) => setSubscribed(data.subscribed))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported) return false;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') { setLoading(false); return false; }

      const { publicKey } = await fetchVapidKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const subJson = sub.toJSON();
      await pushSubscribe({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      });

      setSubscribed(true);
      setLoading(false);
      return true;
    } catch (err) {
      console.error('Push subscribe failed:', err);
      setLoading(false);
      return false;
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await pushUnsubscribe(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    }
    setLoading(false);
  }, []);

  return { supported, permission, subscribed, loading, subscribe, unsubscribe };
}
