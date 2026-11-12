"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PREFS_KEY } from "@/lib/boot-script";

export type Lang = "en" | "ar";
export type Theme = "dark" | "light";
export type Numerals = "latn" | "arab";
export type MotionPref = "system" | "reduced";

export { PREFS_KEY };

interface PrefsState {
  theme: Theme;
  lang: Lang;
  /** Digit style used when the interface is in Arabic. */
  numerals: Numerals;
  motion: MotionPref;
  sidebarCollapsed: boolean;
  recentSearches: string[];
  /** Prefer the 2D factory map over the 3D scene. */
  factory2d: boolean;
  setTheme(theme: Theme): void;
  toggleTheme(): void;
  setLang(lang: Lang): void;
  setNumerals(n: Numerals): void;
  setMotion(m: MotionPref): void;
  setSidebarCollapsed(v: boolean): void;
  setFactory2d(v: boolean): void;
  addRecentSearch(q: string): void;
  clearRecentSearches(): void;
}

/** Mirror preferences onto <html> so CSS and the browser react immediately. */
export function applyPrefsToDocument(p: { theme: Theme; lang: Lang; motion: MotionPref }) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.dataset.theme = p.theme;
  el.lang = p.lang;
  el.dir = p.lang === "ar" ? "rtl" : "ltr";
  el.dataset.motion = p.motion;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      lang: "en",
      numerals: "latn",
      motion: "system",
      sidebarCollapsed: false,
      recentSearches: [],
      factory2d: false,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setLang: (lang) => set({ lang }),
      setNumerals: (numerals) => set({ numerals }),
      setMotion: (motion) => set({ motion }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setFactory2d: (factory2d) => set({ factory2d }),
      addRecentSearch: (q) => {
        const v = q.trim();
        if (v.length < 2) return;
        set({ recentSearches: [v, ...get().recentSearches.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 6) });
      },
      clearRecentSearches: () => set({ recentSearches: [] }),
    }),
    { name: PREFS_KEY, version: 1, skipHydration: true },
  ),
);

/** True when motion should be minimised (OS setting or the in-app preference). */
export function useReducedMotion(): boolean {
  const pref = usePrefs((s) => s.motion);
  const system = useSystemReducedMotion();
  return pref === "reduced" || system;
}

import { useSyncExternalStore } from "react";

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
