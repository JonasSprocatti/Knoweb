"use client";

import { useEffect } from "react";

/** Registra o service worker para o app poder ser instalado na tela inicial do celular. */
export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}
