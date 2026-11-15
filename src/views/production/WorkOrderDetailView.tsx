"use client";
import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, CalendarCheck, Check, CheckCircle2, ClipboardEdit, History, Pause, Pencil, Play, Plus, Rows3 } from "lucide-react";
import type { ID, InventoryItem, QualityInspection, WorkOrder } from "@/domain/types";
import { STOCK_RANK, stockStatus, woIsOpen, woProgress } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { HOUR, MIN } from "@/lib/time";
import { useForge } from "@/store/store";
import { Badge, Button, Code, DataList, EmptyState, Panel, Progress, SimBadge, cn, toneText, type Tone } from "@/components/ui/primitives";
import { EntityLink, EntityNotFound, Guard, Member, Page, PageHeader, useLookup } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status";
import { DataTable, type Column } from "@/components/table/DataTable";
import { WorkOrderMenu, useWorkOrderActions, type WorkOrderActions } from "./WorkOrderActions";
import { Figure, MachineDots, SectionTitle, woFinishedLate, woIsLate } from "./shared";

export function WorkOrderDetailView({ id }: { id: ID }) {
  const { t } = useT();
  const order = useForge((s) => s.workOrders.find((o) => o.id === id));
  if (!order) return <EntityNotFound backHref="/work-orders" backLabel={t("nav.workOrders")} />;
  return <WorkOrderDetail order={order} />;
}

function WorkOrderDetail({ order }: { order: WorkOrder }) {
  const { t, tl, tm } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const now = useForge((s) => s.now);
  const alerts = useForge((s) => s.alerts);
  const actions = useWorkOrderActions();

  const product = lookup.product(order.productId);
  const line = lookup.line(order.lineId);
  const late = woIsLate(order, now);
  const openAlerts = useMemo(() => alerts.filter((a) => a.status !== "resolved" && a.entity.type === "workOrder" && a.entity.id === order.id), [alerts, order.id]);

  return (
    <Page>
      <PageHeader
        back={{ href: "/work-orders", label: t("nav.workOrders") }}
        eyebrow={t("common.workOrder")}
        title={<bdi>{order.id}</bdi>}
        meta={
          <>
            <StatusBadge kind="wo" value={order.status} />
            <StatusBadge kind="priority" value={order.priority} />
            {late && <Badge tone="danger">{t("wo.late")}</Badge>}
            {woFinishedLate(order) && <Badge tone="warn">{t("wo.finishedLate")}</Badge>}
          </>
        }
        subtitle={
          product ? (
            <>
              <Code>{product.sku}</Code> {tl(product.name)} · {t("wo.detail.qtyOn", { qty: fmt.num(order.plannedQty) })}{" "}
              {line ? <EntityLink entity={{ type: "line", id: line.id }}>{`${line.code} ${tl(line.name)}`}</EntityLink> : t("wo.detail.noLine")}
            </>
          ) : undefined
        }
        actions={<HeaderActions order={order} actions={actions} />}
      />

      {openAlerts.map((a) => (
        <div key={a.id} role="status" className="flex items-start gap-2.5 rounded-md border border-amber/45 bg-amber/10 px-3.5 py-2.5">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber" />
          <div className="min-w-0 text-[12.5px]">
            <p className="font-semibold text-ink">{tm(a.title)}</p>
            <p className="mt-0.5 text-ink-2">{tm(a.detail)}</p>
          </div>
        </div>
      ))}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <ProgressPanel order={order} now={now} />
          <Materials order={order} />
          <QualityChecks order={order} />
          <ActivityHistory orderId={order.id} now={now} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={t("wo.overview.title")}>
            <DataList
              columns={2}
              items={[
                { label: t("common.product"), value: product ? tl(product.name) : "—" },
                { label: t("common.sku"), value: product ? <Code>{product.sku}</Code> : "—" },
                { label: t("common.line"), value: order.lineId ? <EntityLink entity={{ type: "line", id: order.lineId }} /> : <span className="text-ink-3">{t("common.unassigned")}</span> },
                { label: t("common.priority"), value: <StatusBadge kind="priority" value={order.priority} /> },
                { label: t("wo.plannedQty"), value: <span className="num">{fmt.num(order.plannedQty)}</span> },
                { label: t("wo.overview.value"), value: <span className="num">{product ? fmt.money(product.unitValue * order.plannedQty) : "—"}</span> },
                { label: t("wo.plannedStart"), value: <span className="num">{fmt.dateTime(order.plannedStart)}</span> },
                { label: t("wo.plannedEnd"), value: <span className="num">{fmt.dateTime(order.plannedEnd)}</span> },
                { label: t("wo.dueDate"), value: <span className={cn("num", late && "font-semibold text-danger")}>{fmt.dateTime(order.dueDate)}</span> },
                { label: t("common.created"), value: <span className="num">{fmt.dateTime(order.createdAt)}</span> },
              ]}
            />
            {order.notes && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="label">{t("common.notes")}</div>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink-2">{order.notes}</p>
              </div>
            )}
          </Panel>
          <Resources order={order} />
          <Milestones order={order} now={now} />
        </div>
      </div>

      {actions.dialogs}
    </Page>
  );
}

/** Primary next steps as buttons; everything else lives in the menu. */
function HeaderActions({ order, actions }: { order: WorkOrder; actions: WorkOrderActions }) {
  const { t } = useT();
  const s = order.status;
  if (!woIsOpen(order)) return null;
  return (
    <>
      <Guard cap="wo.manage">
        <Button icon={Pencil} onClick={() => actions.open("edit", order)}>
          {t("common.edit")}
        </Button>
      </Guard>
      {(s === "in_progress" || s === "paused") && (
        <Guard cap="wo.progress">
          <Button icon={ClipboardEdit} onClick={() => actions.open("progress", order)}>
            {t("wo.act.progress")}
          </Button>
        </Guard>
      )}
      <Guard cap="wo.manage">
        {s === "draft" && (
          <Button variant="primary" icon={order.lineId ? CalendarCheck : Rows3} onClick={() => actions.transition(order, "scheduled")}>
            {order.lineId ? t("wo.act.schedule") : t("wo.act.assign")}
          </Button>
        )}
        {s === "scheduled" && (
          <Button variant="primary" icon={Play} onClick={() => actions.transition(order, "in_progress")}>
            {t("wo.act.start")}
          </Button>
        )}
        {s === "paused" && (
          <Button variant="primary" icon={Play} onClick={() => actions.transition(order, "in_progress")}>
            {t("wo.act.resume")}
          </Button>
        )}
        {s === "in_progress" && (
          <span className="inline-flex gap-2">
            <Button icon={Pause} onClick={() => actions.transition(order, "paused")}>
              {t("wo.act.pause")}
            </Button>
            <Button variant="primary" icon={CheckCircle2} onClick={() => actions.open("complete", order)}>
              {t("wo.act.complete")}
            </Button>
          </span>
        )}
      </Guard>
      <WorkOrderMenu actions={actions} order={order} variant="button" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

function ProgressPanel({ order, now }: { order: WorkOrder; now: number }) {
  const { t } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const line = lookup.line(order.lineId);
  const progress = woProgress(order);
  const good = order.completedQty - order.rejectedQty;
  const remaining = Math.max(0, order.plannedQty - order.completedQty);
  const yieldRate = order.completedQty > 0 ? good / order.completedQty : null;
  const open = woIsOpen(order);
  const active = order.status === "in_progress";

  // Estimate from the line's nominal rate (ideal — real output runs a little below it).
  const runMin = line && remaining > 0 ? (remaining / line.nominalRate) * 60 : 0;
  const base = active ? now : Math.max(now, order.plannedStart);
  const eta = line ? base + runMin * MIN : null;
  const slackMin = eta !== null ? (order.dueDate - eta) / MIN : null;
  const hoursToDue = (order.dueDate - now) / HOUR;
  const requiredRate = remaining > 0 && hoursToDue > 0 ? remaining / hoursToDue : null;

  let paceTone: Tone = "neutral";
  let paceText = t("wo.pace.noLine");
  if (order.status === "completed") {
    const lateBy = ((order.completedAt ?? order.dueDate) - order.dueDate) / MIN;
    paceTone = lateBy > 0 ? "warn" : "ok";
    paceText = lateBy > 0 ? t("wo.pace.doneLate", { time: fmt.duration(lateBy) }) : t("wo.pace.doneOnTime", { time: fmt.duration(-lateBy) });
  } else if (order.status === "cancelled") {
    paceText = t("wo.pace.cancelled");
  } else if (remaining === 0) {
    paceTone = "ok";
    paceText = t("wo.pace.ready");
  } else if (slackMin !== null) {
    paceTone = slackMin < 0 ? "danger" : slackMin < 120 ? "warn" : "ok";
    paceText = slackMin < 0 ? t("wo.pace.behind", { time: fmt.duration(-slackMin) }) : t("wo.pace.ahead", { time: fmt.duration(slackMin) });
  }

  return (
    <Panel title={t("wo.progress.panel")} actions={active ? <SimBadge /> : undefined}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2.5">
          <span className="display num text-[44px] leading-none text-ink">{fmt.pct(progress, 0)}</span>
          <span className="num text-[13px] text-ink-3">
            {fmt.num(order.completedQty)} / {fmt.num(order.plannedQty)} {t("common.units")}
          </span>
        </div>
        <span className={cn("text-[12.5px] font-semibold", toneText[paceTone])}>{paceText}</span>
      </div>
      <Progress
        className="mt-4 !h-2.5"
        thick
        value={progress}
        tone={order.status === "completed" ? "ok" : order.status === "paused" ? "warn" : order.status === "cancelled" ? "neutral" : "accent"}
        label={t("wo.progressOf", { id: order.id })}
      />
      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Figure label={t("wo.plannedQty")} value={fmt.num(order.plannedQty)} />
        <Figure label={t("wo.completedQty")} value={fmt.num(order.completedQty)} hint={open ? t("wo.remaining", { n: fmt.num(remaining) }) : undefined} />
        <Figure
          label={t("wo.rejectedQty")}
          value={fmt.num(order.rejectedQty)}
          tone={order.rejectedQty > 0 && yieldRate !== null && yieldRate < 0.964 ? "danger" : undefined}
          hint={order.completedQty > 0 ? fmt.pct(order.rejectedQty / order.completedQty) : undefined}
        />
        <Figure label={t("wo.good")} value={fmt.num(good)} hint={yieldRate !== null ? `${t("wo.yield")} ${fmt.pct(yieldRate)}` : undefined} />
      </div>
      {open && (
        <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-3">
          <Figure
            label={t("wo.pace.eta")}
            value={eta !== null && remaining > 0 ? fmt.dateTime(eta) : "—"}
            hint={line ? t("wo.pace.etaHint", { rate: fmt.num(line.nominalRate), time: fmt.duration(runMin) }) : t("wo.pace.noLine")}
          />
          <Figure label={t("wo.dueDate")} value={fmt.dateTime(order.dueDate)} tone={order.dueDate < now ? "danger" : undefined} hint={fmt.relative(order.dueDate, now)} />
          <Figure
            label={t("wo.pace.required")}
            value={requiredRate !== null ? fmt.num(requiredRate, requiredRate < 10 ? 1 : 0) : "—"}
            unit={requiredRate !== null ? t("common.perHour") : undefined}
            tone={line && requiredRate !== null && requiredRate > line.nominalRate ? "danger" : undefined}
            hint={
              remaining > 0 && hoursToDue <= 0
                ? t("wo.pace.pastDue")
                : line && requiredRate !== null
                  ? t("wo.pace.requiredHint", { pct: fmt.pct(requiredRate / line.nominalRate, 0) })
                  : undefined
            }
          />
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Resources & milestones                                              */
/* ------------------------------------------------------------------ */

function Resources({ order }: { order: WorkOrder }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const allMachines = useForge((s) => s.machines);
  const line = lookup.line(order.lineId);
  const machines = useMemo(() => (line ? allMachines.filter((m) => m.lineId === line.id).sort((a, b) => a.station - b.station) : []), [allMachines, line]);

  return (
    <Panel title={t("wo.resources.title")}>
      <div className="space-y-4">
        <div>
          <div className="label mb-1.5">{t("common.line")}</div>
          {line ? (
            <div className="flex flex-wrap items-center gap-2">
              <EntityLink entity={{ type: "line", id: line.id }} />
              <span className="min-w-0 truncate text-[13px] text-ink">{tl(line.name)}</span>
              <StatusBadge kind="line" value={line.status} />
              <span className="num text-[12px] text-ink-3">
                {fmt.num(line.nominalRate)} {t("common.perHour")}
              </span>
            </div>
          ) : (
            <p className="text-[12.5px] text-ink-3">{t("wo.resources.noLine")}</p>
          )}
        </div>
        {machines.length > 0 && (
          <div>
            <div className="label mb-1.5 flex items-center gap-2">
              {t("wo.resources.machines")} <MachineDots machines={machines} />
            </div>
            <ul className="divide-y divide-line/70 rounded-md border border-line">
              {machines.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <EntityLink entity={{ type: "machine", id: m.id }} />
                    <span className="truncate text-ink-2">{tl(m.kind)}</span>
                  </span>
                  <StatusBadge kind="machine" value={m.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="label mb-1.5">{t("common.supervisor")}</div>
          <div className="text-[13px]">
            <Member id={order.supervisorId} showRole size={26} />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Milestones({ order, now }: { order: WorkOrder; now: number }) {
  const { t } = useT();
  const fmt = useFmt();
  const activity = useForge((s) => s.activity);

  const steps = useMemo(() => {
    // Timestamps not stored on the order are recovered from its activity trail when present.
    const eventAt = (key: string) => activity.find((e) => e.entity?.type === "workOrder" && e.entity.id === order.id && e.msg.key === key)?.at;
    const scheduled = order.status !== "draft" && order.lineId !== null;
    const out: { key: string; label: string; done: boolean; at?: number; detail?: string; tone?: Tone }[] = [
      { key: "created", label: t("wo.ms.created"), done: true, at: order.createdAt },
      {
        key: "scheduled",
        label: t("wo.ms.scheduled"),
        done: scheduled,
        at: scheduled ? eventAt("evt.woScheduled") : undefined,
        detail: scheduled ? t("wo.ms.window", { start: fmt.dateTime(order.plannedStart), end: fmt.dateTime(order.plannedEnd) }) : t("wo.ms.awaitingLine"),
      },
      {
        key: "started",
        label: t("wo.ms.started"),
        done: order.startedAt !== undefined,
        at: order.startedAt,
        detail: order.startedAt === undefined ? t("wo.ms.plannedFor", { time: fmt.dateTime(order.plannedStart) }) : undefined,
      },
    ];
    if (order.status === "cancelled") {
      out.push({ key: "cancelled", label: t("wo.ms.cancelled"), done: true, at: eventAt("evt.woCancelled"), tone: "danger" });
    } else {
      out.push({
        key: "completed",
        label: t("wo.ms.completed"),
        done: order.status === "completed",
        at: order.completedAt,
        detail: order.status === "completed" ? undefined : t("wo.ms.dueBy", { time: fmt.dateTime(order.dueDate) }),
        tone: order.status === "completed" ? "ok" : undefined,
      });
    }
    return out;
  }, [activity, order, t, fmt]);

  const current = steps.findIndex((s) => !s.done);
  return (
    <Panel title={t("common.timeline")}>
      <ol>
        {steps.map((s, i) => (
          <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden className={cn("absolute start-[9px] top-5 h-full w-px", steps[i + 1].done ? "bg-ink-3" : "bg-line")} />}
            <span
              aria-hidden
              className={cn(
                "relative mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full border",
                s.done ? (s.tone === "danger" ? "border-danger bg-danger/15 text-danger" : s.tone === "ok" ? "border-ok bg-ok/15 text-ok" : "border-ink-3 bg-raised text-ink") : i === current ? "border-forge bg-forge/10" : "border-line-2 bg-base",
              )}
            >
              {s.done && <Check className="size-3" strokeWidth={3} />}
            </span>
            <div className="min-w-0">
              <p className={cn("text-[13px] font-semibold", s.done ? "text-ink" : "text-ink-3")}>
                {s.label}
                <span className="sr-only"> — {s.done ? t("wo.ms.done") : t("wo.ms.pending")}</span>
              </p>
              {s.at !== undefined && (
                <p className="num mt-0.5 text-[12px] text-ink-2">
                  {fmt.dateTime(s.at)} <span className="text-ink-3">· {fmt.relative(s.at, now)}</span>
                </p>
              )}
              {s.detail && <p className="num mt-0.5 text-[12px] text-ink-3">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Materials (BOM × planned quantity vs stock)                         */
/* ------------------------------------------------------------------ */

interface MaterialRow {
  itemId: ID;
  item?: InventoryItem;
  perUnit: number;
  required: number;
  short: number;
}

function Materials({ order }: { order: WorkOrder }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const product = lookup.product(order.productId);
  const open = woIsOpen(order);
  // Materials are backflushed at completion, so an open order still needs its full quantity on hand.
  const basis = open ? order.plannedQty : order.completedQty;

  const rows = useMemo<MaterialRow[]>(
    () =>
      (product?.bom ?? []).map((b) => {
        const item = lookup.item(b.itemId);
        const required = Math.round(b.qtyPerUnit * basis * 100) / 100;
        return { itemId: b.itemId, item, perUnit: b.qtyPerUnit, required, short: open && item ? Math.max(0, Math.round((required - item.quantity) * 100) / 100) : 0 };
      }),
    [product, lookup, basis, open],
  );
  const shortages = rows.filter((r) => r.short > 0).length;

  const columns = useMemo<Column<MaterialRow>[]>(() => {
    const qty = (n: number) => fmt.num(n, Number.isInteger(n) ? 0 : 1);
    return [
      {
        id: "item",
        header: t("wo.materials.item"),
        cell: (r) => (
          <span className="inline-flex min-w-0 items-center gap-2">
            <EntityLink entity={{ type: "item", id: r.itemId }} />
            {r.item && <span className="truncate text-ink-2">{tl(r.item.name)}</span>}
          </span>
        ),
        sortValue: (r) => r.itemId,
        mobile: "title",
        hideable: false,
      },
      { id: "perUnit", header: t("wo.materials.perUnit"), cell: (r) => `${qty(r.perUnit)} ${r.item?.unit ?? ""}`, sortValue: (r) => r.perUnit, align: "end" },
      { id: "required", header: open ? t("wo.materials.required") : t("wo.materials.consumed"), cell: (r) => `${qty(r.required)} ${r.item?.unit ?? ""}`, sortValue: (r) => r.required, align: "end" },
      {
        id: "onHand",
        header: t("wo.materials.onHand"),
        cell: (r) => (r.item ? <span className={cn(r.short > 0 && "font-semibold text-danger")}>{`${qty(r.item.quantity)} ${r.item.unit}`}</span> : "—"),
        sortValue: (r) => r.item?.quantity ?? 0,
        align: "end",
      },
      {
        id: "coverage",
        header: t("wo.materials.coverage"),
        cell: (r) =>
          !open ? (
            <span className="text-ink-3">—</span>
          ) : r.short > 0 ? (
            <Badge tone="danger" icon={AlertTriangle}>
              {t("wo.materials.short", { qty: qty(r.short), unit: r.item?.unit ?? "" })}
            </Badge>
          ) : (
            <Badge tone="ok">{t("wo.materials.covered")}</Badge>
          ),
        sortValue: (r) => r.short,
        mobile: "badge",
      },
      {
        id: "stock",
        header: t("wo.materials.stock"),
        cell: (r) => (r.item ? <StatusBadge kind="stock" value={stockStatus(r.item)} /> : "—"),
        sortValue: (r) => (r.item ? STOCK_RANK[stockStatus(r.item)] : 0),
      },
    ];
  }, [t, tl, fmt, open]);

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        title={t("wo.materials.title")}
        hint={open ? t("wo.materials.hint", { qty: fmt.num(order.plannedQty) }) : t("wo.materials.hintClosed", { qty: fmt.num(order.completedQty) })}
        actions={open && shortages > 0 ? <Badge tone="danger" icon={AlertTriangle}>{t("wo.materials.shortages", { n: fmt.num(shortages) })}</Badge> : undefined}
      />
      <DataTable rows={rows} columns={columns} getRowId={(r) => r.itemId} caption={t("wo.materials.title")} rowHref={(r) => `/inventory/${r.itemId}`} empty={{ title: t("wo.materials.empty") }} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Quality checks                                                      */
/* ------------------------------------------------------------------ */

function QualityChecks({ order }: { order: WorkOrder }) {
  const { t } = useT();
  const fmt = useFmt();
  const inspections = useForge((s) => s.inspections);
  const rows = useMemo(() => inspections.filter((q) => q.workOrderId === order.id).sort((a, b) => b.date - a.date), [inspections, order.id]);
  const canInspect = order.status !== "draft" && order.status !== "cancelled";

  const columns = useMemo<Column<QualityInspection>[]>(
    () => [
      { id: "id", header: t("wo.quality.id"), cell: (q) => <EntityLink entity={{ type: "inspection", id: q.id }} />, sortValue: (q) => q.id, mobile: "title", hideable: false },
      { id: "status", header: t("common.status"), cell: (q) => <StatusBadge kind="inspection" value={q.status} />, sortValue: (q) => q.status, mobile: "badge" },
      { id: "date", header: t("common.date"), cell: (q) => fmt.dateTime(q.date), sortValue: (q) => q.date },
      { id: "inspected", header: t("wo.quality.inspected"), cell: (q) => fmt.num(q.inspectedQty), sortValue: (q) => q.inspectedQty, align: "end" },
      { id: "rejected", header: t("wo.rejectedQty"), cell: (q) => fmt.num(q.rejectedQty), sortValue: (q) => q.rejectedQty, align: "end" },
      {
        id: "rate",
        header: t("wo.quality.rejectRate"),
        cell: (q) =>
          q.inspectedQty > 0 ? <span className={cn(q.status === "failed" && "font-semibold text-danger", q.status === "conditional" && "font-semibold text-amber")}>{fmt.pct(q.rejectedQty / q.inspectedQty)}</span> : "—",
        sortValue: (q) => (q.inspectedQty > 0 ? q.rejectedQty / q.inspectedQty : 0),
        align: "end",
      },
      { id: "inspector", header: t("common.inspector"), cell: (q) => <Member id={q.inspectorId} size={20} />, mobile: "subtitle" },
    ],
    [t, fmt],
  );

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        title={t("wo.quality.title")}
        hint={t("wo.quality.hint")}
        actions={
          canInspect ? (
            <Link
              href={`/quality?new=1&wo=${encodeURIComponent(order.id)}`}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-2 bg-raised px-2.5 text-[12px] font-medium text-ink hover:bg-panel"
            >
              <Plus aria-hidden className="size-3.5" />
              {t("wo.quality.create")}
            </Link>
          ) : undefined
        }
      />
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(q) => q.id}
        caption={t("wo.quality.title")}
        rowHref={(q) => `/quality/${q.id}`}
        empty={{ title: t("wo.quality.empty"), hint: canInspect ? t("wo.quality.emptyHint") : t("wo.quality.notAllowed") }}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

function ActivityHistory({ orderId, now }: { orderId: ID; now: number }) {
  const { t, tm, tl } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const activity = useForge((s) => s.activity);
  const events = useMemo(() => activity.filter((e) => e.entity?.type === "workOrder" && e.entity.id === orderId).sort((a, b) => b.at - a.at), [activity, orderId]);
  const dot: Record<string, string> = { info: "bg-info", warning: "bg-amber", critical: "bg-danger", success: "bg-ok" };

  return (
    <Panel flush title={t("wo.activity.title")} subtitle={t("wo.activity.subtitle")}>
      {events.length === 0 ? (
        <EmptyState icon={History} title={t("wo.activity.empty")} hint={t("wo.activity.emptyHint")} />
      ) : (
        <ul className="divide-y divide-line/70">
          {events.slice(0, 40).map((e) => {
            const actor = lookup.member(e.actorId);
            return (
              <li key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", dot[e.severity])} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink">{tm(e.msg)}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">
                    <span className="num">{fmt.dateTime(e.at)}</span> · {fmt.relative(e.at, now)} · {actor ? t("notif.by", { name: tl(actor.name) }) : t("notif.system")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

