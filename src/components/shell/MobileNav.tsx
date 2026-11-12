"use client";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Boxes, ClipboardList, Languages, LayoutDashboard, Menu as MenuIcon, Moon, Sun, X } from "lucide-react";
import { useT } from "@/i18n";
import { usePrefs } from "@/store/prefs";
import { useForge } from "@/store/store";
import { cn } from "@/components/ui/primitives";
import { NAV, isActive, type NavItem } from "./nav";

/** The four destinations a floor user needs one tap away; everything else lives in the sheet. */
const TABS: NavItem[] = [
  { href: "/overview", label: "nav.overview", icon: LayoutDashboard },
  { href: "/operations", label: "nav.operations", icon: Activity },
  { href: "/work-orders", label: "nav.workOrders", icon: ClipboardList },
  { href: "/inventory", label: "nav.inventory", icon: Boxes },
];

export function MobileNav() {
  const { t, lang } = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const theme = usePrefs((s) => s.theme);
  const toggleTheme = usePrefs((s) => s.toggleTheme);
  const setLang = usePrefs((s) => s.setLang);
  const openAlerts = useForge((s) => s.alerts.filter((a) => a.status === "open").length);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const inTabs = TABS.some((x) => isActive(x, pathname));

  return (
    <>
      <nav aria-label={t("nav.primary")} className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden">
        {TABS.map((item) => {
          const active = isActive(item, pathname);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("relative flex h-[58px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium", active ? "text-ink" : "text-ink-3")}>
              {active && <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 bg-forge" />}
              <span className="relative">
                <item.icon aria-hidden className={cn("size-[18px]", active && "text-forge-text")} />
                {item.href === "/overview" && openAlerts > 0 && <span aria-hidden className="absolute -end-1.5 -top-1 size-2 rounded-full bg-danger" />}
              </span>
              <span className="max-w-full truncate px-1">{t(item.label)}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className={cn("relative flex h-[58px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium", !inTabs ? "text-ink" : "text-ink-3")}>
          {!inTabs && <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 bg-forge" />}
          <MenuIcon aria-hidden className={cn("size-[18px]", !inTabs && "text-forge-text")} />
          {t("nav.more")}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <div className="no-print fixed inset-0 z-[70] lg:hidden">
            <motion.div className="absolute inset-0 bg-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} onClick={() => setOpen(false)} aria-hidden />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={t("nav.menu")}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.24, ease: [0.2, 0.7, 0.2, 1] }}
              className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col border-t border-line-2 bg-base pb-[env(safe-area-inset-bottom)]"
              onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="text-[14px] font-semibold text-ink">{t("nav.menu")}</p>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="flex h-9 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] font-medium text-ink-2">
                    <Languages aria-hidden className="size-3.5" />
                    {lang === "ar" ? "English" : "العربية"}
                  </button>
                  <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? t("shell.theme.toLight") : t("shell.theme.toDark")} className="flex size-9 items-center justify-center rounded-md border border-line text-ink-2">
                    {theme === "dark" ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
                  </button>
                  <button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} className="flex size-9 items-center justify-center rounded-md text-ink-2">
                    <X aria-hidden className="size-4" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {NAV.map((section) => (
                  <div key={section.label} className="mb-4">
                    <p className="label mb-2">{t(section.label)}</p>
                    <ul className="grid grid-cols-3 gap-2">
                      {section.items.map((item) => {
                        const active = isActive(item, pathname);
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              aria-current={active ? "page" : undefined}
                              className={cn("flex h-[72px] flex-col items-start justify-between rounded-md border p-2.5 text-[12px] font-medium leading-tight", active ? "border-forge/60 bg-forge/10 text-ink" : "border-line bg-raised/50 text-ink-2")}
                            >
                              <item.icon aria-hidden className={cn("size-4", active ? "text-forge-text" : "text-ink-3")} />
                              {t(item.label)}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                <p className="pb-2 text-center text-[11px] text-ink-3">{t("brand.demo")}</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
