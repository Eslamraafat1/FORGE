"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, BellOff, Check, CheckCheck, CheckCircle2, ExternalLink, History, Info, Trash2, X } from "lucide-react";
import type { ActivityEvent, EventCategory, Notification, Severity } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { entityHref } from "@/lib/routes";
import { useForge } from "@/store/store";
import { Drawer } from "@/components/ui/overlay";
import { Button, EmptyState, IconButton, Select, Tabs, cn, toneText } from "@/components/ui/primitives";
import { SEVERITY_TONE } from "@/components/ui/status";

const CATEGORIES: EventCategory[] = ["production", "quality", "inventory", "maintenance", "logistics", "procurement", "system"];
const SEVERITIES: Severity[] = ["critical", "warning", "info", "success"];
export const SEVERITY_ICON = { info: Info, warning: AlertTriangle, critical: AlertOctagon, success: CheckCircle2 } as const;

export function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, td, tm, tl } = useT();
  const fmt = useFmt();
  const notifications = useForge((s) => s.notifications);
  const activity = useForge((s) => s.activity);
  const team = useForge((s) => s.team);
  const now = useForge((s) => s.now);
  const markRead = useForge((s) => s.markNotificationRead);
  const markAll = useForge((s) => s.markAllNotificationsRead);
  const clear = useForge((s) => s.clearNotification);
  const clearAll = useForge((s) => s.clearAllNotifications);

  const [tab, setTab] = useState<"notifications" | "activity">("notifications");
  const [category, setCategory] = useState<EventCategory | "all">("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");

  const match = (x: Notification | ActivityEvent) => (category === "all" || x.category === category) && (severity === "all" || x.severity === severity);
  const shownNotifications = useMemo(() => notifications.filter(match), [notifications, category, severity]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownActivity = useMemo(() => activity.filter(match).slice(0, 80), [activity, category, severity]); // eslint-disable-line react-hooks/exhaustive-deps
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("notif.title")}
      eyebrow={unread > 0 ? t("notif.unread", { n: unread }) : undefined}
      width={460}
      footer={
        tab === "notifications" ? (
          <>
            <Button variant="ghost" size="sm" icon={Trash2} disabled={notifications.length === 0} onClick={clearAll}>
              {t("notif.clearAll")}
            </Button>
            <Button size="sm" icon={CheckCheck} disabled={unread === 0} onClick={markAll}>
              {t("notif.markAll")}
            </Button>
          </>
        ) : undefined
      }
    >
      <Tabs
        label={t("notif.title")}
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "notifications", label: t("notif.tab.notifications"), count: unread },
          { value: "activity", label: t("notif.tab.activity") },
        ]}
        className="-mt-2"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Select aria-label={t("common.category")} value={category} onChange={(e) => setCategory(e.target.value as EventCategory | "all")}>
          <option value="all">{t("notif.allCategories")}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {td(`cat.${c}`)}
            </option>
          ))}
        </Select>
        <Select aria-label={t("common.severity")} value={severity} onChange={(e) => setSeverity(e.target.value as Severity | "all")}>
          <option value="all">{t("notif.allSeverities")}</option>
          {SEVERITIES.map((c) => (
            <option key={c} value={c}>
              {td(`severity.${c}`)}
            </option>
          ))}
        </Select>
      </div>

      {tab === "notifications" ? (
        shownNotifications.length === 0 ? (
          <EmptyState icon={BellOff} title={t("notif.empty")} hint={t("notif.emptyHint")} />
        ) : (
          <ul className="-mx-5 mt-3 divide-y divide-line/70 border-y border-line/70">
            {shownNotifications.map((n) => {
              const Icon = SEVERITY_ICON[n.severity];
              return (
                <li key={n.id} className={cn("relative flex animate-fade gap-3 px-5 py-3", !n.read && "bg-raised/60")}>
                  {!n.read && <span aria-hidden className="absolute inset-y-0 start-0 w-0.5 bg-forge" />}
                  <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", toneText[SEVERITY_TONE[n.severity]])} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[13px] leading-snug", n.read ? "text-ink-2" : "font-medium text-ink")}>{tm(n.msg)}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-3">
                      <span>{td(`cat.${n.category}`)}</span>
                      <span aria-hidden>·</span>
                      <time dateTime={new Date(n.at).toISOString()}>{fmt.relative(n.at, now)}</time>
                      <span className="sr-only">{td(`severity.${n.severity}`)}</span>
                    </p>
                    {n.entity && (
                      <Link
                        href={entityHref(n.entity)}
                        onClick={() => {
                          markRead(n.id);
                          onClose();
                        }}
                        className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-forge-text hover:underline"
                      >
                        {t("notif.open")}
                        <ExternalLink aria-hidden className="size-3 rtl:-scale-x-100" />
                      </Link>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-0.5">
                    {!n.read && <IconButton size="sm" icon={Check} label={t("notif.markRead")} tooltipSide="top" onClick={() => markRead(n.id)} />}
                    <IconButton size="sm" icon={X} label={t("notif.clear")} tooltipSide="top" onClick={() => clear(n.id)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : shownActivity.length === 0 ? (
        <EmptyState icon={History} title={t("notif.activityEmpty")} />
      ) : (
        <ol className="relative mt-4 space-y-4 border-s border-line ps-5">
          {shownActivity.map((ev) => {
            const actor = team.find((m) => m.id === ev.actorId);
            return (
              <li key={ev.id} className="relative">
                <span aria-hidden className={cn("absolute -start-[24.5px] top-1.5 size-2 rounded-full border-2 border-base", ev.severity === "info" ? "bg-ink-3" : ev.severity === "success" ? "bg-ok" : ev.severity === "warning" ? "bg-amber" : "bg-danger")} />
                <p className="text-[12.5px] leading-snug text-ink">{tm(ev.msg)}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-3">
                  <time dateTime={new Date(ev.at).toISOString()}>{fmt.dateTime(ev.at)}</time>
                  <span aria-hidden>·</span>
                  <span>{actor ? t("notif.by", { name: tl(actor.name) }) : t("notif.system")}</span>
                  {ev.entity && (
                    <>
                      <span aria-hidden>·</span>
                      <Link href={entityHref(ev.entity)} onClick={onClose} className="code text-[11px] text-ink-2 hover:text-forge-text">
                        {ev.entity.id}
                      </Link>
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Drawer>
  );
}
