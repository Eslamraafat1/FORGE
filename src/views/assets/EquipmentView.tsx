"use client";
import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Box, Cog, Gauge as GaugeIcon, Wrench } from "lucide-react";
import type { Machine, MachineStatus } from "@/domain/types";
import { machineIsDown } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { startOfDay } from "@/lib/time";
import { useForge } from "@/store/store";
import { Code, Select } from "@/components/ui/primitives";
import { EntityLink, Kpi, KpiStrip, Page, PageHeader, useLookup } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status";
import { DataTable, type Column } from "@/components/table/DataTable";
import { LinkButton, MACHINE_STATUSES, MachineStatusMenu, ServiceDueBadge, UtilBar, serviceDays, serviceState } from "./shared";

export function EquipmentView() {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const machines = useForge((s) => s.machines);
  const lines = useForge((s) => s.lines);
  const factories = useForge((s) => s.factories);
  const today = useForge((s) => startOfDay(s.now));
  const lookup = useLookup();

  const [status, setStatus] = useState<MachineStatus | "all">("all");
  const [lineId, setLineId] = useState("all");
  const [factoryId, setFactoryId] = useState("all");
  const [maker, setMaker] = useState("all");

  const makers = useMemo(() => [...new Set(machines.map((m) => m.manufacturer))].sort(), [machines]);

  const kpi = useMemo(() => {
    let running = 0, maintenance = 0, offline = 0, util = 0, overdue = 0, soon = 0;
    for (const m of machines) {
      if (m.status === "running") running++;
      else if (m.status === "maintenance") maintenance++;
      else if (m.status === "offline") offline++;
      util += m.utilization;
      const st = serviceState(m, today);
      if (st === "overdue") overdue++;
      else if (st === "soon") soon++;
    }
    return { total: machines.length, running, maintenance, offline, down: machines.filter(machineIsDown).length, util: machines.length ? util / machines.length : 0, overdue, soon };
  }, [machines, today]);

  const rows = useMemo(
    () =>
      machines.filter(
        (m) =>
          (status === "all" || m.status === status) &&
          (lineId === "all" || m.lineId === lineId) &&
          (factoryId === "all" || m.factoryId === factoryId) &&
          (maker === "all" || m.manufacturer === maker),
      ),
    [machines, status, lineId, factoryId, maker],
  );
  const activeFilters = [status, lineId, factoryId, maker].filter((v) => v !== "all").length;
  const clearFilters = () => {
    setStatus("all");
    setLineId("all");
    setFactoryId("all");
    setMaker("all");
  };

  const columns = useMemo<Column<Machine>[]>(
    () => [
      { id: "id", header: t("equipment.col.id"), cell: (m) => <Code>{m.id}</Code>, sortValue: (m) => m.id, hideable: false, mobile: "subtitle" },
      {
        id: "name",
        header: t("common.name"),
        cell: (m) => (
          <span className="block min-w-0">
            <span className="block truncate font-medium text-ink">{tl(m.name)}</span>
          </span>
        ),
        sortValue: (m) => tl(m.name),
        hideable: false,
        mobile: "title",
      },
      { id: "manufacturer", header: t("equipment.col.manufacturer"), cell: (m) => <span className="whitespace-nowrap text-ink-2">{m.manufacturer}</span>, sortValue: (m) => m.manufacturer },
      { id: "model", header: t("equipment.col.model"), cell: (m) => <Code className="text-ink-2">{m.model}</Code>, sortValue: (m) => m.model },
      {
        id: "line",
        header: t("common.line"),
        cell: (m) => {
          const line = lookup.line(m.lineId);
          return (
            <EntityLink entity={{ type: "line", id: m.lineId }} className="whitespace-nowrap">
              <Code>{line?.code ?? m.lineId}</Code>
            </EntityLink>
          );
        },
        sortValue: (m) => m.lineId,
      },
      { id: "installed", header: t("equipment.col.installed"), cell: (m) => <span className="num whitespace-nowrap text-ink-2">{fmt.date(m.installDate)}</span>, sortValue: (m) => m.installDate },
      { id: "status", header: t("common.status"), cell: (m) => <StatusBadge kind="machine" value={m.status} />, sortValue: (m) => MACHINE_STATUSES.indexOf(m.status), mobile: "badge" },
      { id: "utilization", header: t("common.utilization"), cell: (m) => <UtilBar value={m.utilization} label={t("common.utilization")} />, sortValue: (m) => m.utilization },
      { id: "last", header: t("equipment.col.lastService"), cell: (m) => <span className="num whitespace-nowrap text-ink-2">{fmt.date(m.lastMaintenance)}</span>, sortValue: (m) => m.lastMaintenance },
      {
        id: "next",
        header: t("equipment.col.nextService"),
        cell: (m) => {
          const overdue = serviceDays(m.nextMaintenance, today) < 0;
          return (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={overdue ? "num whitespace-nowrap font-semibold text-danger" : "num whitespace-nowrap text-ink"}>{fmt.date(m.nextMaintenance)}</span>
              {serviceState(m, today) !== "ok" && <ServiceDueBadge date={m.nextMaintenance} now={today} />}
            </span>
          );
        },
        sortValue: (m) => m.nextMaintenance,
      },
      { id: "location", header: t("common.location"), cell: (m) => <span className="whitespace-nowrap text-ink-2">{tl(m.location)}</span>, sortValue: (m) => tl(m.location) },
    ],
    [t, tl, fmt, lookup, today],
  );

  return (
    <Page>
      <PageHeader
        eyebrow={t("equipment.eyebrow")}
        title={t("equipment.title")}
        subtitle={t("equipment.subtitle")}
        actions={
          <>
            <LinkButton href="/factory" icon={Box}>
              {t("equipment.action.twin")}
            </LinkButton>
            <LinkButton href="/maintenance" icon={Wrench}>
              {t("equipment.action.workspace")}
            </LinkButton>
          </>
        }
      />

      <KpiStrip columns={5}>
        <Kpi label={t("equipment.kpi.total")} value={kpi.total} format={(n) => fmt.num(Math.round(n))} icon={Cog} hint={t("equipment.kpi.totalHint", { lines: lines.length, factories: factories.length })} />
        <Kpi label={t("equipment.kpi.running")} value={kpi.running} format={(n) => fmt.num(Math.round(n))} icon={Activity} tone="ok" hint={t("equipment.kpi.runningHint", { pct: fmt.pct(kpi.total ? kpi.running / kpi.total : 0, 0) })} />
        <Kpi
          label={t("equipment.kpi.down")}
          value={kpi.down}
          format={(n) => fmt.num(Math.round(n))}
          icon={Wrench}
          tone={kpi.down > 0 ? "warn" : undefined}
          hint={t("equipment.kpi.downHint", { maintenance: kpi.maintenance, offline: kpi.offline })}
        />
        <Kpi label={t("equipment.kpi.utilization")} value={kpi.util} format={(n) => fmt.pct(n / 100, 1)} icon={GaugeIcon} hint={t("equipment.kpi.utilizationHint")} />
        <Kpi
          label={t("equipment.kpi.overdue")}
          value={kpi.overdue}
          format={(n) => fmt.num(Math.round(n))}
          icon={AlertTriangle}
          tone={kpi.overdue > 0 ? "danger" : undefined}
          hint={t("equipment.kpi.overdueHint", { n: kpi.soon })}
          className="col-span-2 md:col-span-1"
        />
      </KpiStrip>

      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(m) => m.id}
        caption={t("equipment.table.caption")}
        searchText={(m) => `${m.id} ${m.name.en} ${m.name.ar} ${m.manufacturer} ${m.model} ${m.serial} ${m.lineId} ${m.kind.en} ${m.kind.ar}`}
        searchPlaceholder={t("equipment.table.search")}
        initialSort={{ id: "id", dir: "asc" }}
        pageSize={20}
        rowHref={(m) => `/equipment/${encodeURIComponent(m.id)}`}
        rowActions={(m) => <MachineStatusMenu machine={m} variant="row" withLinks />}
        activeFilters={activeFilters}
        onClearFilters={clearFilters}
        empty={{ title: t("equipment.table.empty") }}
        filters={
          <>
            <Select aria-label={t("common.status")} value={status} onChange={(e) => setStatus(e.target.value as MachineStatus | "all")}>
              <option value="all">{t("equipment.filter.allStatuses")}</option>
              {MACHINE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {td(`mstatus.${s}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("common.line")} value={lineId} onChange={(e) => setLineId(e.target.value)}>
              <option value="all">{t("equipment.filter.allLines")}</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {tl(l.name)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("common.factory")} value={factoryId} onChange={(e) => setFactoryId(e.target.value)}>
              <option value="all">{t("equipment.filter.allFactories")}</option>
              {factories.map((f) => (
                <option key={f.id} value={f.id}>
                  {tl(f.name)}
                </option>
              ))}
            </Select>
            <Select aria-label={t("equipment.col.manufacturer")} value={maker} onChange={(e) => setMaker(e.target.value)}>
              <option value="all">{t("equipment.filter.allManufacturers")}</option>
              {makers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </>
        }
      />
    </Page>
  );
}
