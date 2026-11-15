"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BellRing, Check, CheckCheck, ChevronRight, ExternalLink } from "lucide-react";
import type { Alert } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { entityHref } from "@/lib/routes";
import { useForge } from "@/store/store";
import { SEVERITY_ICON } from "@/components/shell/NotificationCenter";
import { Drawer } from "@/components/ui/overlay";
import { Guard, Member, useCan } from "@/components/ui/page";
import { Button, Code, DataList, EmptyState, Panel, Segmented, Select, cn, toneText } from "@/components/ui/primitives";
import { SEVERITY_TONE, StatusBadge } from "@/components/ui/status";
import { useAction } from "@/components/ui/toast";

type SeverityFilter = "all" | Alert["severity"];
type StatusFilter = "active" | "resolved" | "all";

const RANK = { critical: 0, warning: 1, info: 2 } as const;

export function AlertCenter({ compact, className }: { compact?: boolean; className?: string }) {
  const { t, td, tm } = useT();
  const fmt = useFmt();
  const alerts = useForge((s) => s.alerts);
  const now = useForge((s) => s.now);
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => ({ open: alerts.filter((a) => a.status === "open").length, ack: alerts.filter((a) => a.status === "acknowledged").length }), [alerts]);
  const shown = useMemo(
    () =>
      alerts
        .filter((a) => (severity === "all" || a.severity === severity) && (status === "all" || (status === "resolved" ? a.status === "resolved" : a.status !== "resolved")))
        .sort((a, b) => (a.status === "resolved" ? 1 : 0) - (b.status === "resolved" ? 1 : 0) || RANK[a.severity] - RANK[b.severity] || b.createdAt - a.createdAt)
        .slice(0, compact ? 5 : 50),
    [alerts, severity, status, compact],
  );
  const current = alerts.find((a) => a.id === openId) ?? null;

  return (
    <Panel
      title={t("alerts.title")}
      subtitle={t("alerts.subtitle", { open: counts.open, ack: counts.ack })}
      flush
      className={className}
      actions={
        compact ? (
          <Link href="/overview#alerts" className="inline-flex items-center gap-1 text-[12px] font-medium text-forge-text hover:underline">
            {t("alerts.viewAll")}
            <ChevronRight aria-hidden className="size-3.5 rtl:-scale-x-100" />
          </Link>
        ) : (
          <>
            <Segmented
              size="sm"
              label={t("common.severity")}
              value={severity}
              onChange={setSeverity}
              options={[
                { value: "all", label: t("common.all") },
                { value: "critical", label: td("severity.critical") },
                { value: "warning", label: td("severity.warning") },
                { value: "info", label: td("severity.info") },
              ]}
            />
            <Segmented
              size="sm"
              label={t("common.status")}
              value={status}
              onChange={setStatus}
              options={[
                { value: "active", label: t("alerts.filter.active") },
                { value: "resolved", label: td("astatus.resolved") },
                { value: "all", label: t("alerts.filter.all") },
              ]}
            />
          </>
        )
      }
    >
      {shown.length === 0 ? (
        <EmptyState icon={BellRing} title={t("alerts.empty")} hint={t("alerts.emptyHint")} />
      ) : (
        <ul className="divide-y divide-line/70">
          {shown.map((a) => {
            const Icon = SEVERITY_ICON[a.severity];
            const resolved = a.status === "resolved";
            return (
              <li key={a.id}>
                <button type="button" onClick={() => setOpenId(a.id)} aria-haspopup="dialog" className="group relative flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-raised/70">
                  <span aria-hidden className={cn("absolute inset-y-0 start-0 w-0.5", resolved ? "bg-transparent" : a.severity === "critical" ? "bg-danger" : a.severity === "warning" ? "bg-amber" : "bg-info")} />
                  <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", resolved ? "text-ink-3" : toneText[SEVERITY_TONE[a.severity]])} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[13px] font-medium leading-snug", resolved ? "text-ink-3" : "text-ink")}>{tm(a.title)}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
                      <Code className="text-[11px]">{a.id}</Code>
                      <span aria-hidden>·</span>
                      <span>{td(`severity.${a.severity}`)}</span>
                      <span aria-hidden>·</span>
                      <span>{td(`cat.${a.category}`)}</span>
                      <span aria-hidden>·</span>
                      <time dateTime={new Date(a.createdAt).toISOString()}>{fmt.relative(a.createdAt, now)}</time>
                    </span>
                  </span>
                  <StatusBadge kind="alert" value={a.status} className="mt-0.5 shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <AlertDrawer alert={current} onClose={() => setOpenId(null)} />
    </Panel>
  );
}

function AlertDrawer({ alert, onClose }: { alert: Alert | null; onClose: () => void }) {
  const { t, td, tm, tl } = useT();
  const fmt = useFmt();
  const run = useAction();
  const team = useForge((s) => s.team);
  const acknowledge = useForge((s) => s.acknowledgeAlert);
  const assign = useForge((s) => s.assignAlert);
  const resolve = useForge((s) => s.resolveAlert);
  const canManage = useCan("alerts.manage");
  // Keep the last alert rendered while the drawer animates out.
  const [last, setLast] = useState<Alert | null>(alert);
  if (alert && alert !== last) setLast(alert);
  const a = alert ?? last;
  if (!a) return null;
  const Icon = SEVERITY_ICON[a.severity];

  return (
    <Drawer
      open={!!alert}
      onClose={onClose}
      eyebrow={
        <span className="flex items-center gap-2">
          {t("alerts.detail")} <Code className="text-[11px]">{a.id}</Code>
        </span>
      }
      title={tm(a.title)}
      footer={
        <Guard cap="alerts.manage">
          <Button icon={Check} disabled={a.status !== "open"} onClick={() => run(acknowledge(a.id), t("alerts.acknowledged"))}>
            {t("alerts.acknowledge")}
          </Button>
          <Button variant="primary" icon={CheckCheck} disabled={a.status === "resolved"} onClick={() => run(resolve(a.id), t("alerts.resolved")) && onClose()}>
            {t("alerts.resolve")}
          </Button>
        </Guard>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-semibold", toneText[SEVERITY_TONE[a.severity]])}>
          <Icon aria-hidden className="size-4" />
          {td(`severity.${a.severity}`)}
        </span>
        <StatusBadge kind="alert" value={a.status} />
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{tm(a.detail)}</p>

      <DataList
        className="mt-5 border-t border-line pt-4"
        items={[
          { label: t("common.category"), value: td(`cat.${a.category}`) },
          { label: t("alerts.raised"), value: <span className="num">{fmt.dateTime(a.createdAt)}</span> },
          {
            label: t("alerts.entity"),
            value: (
              <Link href={entityHref(a.entity)} onClick={onClose} className="inline-flex items-center gap-1.5 text-forge-text hover:underline">
                <Code>{a.entity.id}</Code>
                <ExternalLink aria-hidden className="size-3 rtl:-scale-x-100" />
              </Link>
            ),
          },
          { label: t("common.type"), value: td(`entity.${a.entity.type}`) },
          ...(a.acknowledgedById ? [{ label: t("alerts.acknowledgedBy"), value: <Member id={a.acknowledgedById} /> }] : []),
          ...(a.resolvedAt ? [{ label: t("alerts.resolvedAt"), value: <span className="num">{fmt.dateTime(a.resolvedAt)}</span> }] : []),
        ]}
      />

      <div className="mt-5 border-t border-line pt-4">
        <label htmlFor="alert-assignee" className="label">
          {t("alerts.assign")}
        </label>
        <div className="mt-2 flex items-center gap-3">
          <Select
            id="alert-assignee"
            value={a.assigneeId ?? ""}
            disabled={!canManage || a.status === "resolved"}
            onChange={(e) => run(assign(a.id, e.target.value || null), e.target.value ? t("alerts.assigned") : undefined)}
          >
            <option value="">{t("common.unassigned")}</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {tl(m.name)} — {td(`role.${m.role}`)}
              </option>
            ))}
          </Select>
        </div>
        {!canManage && <p className="mt-2 text-[11.5px] text-ink-3">{t("common.readOnly")}</p>}
      </div>
    </Drawer>
  );
}
