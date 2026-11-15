"use client";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Ban, Download, Flag, Plus } from "lucide-react";
import type { ID, Priority, WorkOrder, WorkOrderStatus } from "@/domain/types";
import { woIsOpen, woProgress } from "@/domain/rules";
import { useT } from "@/i18n";
import { downloadCsv } from "@/lib/csv";
import { useFmt } from "@/lib/format";
import { useForge } from "@/store/store";
import { workOrderCounts } from "@/store/selectors";
import { Badge, Button, Code, Progress, Select, cn } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlay";
import { EntityLink, Guard, Kpi, KpiStrip, Member, Page, PageHeader, useCan, useLookup } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status";
import { toast } from "@/components/ui/toast";
import { DataTable, type Column } from "@/components/table/DataTable";
import { BulkPriorityModal, WorkOrderMenu, useWorkOrderActions } from "./WorkOrderActions";
import { WorkOrderFormModal } from "./WorkOrderForm";
import { PRIORITIES, PRIORITY_RANK, WO_STATUSES, WO_STATUS_RANK, woFinishedLate, woIsLate } from "./shared";

const UNASSIGNED = "__none";

export function WorkOrdersView() {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const workOrders = useForge((s) => s.workOrders);
  const lines = useForge((s) => s.lines);
  const products = useForge((s) => s.products);
  const now = useForge((s) => s.now);
  const setStatus = useForge((s) => s.setWorkOrderStatus);
  const canManage = useCan("wo.manage");
  const actions = useWorkOrderActions();

  const [status, setStatusFilter] = useState<WorkOrderStatus | "open" | "late" | "">("");
  const [lineId, setLineId] = useState<ID | "">("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [productId, setProductId] = useState<ID | "">("");

  // `?new=1` (command palette deep link) opens the create dialog.
  const [creating, setCreating] = useState(false);
  const deepLinked = params.get("new") === "1";
  const createOpen = canManage && (creating || deepLinked);
  const closeCreate = () => {
    setCreating(false);
    if (deepLinked) router.replace(pathname);
  };

  const [bulkPriority, setBulkPriority] = useState<{ orders: WorkOrder[]; clear: () => void } | null>(null);
  const [bulkCancel, setBulkCancel] = useState<{ orders: WorkOrder[]; clear: () => void } | null>(null);

  const counts = useMemo(() => workOrderCounts(workOrders), [workOrders]);
  const stats = useMemo(() => {
    const done = workOrders.filter((o) => o.status === "completed");
    const onTime = done.filter((o) => !woFinishedLate(o)).length;
    return {
      onTimeRate: done.length ? onTime / done.length : 0,
      done: done.length,
      late: workOrders.filter((o) => woIsLate(o, now)).length,
      open: workOrders.filter(woIsOpen).length,
    };
  }, [workOrders, now]);

  const rows = useMemo(
    () =>
      workOrders.filter(
        (o) =>
          (!status || (status === "open" ? woIsOpen(o) : status === "late" ? woIsLate(o, now) : o.status === status)) &&
          (!lineId || (lineId === UNASSIGNED ? !o.lineId : o.lineId === lineId)) &&
          (!priority || o.priority === priority) &&
          (!productId || o.productId === productId),
      ),
    [workOrders, status, lineId, priority, productId, now],
  );
  const activeFilters = [status, lineId, priority, productId].filter(Boolean).length;
  const clearFilters = () => {
    setStatusFilter("");
    setLineId("");
    setPriority("");
    setProductId("");
  };

  const columns = useMemo<Column<WorkOrder>[]>(
    () => [
      {
        id: "id",
        header: t("wo.col.id"),
        cell: (o) => <Code className="text-[12.5px] font-semibold text-ink">{o.id}</Code>,
        sortValue: (o) => o.id,
        mobile: "title",
        hideable: false,
      },
      {
        id: "product",
        header: t("common.product"),
        cell: (o) => {
          const p = lookup.product(o.productId);
          return p ? (
            <span className="inline-flex min-w-0 max-w-[260px] items-center gap-2">
              <Code>{p.sku}</Code>
              <span className="truncate text-ink-2">{tl(p.name)}</span>
            </span>
          ) : (
            "—"
          );
        },
        sortValue: (o) => lookup.product(o.productId)?.sku ?? "",
        mobile: "subtitle",
      },
      {
        id: "line",
        header: t("common.line"),
        cell: (o) => (o.lineId ? <EntityLink entity={{ type: "line", id: o.lineId }} /> : <span className="text-ink-3">{t("common.unassigned")}</span>),
        sortValue: (o) => o.lineId ?? "~",
      },
      { id: "planned", header: t("wo.plannedQty"), cell: (o) => fmt.num(o.plannedQty), sortValue: (o) => o.plannedQty, align: "end" },
      { id: "completed", header: t("wo.completedQty"), cell: (o) => fmt.num(o.completedQty), sortValue: (o) => o.completedQty, align: "end" },
      {
        id: "progress",
        header: t("common.progress"),
        width: "132px",
        cell: (o) => (
          <span className="flex items-center gap-2">
            <Progress
              value={woProgress(o)}
              tone={o.status === "completed" ? "ok" : o.status === "paused" ? "warn" : o.status === "cancelled" ? "neutral" : "accent"}
              label={t("wo.progressOf", { id: o.id })}
              className="min-w-[56px]"
            />
            <span className="num w-9 shrink-0 text-end text-[12px] text-ink-2">{fmt.pct(woProgress(o), 0)}</span>
          </span>
        ),
        sortValue: (o) => woProgress(o),
      },
      { id: "priority", header: t("common.priority"), cell: (o) => <StatusBadge kind="priority" value={o.priority} />, sortValue: (o) => PRIORITY_RANK[o.priority] },
      { id: "start", header: t("wo.col.start"), cell: (o) => <span className="whitespace-nowrap">{fmt.dateTime(o.plannedStart)}</span>, sortValue: (o) => o.plannedStart },
      {
        id: "due",
        header: t("wo.dueDate"),
        cell: (o) => {
          const late = woIsLate(o, now);
          return (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className={cn(late && "font-semibold text-danger")}>{fmt.dateTime(o.dueDate)}</span>
              {late && <Badge tone="danger">{t("wo.late")}</Badge>}
              {woFinishedLate(o) && <Badge tone="warn">{t("wo.finishedLate")}</Badge>}
            </span>
          );
        },
        sortValue: (o) => o.dueDate,
      },
      { id: "status", header: t("common.status"), cell: (o) => <StatusBadge kind="wo" value={o.status} />, sortValue: (o) => WO_STATUS_RANK[o.status], mobile: "badge" },
      { id: "supervisor", header: t("common.supervisor"), cell: (o) => <Member id={o.supervisorId} size={20} />, sortValue: (o) => lookup.member(o.supervisorId)?.name.en ?? "", mobile: "hidden" },
    ],
    [t, tl, fmt, lookup, now],
  );

  const exportCsv = () =>
    downloadCsv(
      "work-orders",
      [t("wo.col.id"), t("common.sku"), t("common.product"), t("common.line"), t("wo.plannedQty"), t("wo.completedQty"), t("wo.rejectedQty"), t("common.priority"), t("wo.plannedStart"), t("wo.plannedEnd"), t("wo.dueDate"), t("common.status")],
      rows.map((o) => {
        const p = lookup.product(o.productId);
        return [o.id, p?.sku, p ? tl(p.name) : "", o.lineId ?? "", o.plannedQty, o.completedQty, o.rejectedQty, td(`priority.${o.priority}`), fmt.dateTime(o.plannedStart), fmt.dateTime(o.plannedEnd), fmt.dateTime(o.dueDate), td(`wostatus.${o.status}`)];
      }),
    );

  const cancelDrafts = bulkCancel?.orders.filter((o) => o.status === "draft") ?? [];

  return (
    <Page>
      <PageHeader
        eyebrow={t("wo.eyebrow")}
        title={t("nav.workOrders")}
        subtitle={t("wo.subtitle")}
        actions={
          <>
            <Guard cap="reports.export">
              <Button icon={Download} onClick={exportCsv}>
                {t("common.exportCsv")}
              </Button>
            </Guard>
            <Guard cap="wo.manage">
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                {t("wo.create.title")}
              </Button>
            </Guard>
          </>
        }
      />

      <KpiStrip columns={6}>
        <Kpi label={td("wostatus.in_progress")} value={counts.in_progress} format={(n) => fmt.num(Math.round(n))} hint={t("wo.kpi.paused", { n: fmt.num(counts.paused) })} />
        <Kpi label={td("wostatus.scheduled")} value={counts.scheduled} format={(n) => fmt.num(Math.round(n))} hint={t("wo.kpi.drafts", { n: fmt.num(counts.draft) })} />
        <Kpi label={t("wo.kpi.open")} value={stats.open} format={(n) => fmt.num(Math.round(n))} hint={t("wo.kpi.openHint")} />
        <Kpi
          label={t("wo.kpi.late")}
          value={stats.late}
          format={(n) => fmt.num(Math.round(n))}
          tone={stats.late > 0 ? "danger" : undefined}
          hint={t("wo.kpi.lateHint")}
        />
        <Kpi label={td("wostatus.completed")} value={counts.completed} format={(n) => fmt.num(Math.round(n))} hint={t("wo.kpi.cancelled", { n: fmt.num(counts.cancelled) })} />
        <Kpi
          label={t("wo.kpi.onTime")}
          value={stats.onTimeRate}
          format={(n) => fmt.pct(n)}
          tone={stats.done === 0 ? undefined : stats.onTimeRate >= 0.9 ? "ok" : stats.onTimeRate >= 0.75 ? "warn" : "danger"}
          hint={t("wo.kpi.onTimeHint", { n: fmt.num(stats.done) })}
        />
      </KpiStrip>

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(o) => o.id}
        caption={t("nav.workOrders")}
        searchText={(o) => {
          const p = lookup.product(o.productId);
          const l = lookup.line(o.lineId);
          return `${o.id} ${p?.sku ?? ""} ${p?.name.en ?? ""} ${p?.name.ar ?? ""} ${l?.code ?? ""} ${l?.name.en ?? ""} ${l?.name.ar ?? ""}`;
        }}
        searchPlaceholder={t("wo.search")}
        initialSort={{ id: "status", dir: "asc" }}
        pageSize={20}
        activeFilters={activeFilters}
        onClearFilters={clearFilters}
        rowHref={(o) => `/work-orders/${o.id}`}
        rowActions={(o) => <WorkOrderMenu actions={actions} order={o} />}
        selectable
        bulkActions={(selected, clear) => (
          <>
            <Button size="sm" icon={Flag} disabled={!canManage} onClick={() => setBulkPriority({ orders: selected, clear })}>
              {t("wo.bulk.priority")}
            </Button>
            <Button size="sm" variant="danger" icon={Ban} disabled={!canManage || !selected.some((o) => o.status === "draft")} onClick={() => setBulkCancel({ orders: selected, clear })}>
              {t("wo.bulk.cancelDrafts")}
            </Button>
          </>
        )}
        empty={{
          title: t("wo.empty"),
          hint: t("wo.emptyHint"),
          action: canManage ? (
            <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>
              {t("wo.create.title")}
            </Button>
          ) : undefined,
        }}
        filters={
          <>
            <Select aria-label={t("common.status")} value={status} onChange={(e) => setStatusFilter(e.target.value as typeof status)}>
              <option value="">{t("wo.filter.allStatuses")}</option>
              <option value="open">{t("wo.filter.open")}</option>
              <option value="late">{t("wo.filter.late")}</option>
              {WO_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {td(`wostatus.${s}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("common.line")} value={lineId} onChange={(e) => setLineId(e.target.value)}>
              <option value="">{t("wo.filter.allLines")}</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {tl(l.name)}
                </option>
              ))}
              <option value={UNASSIGNED}>{t("common.unassigned")}</option>
            </Select>
            <Select aria-label={t("common.priority")} value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")}>
              <option value="">{t("wo.filter.allPriorities")}</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {td(`priority.${p}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("common.product")} value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">{t("wo.filter.allProducts")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {tl(p.name)}
                </option>
              ))}
            </Select>
          </>
        }
      />

      {actions.dialogs}
      <WorkOrderFormModal open={createOpen} onClose={closeCreate} />
      <BulkPriorityModal open={bulkPriority !== null} onClose={() => setBulkPriority(null)} orders={bulkPriority?.orders ?? []} onDone={() => bulkPriority?.clear()} />
      <ConfirmDialog
        open={bulkCancel !== null}
        onClose={() => setBulkCancel(null)}
        danger
        title={t("wo.bulk.cancelTitle")}
        confirmLabel={t("wo.bulk.cancelConfirm", { n: fmt.num(cancelDrafts.length) })}
        onConfirm={() => {
          let n = 0;
          for (const o of cancelDrafts) if (setStatus(o.id, "cancelled").ok) n++;
          toast(n > 0 ? "success" : "warning", t("wo.bulk.cancelDone", { n: fmt.num(n) }));
          bulkCancel?.clear();
        }}
        body={
          <>
            <p>{t("wo.bulk.cancelBody", { n: fmt.num(cancelDrafts.length), total: fmt.num(bulkCancel?.orders.length ?? 0) })}</p>
            <p className="mt-2 flex flex-wrap gap-1.5">
              {cancelDrafts.slice(0, 12).map((o) => (
                <Code key={o.id}>{o.id}</Code>
              ))}
            </p>
          </>
        }
      />
    </Page>
  );
}
