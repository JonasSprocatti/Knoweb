// Service worker mínimo: torna o app instalável na tela inicial.
// Não faz cache de dados — tudo vem do Supabase em tempo real.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
