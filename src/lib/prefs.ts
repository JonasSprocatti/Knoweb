/** Preferências visuais (Configurações): ficam neste aparelho e viram atributos no <html>. */
export const PREFS_KEY = "knoweb:prefs";

export type Prefs = {
  theme: "auto" | "light" | "dark";
  palette: "knoweb" | "ambar" | "cobalto" | "violeta" | "grafite";
  size: "normal" | "grande";
  motion: "auto" | "reduce";
};
export const DEFAULT_PREFS: Prefs = { theme: "auto", palette: "knoweb", size: "normal", motion: "auto" };

export function applyPrefs(p: Prefs) {
  const el = document.documentElement;
  if (p.theme === "auto") el.removeAttribute("data-theme");
  else el.dataset.theme = p.theme;
  el.dataset.palette = p.palette;
  el.dataset.size = p.size;
  el.dataset.motion = p.motion;
}

/** Roda antes da tela aparecer (no <head>), para não piscar com o tema errado. */
export const PREFS_BOOT = `try{var p=JSON.parse(localStorage.getItem("${PREFS_KEY}")||"{}"),e=document.documentElement;if(p.theme&&p.theme!=="auto")e.dataset.theme=p.theme;e.dataset.palette=p.palette||"knoweb";if(p.size)e.dataset.size=p.size;if(p.motion)e.dataset.motion=p.motion}catch(_){}`;
