"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useT } from "@/i18n";
import { usePrefs } from "@/store/prefs";
import { useForge } from "@/store/store";
import { cn } from "@/components/ui/primitives";
import { NAV, isActive } from "./nav";

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5" dir="ltr">
      <svg aria-hidden width="26" height="26" viewBox="0 0 26 26" className="shrink-0">
        <path d="M1 1h18l6 6v18H1z" fill="none" stroke="var(--forge)" strokeWidth="1.5" />
        <path d="M7 8h10v3H10.5v2.5H15v3h-4.5V19H7z" fill="var(--forge)" />
      </svg>
      {!compact && (
        <span className="display text-[21px] tracking-[0.14em] text-ink">
          FORGE<sup className="ms-0.5 align-super font-sans text-[9px] font-medium tracking-normal text-ink-3">®</sup>
        </span>
      )}
    </span>
  );
}

export function Sidebar() {
  const { t } = useT();
  const pathname = usePathname();
  const collapsed = usePrefs((s) => s.sidebarCollapsed);
  const setCollapsed = usePrefs((s) => s.setSidebarCollapsed);
  const openAlerts = useForge((s) => s.alerts.filter((a) => a.status === "open").length);

  return (
    <aside
      className={cn(
        "no-print sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-e border-line bg-base transition-[width] duration-200 ease-forge lg:flex",
        collapsed ? "w-[60px]" : "w-[232px]",
      )}
    >
      <div className={cn("flex h-[52px] shrink-0 items-center border-b border-line", collapsed ? "justify-center" : "px-4")}>
        <Link href="/overview" aria-label="FORGE" className="rounded-sm">
          <Logo compact={collapsed} />
        </Link>
      </div>

      <nav aria-label={t("nav.primary")} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-3">
        {NAV.map((section) => (
          <div key={section.label} className="mb-3">
            {collapsed ? (
              <div aria-hidden className="mx-auto mb-2 h-px w-6 bg-line" />
            ) : (
              <p className="label px-4 pb-1.5">{t(section.label)}</p>
            )}
            <ul className={cn("flex flex-col gap-px", collapsed ? "px-2" : "px-2")}>
              {section.items.map((item) => {
                const active = isActive(item, pathname);
                const badge = item.href === "/overview" && openAlerts > 0 ? openAlerts : null;
                return (
                  <li key={item.href} className="group/nav relative">
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      aria-label={collapsed ? t(item.label) : undefined}
                      className={cn(
                        "relative flex h-8 items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors duration-100",
                        collapsed ? "justify-center px-0" : "px-2.5",
                        active ? "bg-raised text-ink" : "text-ink-2 hover:bg-raised/60 hover:text-ink",
                      )}
                    >
                      {active && <span aria-hidden className="absolute inset-y-1.5 -start-2 w-[3px] rounded-e-sm bg-forge" />}
                      <item.icon aria-hidden className={cn("size-4 shrink-0", active ? "text-forge-text" : "text-ink-3")} strokeWidth={2} />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>}
                      {badge !== null &&
                        (collapsed ? (
                          <span aria-hidden className="absolute end-1.5 top-1 size-1.5 rounded-full bg-danger" />
                        ) : (
                          <span className="num rounded-sm bg-danger/15 px-1.5 text-[10.5px] font-semibold text-danger">{badge}</span>
                        ))}
                    </Link>
                    {collapsed && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute start-full top-1/2 z-50 ms-2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-line-2 bg-panel px-2 py-1 text-[11.5px] font-medium text-ink opacity-0 shadow-pop transition-opacity delay-150 group-focus-within/nav:opacity-100 group-hover/nav:opacity-100"
                      >
                        {t(item.label)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("shrink-0 border-t border-line p-2", collapsed ? "flex justify-center" : "flex items-center justify-between gap-2")}>
        {!collapsed && <p className="ps-2 text-[10.5px] leading-tight text-ink-3">{t("brand.demo")}</p>}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          aria-expanded={!collapsed}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-raised hover:text-ink"
        >
          {collapsed ? <PanelLeftOpen aria-hidden className="size-4 rtl:-scale-x-100" /> : <PanelLeftClose aria-hidden className="size-4 rtl:-scale-x-100" />}
        </button>
      </div>
    </aside>
  );
}
