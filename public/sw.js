// Service worker mínimo: torna o app instalável na tela inicial e recebe o resumo diário.
// Não faz cache de dados — tudo vem do Supabase em tempo real.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  const d = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(d.title || "Knoweb", {
      body: d.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: "resumo-diario", // o de hoje substitui o de ontem
      data: { url: d.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.location.origin));
      return open ? open.navigate(url).then((c) => (c || open).focus()) : self.clients.openWindow(url);
    }),
  );
});
