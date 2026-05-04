/* LeagueHaven Service Worker — push notifications + offline shell */

const CACHE_NAME = 'leaguehaven-v1';

// Install: cache the app shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Push event: show notification
self.addEventListener('push', (event) => {
  let data = { title: 'LeagueHaven', body: 'You have a new notification' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    if (event.data) data = { title: 'LeagueHaven', body: event.data.text() };
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'default',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click: navigate the app to the target URL (deep-links to the right chat channel)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If there's an existing app window, navigate it to the deep-link URL.
      // client.navigate() causes a page load to the new URL, which picks up the
      // ?page=chat&channelId=N params and opens the right channel.
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'navigate' in client) {
          return client.navigate(url).then(c => c?.focus?.()).catch(() => self.clients.openWindow(url));
        }
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
