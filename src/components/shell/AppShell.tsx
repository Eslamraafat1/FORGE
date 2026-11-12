"use client";
import { MotionConfig } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useT } from "@/i18n";
import { SIM_INTERVAL_MS } from "@/lib/time";
import { applyPrefsToDocument, usePrefs, useReducedMotion } from "@/store/prefs";
import { useForge } from "@/store/store";
import { Toaster } from "@/components/ui/toast";
import { CommandPalette } from "./CommandPalette";
import { MobileNav } from "./MobileNav";
import { NotificationCenter } from "./NotificationCenter";
import { Logo, Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/** Application entrance: shown while persisted state is restored. */
function BootScreen() {
  const { t } = useT();
  return (
    <div className="grid-bg flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-6" role="status" aria-live="polite">
      <div className="animate-rise">
        <Logo />
      </div>
      <div className="w-56">
        <div className="relative h-px overflow-hidden bg-line">
          <span className="absolute inset-y-0 w-1/2 animate-sweep bg-gradient-to-r from-transparent via-forge to-transparent" />
        </div>
        <p className="label mt-3 text-center">{t("shell.boot.title")}</p>
      </div>
    </div>
  );
}

/** Drives the deterministic simulation clock. Pauses when the tab is hidden. */
function useSimulation(enabled: boolean) {
  const running = useForge((s) => s.simRunning);
  useEffect(() => {
    if (!enabled || !running) return;
    const id = window.setInterval(() => {
      if (!document.hidden) useForge.getState().simTick();
    }, SIM_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled, running]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useT();
  const pathname = usePathname();
  const hydrated = useForge((s) => s.hydrated);
  const reduced = useReducedMotion();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Restore persisted preferences and demo data on the client only (avoids hydration mismatches).
  useEffect(() => {
    const unsub = usePrefs.subscribe((s) => applyPrefsToDocument(s));
    let cancelled = false;
    (async () => {
      await usePrefs.persist.rehydrate();
      applyPrefsToDocument(usePrefs.getState());
      await useForge.persist.rehydrate();
      // Hold the entrance for a beat so it reads as a deliberate transition, not a flash.
      const hold = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420;
      window.setTimeout(() => !cancelled && useForge.getState().setHydrated(), hold);
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useSimulation(hydrated);

  // Global shortcut: Ctrl/Cmd + K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!hydrated) return <BootScreen />;

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <a href="#main" className="no-print sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-forge focus:px-3 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-forge-ink">
        {t("nav.skip")}
      </a>
      <div className="flex min-h-dvh animate-fade">
        <Sidebar />
        <div className="print-area flex min-w-0 flex-1 flex-col">
          <Topbar onOpenPalette={() => setPaletteOpen(true)} onOpenNotifications={() => setNotificationsOpen(true)} />
          <main id="main" tabIndex={-1} className="print-area min-w-0 flex-1 pb-[70px] outline-none lg:pb-0">
            {/* Keyed by route: each page enters with the same short rise. */}
            <div key={pathname} className="animate-rise">
              {children}
            </div>
          </main>
        </div>
      </div>
      <MobileNav />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <NotificationCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      <Toaster />
    </MotionConfig>
  );
}
