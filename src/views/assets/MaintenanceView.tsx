"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, Ban, CalendarClock, CircleDollarSign, ClipboardList, Cog, Plus, UserCheck, Wrench } from "lucide-react";
import type { MaintenanceOrder, MaintenanceStatus, MaintenanceType, Priority } from "@/domain/types";
import { maintenanceIsOpen } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { DAY } from "@/lib/time";
import { useForge } from "@/store/store";
import { Badge, Button, Code, Progress, Select, Tabs } from "@/components/ui/primitives";
import { ConfirmDialog, Menu } from "@/components/ui/overlay";
import { EntityLink, Guard, Kpi, KpiStrip, Member, Page, PageHeader, useCan, useLookup } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status";
import { toast, useAction } from "@/components/ui/toast";
import { DataTable, type Column } from "@/components/table/DataTable";
import { MAINT_TYPES, MaintenanceCreateModal, PRIORITIES } from "./MaintenanceCreateModal";
import { MaintenanceOrderDrawer } from "./MaintenanceOrderDrawer";
import { CostSection, DowntimeSection, EquipmentServiceSection, ScheduleSection } from "./MaintenanceSections";
import { LinkButton, orderIsOverdue, serviceDays } from "./shared";

type Tab = "orders" | "equipment" | "schedule" | "downtime" | "costs";
const STATUSES: MaintenanceStatus[] = ["requested", "scheduled", "in_progress", "completed", "cancelled"];
const STATUS_RANK: Record<MaintenanceStatus, number> = { in_progress: 0, requested: 1, scheduled: 2, completed: 3, cancelled: 4 };
const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2, urgent: 3 };

interface CreateState {
  open: boolean;
  seq: number;
  machineId: string | null;
}

export function MaintenanceView() {
  const { t } = useT();
  const fmt = useFmt();
  const pathname = usePathname();
  const sp = useSearchParams();
  const orders = useForge((s) => s.maintenanceOrders);
  const machines = useForge((s) => s.machines);
  const now = useForge((s) => s.now);

  /* Deep links: ?new=1[&machine=<id>] opens the create dialog, ?order=<id> opens a record. */
  const pNew = sp.get("new") === "1";
  const pMachine = sp.get("machine");
  const pOrder = sp.get("order");
  const paramKey = `${pNew}|${pMachine ?? ""}|${pOrder ?? ""}`;
  const [seenParams, setSeenParams] = useState(paramKey);
  const [orderId, setOrderId] = useState<string | null>(pOrder);
  const [create, setCreate] = useState<CreateState>({ open: pNew, seq: 0, machineId: pMachine });
  const [tab, setTab] = useState<Tab>("orders");
  if (seenParams !== paramKey) {
    // The URL changed while this view stayed mounted (e.g. command palette): follow it.
    setSeenParams(paramKey);
    setOrderId(pOrder);
    setCreate((c) => ({ open: pNew, seq: pNew ? c.seq + 1 : c.seq, machineId: pMachine }));
  }
  const clearParams = () => {
    if (sp.size > 0) window.history.replaceState(null, "", pathname);
  };
  const openCreate = () => setCreate((c) => ({ open: true, seq: c.seq + 1, machineId: null }));
  const closeCreate = () => {
    setCreate((c) => ({ ...c, open: false }));
    clearParams();
  };
  const closeOrder = () => {
    setOrderId(null);
    clearParams();
  };

  const kpi = useMemo(() => {
    let requested = 0, inProgress = 0, overdue = 0, upcoming = 0, cost30 = 0, openEstimate = 0, scheduled = 0;
    for (const o of orders) {
      if (o.status === "requested") requested++;
      else if (o.status === "scheduled") scheduled++;
      else if (o.status === "in_progress") inProgress++;
      if (orderIsOverdue(o, now)) overdue++;
      if (maintenanceIsOpen(o.status)) {
        openEstimate += o.cost;
        if (o.scheduledDate >= now && o.scheduledDate <= now + 7 * DAY) upcoming++;
      } else if (o.status === "completed" && (o.completedAt ?? 0) >= now - 30 * DAY) cost30 += o.cost;
    }
    const pmOverdue = machines.filter((m) => serviceDays(m.nextMaintenance, now) < 0).length;
    return { requested, scheduled, inProgress, overdue, upcoming, cost30, openEstimate, pmOverdue, open: requested + scheduled + inProgress };
  }, [orders, machines, now]);

  return (
    <Page>
      <PageHeader
        eyebrow={t("maintenance.eyebrow")}
        title={t("maintenance.title")}
        subtitle={t("maintenance.subtitle")}
        actions={
          <>
            <LinkButton href="/equipment" icon={Cog}>
              {t("maintenance.action.registry")}
            </LinkButton>
            <Guard cap="maintenance.manage">
              <Button variant="primary" icon={Plus} onClick={openCreate}>
                {t("maintenance.action.new")}
              </Button>
            </Guard>
          </>
        }
      />

      <KpiStrip columns={5}>
        <Kpi label={t("maintenance.kpi.requests")} value={kpi.requested} format={(n) => fmt.num(Math.round(n))} icon={ClipboardList} tone={kpi.requested > 0 ? "warn" : undefined} hint={t("maintenance.kpi.requestsHint", { n: kpi.scheduled })} />
        <Kpi label={t("maintenance.kpi.inProgress")} value={kpi.inProgress} format={(n) => fmt.num(Math.round(n))} icon={Wrench} hint={t("maintenance.kpi.inProgressHint", { n: kpi.open })} />
        <Kpi label={t("maintenance.kpi.overdue")} value={kpi.overdue} format={(n) => fmt.num(Math.round(n))} icon={AlertTriangle} tone={kpi.overdue > 0 ? "danger" : undefined} hint={t("maintenance.kpi.overdueHint", { n: kpi.pmOverdue })} />
        <Kpi label={t("maintenance.kpi.upcoming")} value={kpi.upcoming} format={(n) => fmt.num(Math.round(n))} icon={CalendarClock} hint={t("maintenance.kpi.upcomingHint")} />
        <Kpi
          label={t("maintenance.kpi.cost")}
          value={kpi.cost30}
          format={(n) => fmt.money(Math.round(n))}
          icon={CircleDollarSign}
          hint={t("maintenance.kpi.costHint", { open: fmt.money(kpi.openEstimate) })}
          className="col-span-2 md:col-span-1"
        />
      </KpiStrip>

      <Tabs<Tab>
        label={t("maintenance.tabs")}
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "orders", label: t("maintenance.tab.orders"), count: kpi.open },
          { value: "equipment", label: t("maintenance.tab.equipment") },
          { value: "schedule", label: t("maintenance.tab.schedule") },
          { value: "downtime", label: t("maintenance.tab.downtime") },
          { value: "costs", label: t("maintenance.tab.costs") },
        ]}
      />

      <div role="tabpanel" aria-label={t(`maintenance.tab.${tab}`)} className="min-w-0">
        {tab === "orders" && <OrdersTable activeId={orderId} onOpen={setOrderId} onCreate={openCreate} />}
        {tab === "equipment" && <EquipmentServiceSection />}
        {tab === "schedule" && <ScheduleSection onOpen={setOrderId} />}
        {tab === "downtime" && <DowntimeSection />}
        {tab === "costs" && <CostSection />}
      </div>

      <MaintenanceCreateModal key={create.seq} open={create.open} machineId={create.machineId} onClose={closeCreate} onCreated={setOrderId} />
      <MaintenanceOrderDrawer orderId={orderId} onClose={closeOrder} />
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Work orders table                                                   */
/* ------------------------------------------------------------------ */

function OrdersTable({ activeId, onOpen, onCreate }: { activeId: string | null; onOpen: (id: string) => void; onCreate: () => void }) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const lookup = useLookup();
  const orders = useForge((s) => s.maintenanceOrders);
  const team = useForge((s) => s.team);
  const now = useForge((s) => s.now);
  const updateMaintenance = useForge((s) => s.updateMaintenance);
  const cancelMaintenance = useForge((s) => s.cancelMaintenance);
  const canManage = useCan("maintenance.manage");
  const run = useAction();

  const [status, setStatus] = useState<MaintenanceStatus | "all" | "open">("all");
  const [type, setType] = useState<MaintenanceType | "all">("all");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [tech, setTech] = useState("all");
  const [bulkCancel, setBulkCancel] = useState<{ ids: string[]; clear: () => void } | null>(null);

  const technicians = useMemo(() => team.filter((m) => m.role === "technician"), [team]);
  // Overdue flags only change when the minute-level clock crosses a schedule; keying on the set keeps columns stable.
  const overdueKey = useMemo(() => orders.filter((o) => orderIsOverdue(o, now)).map((o) => o.id).join(","), [orders, now]);

  const rows = useMemo(
    () =>
      orders.filter(
        (o) =>
          (status === "all" || (status === "open" ? maintenanceIsOpen(o.status) : o.status === status)) &&
          (type === "all" || o.type === type) &&
          (priority === "all" || o.priority === priority) &&
          (tech === "all" || (tech === "none" ? o.technicianId === null : o.technicianId === tech)),
      ),
    [orders, status, type, priority, tech],
  );
  const activeFilters = [status, type, priority, tech].filter((v) => v !== "all").length;
  const clearFilters = () => {
    setStatus("all");
    setType("all");
    setPriority("all");
    setTech("all");
  };

  const columns = useMemo<Column<MaintenanceOrder>[]>(() => {
    const overdue = new Set(overdueKey ? overdueKey.split(",") : []);
    return [
      { id: "id", header: t("maintenance.col.id"), cell: (o) => <Code className="font-semibold">{o.id}</Code>, sortValue: (o) => o.id, hideable: false, mobile: "title" },
      {
        id: "equipment",
        header: t("maintenance.col.equipment"),
        cell: (o) => (
          <span className="flex min-w-0 flex-col">
            <EntityLink entity={{ type: "machine", id: o.machineId }}>
              <Code>{o.machineId}</Code>
            </EntityLink>
            <span className="max-w-[11rem] truncate text-[12px] text-ink-3">{lookup.machine(o.machineId) ? tl(lookup.machine(o.machineId)!.name) : ""}</span>
          </span>
        ),
        sortValue: (o) => o.machineId,
      },
      { id: "type", header: t("common.type"), cell: (o) => <StatusBadge kind="maintenanceType" value={o.type} />, sortValue: (o) => o.type, mobile: "badge" },
      {
        id: "issue",
        header: t("maintenance.col.issue"),
        cell: (o) => <span className="line-clamp-2 min-w-[14rem] max-w-[26rem] text-ink-2">{tl(o.description)}</span>,
        mobile: "subtitle",
      },
      { id: "priority", header: t("common.priority"), cell: (o) => <StatusBadge kind="priority" value={o.priority} />, sortValue: (o) => PRIORITY_RANK[o.priority] },
      { id: "technician", header: t("common.technician"), cell: (o) => <Member id={o.technicianId} />, sortValue: (o) => (lookup.member(o.technicianId) ? tl(lookup.member(o.technicianId)!.name) : "") },
      {
        id: "scheduled",
        header: t("maintenance.col.scheduled"),
        cell: (o) => (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={overdue.has(o.id) ? "num whitespace-nowrap font-semibold text-danger" : "num whitespace-nowrap"}>{fmt.dateTime(o.scheduledDate)}</span>
            {overdue.has(o.id) && (
              <Badge tone="danger" dot>
                {t("maintenance.overdue")}
              </Badge>
            )}
          </span>
        ),
        sortValue: (o) => o.scheduledDate,
      },
      { id: "duration", header: t("maintenance.col.duration"), cell: (o) => fmt.duration(o.estimatedHours * 60), sortValue: (o) => o.estimatedHours, align: "end" },
      { id: "status", header: t("common.status"), cell: (o) => <StatusBadge kind="maintenance" value={o.status} />, sortValue: (o) => STATUS_RANK[o.status], mobile: "badge" },
      {
        id: "progress",
        header: t("common.progress"),
        cell: (o) => (
          <span className="inline-flex items-center gap-2">
            <Progress value={o.progress / 100} tone={o.status === "completed" ? "ok" : o.status === "cancelled" ? "neutral" : "accent"} label={t("common.progress")} className="w-16" />
            <span className="num w-9 text-end text-[12px] text-ink-2">{fmt.pct(o.progress / 100, 0)}</span>
          </span>
        ),
        sortValue: (o) => o.progress,
      },
      { id: "cost", header: t("common.cost"), cell: (o) => fmt.money(o.cost), sortValue: (o) => o.cost, align: "end" },
    ];
  }, [t, tl, fmt, lookup, overdueKey]);

  const bulkAssign = (selected: MaintenanceOrder[], technicianId: string, clear: () => void) => {
    const eligible = selected.filter((o) => maintenanceIsOpen(o.status) && o.technicianId !== technicianId);
    let done = 0;
    for (const o of eligible) if (run(updateMaintenance(o.id, { technicianId }))) done++;
    const member = lookup.member(technicianId);
    if (done > 0) toast("success", t("maintenance.bulk.assigned", { n: done, name: member ? tl(member.name) : technicianId }));
    else toast("info", t("maintenance.bulk.none"));
    clear();
  };
  const confirmBulkCancel = () => {
    if (!bulkCancel) return;
    let done = 0;
    for (const id of bulkCancel.ids) if (run(cancelMaintenance(id))) done++;
    if (done > 0) toast("success", t("maintenance.bulk.cancelled", { n: done }));
    bulkCancel.clear();
  };

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(o) => o.id}
        caption={t("maintenance.tab.orders")}
        searchText={(o) => `${o.id} ${o.machineId} ${o.description.en} ${o.description.ar} ${lookup.machine(o.machineId)?.name.en ?? ""} ${lookup.machine(o.machineId)?.name.ar ?? ""}`}
        searchPlaceholder={t("maintenance.orders.search")}
        initialSort={{ id: "scheduled", dir: "desc" }}
        pageSize={10}
        onRowClick={(o) => onOpen(o.id)}
        activeRowId={activeId}
        activeFilters={activeFilters}
        onClearFilters={clearFilters}
        selectable={canManage}
        bulkActions={(selected, clear) => {
          const cancellable = selected.filter((o) => o.status === "requested" || o.status === "scheduled");
          return (
            <>
              <Menu
                label={t("maintenance.bulk.assign")}
                align="start"
                items={technicians.map((m) => ({ label: tl(m.name), onSelect: () => bulkAssign(selected, m.id, clear) }))}
                trigger={(p) => (
                  <Button size="sm" icon={UserCheck} {...p}>
                    {t("maintenance.bulk.assign")}
                  </Button>
                )}
              />
              <Button size="sm" variant="danger" icon={Ban} disabled={cancellable.length === 0} onClick={() => setBulkCancel({ ids: cancellable.map((o) => o.id), clear })}>
                {t("maintenance.bulk.cancel", { n: cancellable.length })}
              </Button>
            </>
          );
        }}
        empty={{
          title: t("maintenance.orders.empty"),
          hint: t("maintenance.orders.emptyHint"),
          action: (
            <Guard cap="maintenance.manage">
              <Button icon={Plus} onClick={onCreate}>
                {t("maintenance.action.new")}
              </Button>
            </Guard>
          ),
        }}
        filters={
          <>
            <Select aria-label={t("common.status")} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">{t("maintenance.filter.allStatuses")}</option>
              <option value="open">{t("maintenance.filter.open")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {td(`mntstatus.${s}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("common.type")} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="all">{t("maintenance.filter.allTypes")}</option>
              {MAINT_TYPES.map((x) => (
                <option key={x} value={x}>
                  {td(`mnttype.${x}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("common.priority")} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="all">{t("maintenance.filter.allPriorities")}</option>
              {PRIORITIES.map((x) => (
                <option key={x} value={x}>
                  {td(`priority.${x}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("common.technician")} value={tech} onChange={(e) => setTech(e.target.value)}>
              <option value="all">{t("maintenance.filter.allTechnicians")}</option>
              <option value="none">{t("common.unassigned")}</option>
              {technicians.map((m) => (
                <option key={m.id} value={m.id}>
                  {tl(m.name)}
                </option>
              ))}
            </Select>
          </>
        }
      />
      <ConfirmDialog
        open={bulkCancel !== null}
        onClose={() => setBulkCancel(null)}
        onConfirm={confirmBulkCancel}
        danger
        title={t("maintenance.bulk.cancelTitle", { n: bulkCancel?.ids.length ?? 0 })}
        body={t("maintenance.cancel.body")}
        confirmLabel={t("maintenance.action.cancel")}
      />
      <p className="mt-2 text-[11.5px] text-ink-3">{t("maintenance.orders.predictiveNote")}</p>
    </>
  );
}
