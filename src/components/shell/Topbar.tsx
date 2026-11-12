"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { Bell, Check, ChevronRight, Languages, Moon, Pause, Play, Search, Sun } from "lucide-react";
import { CURRENT_USER_ID } from "@/data/seed";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { ROLES } from "@/lib/permissions";
import { shiftAt } from "@/lib/time";
import { usePrefs } from "@/store/prefs";
import { useForge } from "@/store/store";
import { Popover } from "@/components/ui/overlay";
import { Avatar } from "@/components/ui/page";
import { IconButton, Tooltip, cn } from "@/components/ui/primitives";
import { Logo } from "./Sidebar";
import { findNavItem } from "./nav";

function Breadcrumbs() {
  const { t } = useT();
  const pathname = usePathname();
  const item = findNavItem(pathname);
  const parts = pathname.split("/").filter(Boolean);
  const detail = parts.length > 1 ? decodeURIComponent(parts[parts.length - 1]) : null;
  if (!item) return null;
  return (
    <nav aria-label={t("nav.breadcrumb")} className="hidden min-w-0 items-center gap-1.5 text-[12.5px] md:flex">
      <span className="label hidden xl:inline">FORGE</span>
      <ChevronRight aria-hidden className="hidden size-3 text-ink-3 xl:inline rtl:-scale-x-100" />
      {detail ? (
        <Fragment>
          <Link href={item.href} className="truncate text-ink-2 hover:text-ink">
            {t(item.label)}
          </Link>
          <ChevronRight aria-hidden className="size-3 shrink-0 text-ink-3 rtl:-scale-x-100" />
          <span aria-current="page" className="code truncate text-[12px] font-medium text-ink">
            {detail}
          </span>
        </Fragment>
      ) : (
        <span aria-current="page" className="truncate font-medium text-ink">
          {t(item.label)}
        </span>
      )}
    </nav>
  );
}

/** Simulated clock + shift + pause/resume. Makes the simulation visibly identifiable. */
function SimClock() {
  const { t, td } = useT();
  const fmt = useFmt();
  const now = useForge((s) => s.now);
  const running = useForge((s) => s.simRunning);
  const setRunning = useForge((s) => s.setSimRunning);
  const shift = shiftAt(now);
  return (
    <div className="flex h-[34px] items-center rounded-md border border-dashed border-line-2 bg-canvas/60 ps-2.5">
      <Tooltip label={t("shell.simNote")} side="bottom">
        <span className="flex items-center gap-2" tabIndex={0}>
          <span aria-hidden className={cn("size-1.5 rounded-full", running ? "animate-pulse-dot bg-ok" : "bg-amber")} />
          <span className="label hidden !text-[10px] sm:inline">{t("common.simulated")}</span>
          <span className="code num text-[12.5px] font-medium text-ink" aria-label={t("shell.simClock")}>
            {fmt.time(now)}
          </span>
          <span className="hidden text-[11.5px] text-ink-3 2xl:inline">{td(`shift.${shift.id}`)}</span>
          <span className="sr-only">{running ? t("shell.simRunning") : t("shell.simPaused")}</span>
        </span>
      </Tooltip>
      <IconButton size="sm" className="mx-0.5" icon={running ? Pause : Play} label={running ? t("shell.simPause") : t("shell.simResume")} aria-pressed={!running} onClick={() => setRunning(!running)} />
    </div>
  );
}

function ProfileMenu() {
  const { t, td, tl } = useT();
  const me = useForge((s) => s.team.find((m) => m.id === CURRENT_USER_ID)!);
  const role = useForge((s) => s.role);
  const setRole = useForge((s) => s.setRole);
  return (
    <Popover
      label={t("shell.profile")}
      width={280}
      trigger={(p) => (
        <button type="button" aria-label={t("shell.profile")} className="flex h-[34px] items-center gap-2 rounded-md border border-transparent ps-1 pe-1 hover:bg-raised xl:pe-2.5" {...p}>
          <Avatar member={me} size={26} />
          <span className="hidden min-w-0 text-start leading-tight xl:block">
            <span className="block max-w-[130px] truncate text-[12.5px] font-semibold text-ink">{tl(me.name)}</span>
            <span className="block max-w-[130px] truncate text-[10.5px] text-ink-3">{td(`role.${role}`)}</span>
          </span>
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center gap-3 border-b border-line p-3">
            <Avatar member={me} size={34} />
            <div className="min-w-0">
              <p className="label">{t("shell.signedInAs")}</p>
              <p className="truncate text-[13px] font-semibold text-ink">{tl(me.name)}</p>
              <p className="code truncate text-[11px] text-ink-3">{me.email}</p>
            </div>
          </div>
          <div className="p-1.5">
            <p className="label px-2 pb-1 pt-1.5">{t("shell.role")}</p>
            <div role="radiogroup" aria-label={t("shell.role")}>
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={r === role}
                  onClick={() => {
                    setRole(r);
                    close();
                  }}
                  className={cn("flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-start text-[12.5px] hover:bg-panel", r === role ? "text-ink" : "text-ink-2")}
                >
                  {td(`role.${r}`)}
                  {r === role && <Check aria-hidden className="size-3.5 text-forge-text" />}
                </button>
              ))}
            </div>
            <p className="mt-1 border-t border-line px-2 pb-1 pt-2 text-[11px] leading-snug text-ink-3">{t("shell.roleNote")}</p>
          </div>
        </div>
      )}
    </Popover>
  );
}

export function Topbar({ onOpenPalette, onOpenNotifications }: { onOpenPalette: () => void; onOpenNotifications: () => void }) {
  const { t, lang } = useT();
  const theme = usePrefs((s) => s.theme);
  const toggleTheme = usePrefs((s) => s.toggleTheme);
  const setLang = usePrefs((s) => s.setLang);
  const unread = useForge((s) => s.notifications.filter((n) => !n.read).length);

  return (
    <header className="no-print sticky top-0 z-20 flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-base/95 px-3 backdrop-blur-sm sm:px-4">
      <Link href="/overview" aria-label="FORGE" className="me-1 rounded-sm lg:hidden">
        <Logo />
      </Link>
      <Breadcrumbs />

      <div className="ms-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label={t("shell.search")}
          aria-keyshortcuts="Control+K Meta+K"
          className="flex h-[34px] items-center gap-2 rounded-md border border-line bg-canvas/60 px-2.5 text-[12.5px] text-ink-3 transition-colors hover:border-line-2 hover:text-ink md:w-[220px] xl:w-[280px]"
        >
          <Search aria-hidden className="size-3.5 shrink-0" />
          <span className="hidden min-w-0 flex-1 truncate text-start md:inline">{t("shell.search")}</span>
          <kbd className="code hidden rounded-sm border border-line px-1.5 py-px text-[10.5px] md:inline">Ctrl K</kbd>
        </button>

        <SimClock />

        <span className="hidden sm:contents">
          <IconButton icon={Languages} label={`${t("shell.lang")}: ${lang === "ar" ? "English" : "العربية"}`} onClick={() => setLang(lang === "ar" ? "en" : "ar")} />
          <IconButton icon={theme === "dark" ? Sun : Moon} label={theme === "dark" ? t("shell.theme.toLight") : t("shell.theme.toDark")} onClick={toggleTheme} />
        </span>

        <span className="relative">
          <IconButton icon={Bell} label={unread > 0 ? `${t("shell.notifications")} — ${t("notif.unread", { n: unread })}` : t("shell.notifications")} onClick={onOpenNotifications} />
          {unread > 0 && (
            <span aria-hidden className="num pointer-events-none absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-forge px-1 text-[9.5px] font-bold text-forge-ink">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>

        <ProfileMenu />
      </div>
    </header>
  );
}
