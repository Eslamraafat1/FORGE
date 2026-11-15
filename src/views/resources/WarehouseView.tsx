"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import type { Shipment, Warehouse } from "@/domain/types";
import { stockValue } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { zoneUsage } from "@/store/selectors";
import { useForge } from "@/store/store";
import { Kpi, KpiStrip, Member, Page, PageHeader, useLookup } from "@/components/ui/page";
import { Code, Progress } from "@/components/ui/primitives";
import { ShipmentsTable } from "./ShipmentsTable";
import { WarehouseFloor } from "./ZoneMap";
import { SectionTitle, linkButton } from "./shared";

/** A shipment is "in progress" once it has left its origin and until it is dispatched/put away. */
export function shipmentInProgress(s: Shipment): boolean {
  return s.status !== "scheduled" && s.status !== "dispatched";
}

export function WarehouseView() {
  const { t } = useT();
  const fmt = useFmt();
  const warehouses = useForge((s) => s.warehouses);
  const zones = useForge((s) => s.zones);
  const items = useForge((s) => s.items);
  const shipments = useForge((s) => s.shipments);

  const totals = useMemo(() => {
    let capacity = 0, used = 0;
    for (const z of zones) {
      const u = zoneUsage(z, items, shipments);
      capacity += u.capacity;
      used += u.used;
    }
    return { capacity, used, free: capacity - used, occupancy: capacity > 0 ? used / capacity : 0 };
  }, [zones, items, shipments]);

  const inbound = useMemo(() => shipments.filter((s) => s.direction === "inbound"), [shipments]);
  const outbound = useMemo(() => shipments.filter((s) => s.direction === "outbound"), [shipments]);
  const inboundActive = inbound.filter(shipmentInProgress);
  const outboundActive = outbound.filter(shipmentInProgress);
  const pallets = (list: Shipment[]) => list.reduce((s, x) => s + x.pallets, 0);

  return (
    <Page>
      <PageHeader eyebrow={t("warehouse.eyebrow")} title={t("nav.warehouse")} subtitle={t("warehouse.subtitle")} />

      <KpiStrip columns={5}>
        <Kpi label={t("warehouse.kpi.capacity")} value={totals.capacity} format={(n) => fmt.num(Math.round(n))} unit={t("warehouse.positions")} hint={t("warehouse.kpi.capacityHint", { zones: zones.length, n: warehouses.length })} />
        <Kpi label={t("warehouse.occupancy")} value={totals.occupancy} format={(n) => fmt.pct(n)} tone={totals.occupancy >= 0.9 ? "danger" : totals.occupancy >= 0.8 ? "warn" : undefined} hint={t("warehouse.usedOf", { used: totals.used, cap: totals.capacity })} />
        <Kpi label={t("warehouse.kpi.available")} value={totals.free} format={(n) => fmt.num(Math.round(n))} unit={t("warehouse.positions")} />
        <Kpi label={t("warehouse.kpi.inbound")} value={inboundActive.length} format={(n) => fmt.num(Math.round(n))} hint={t("warehouse.kpi.shipHint", { pallets: pallets(inboundActive), scheduled: inbound.filter((s) => s.status === "scheduled").length })} tone={inboundActive.some((s) => s.status === "delayed") ? "warn" : undefined} />
        <Kpi label={t("warehouse.kpi.outbound")} value={outboundActive.length} format={(n) => fmt.num(Math.round(n))} hint={t("warehouse.kpi.shipHint", { pallets: pallets(outboundActive), scheduled: outbound.filter((s) => s.status === "scheduled").length })} />
      </KpiStrip>

      {warehouses.map((w) => (
        <WarehouseSection key={w.id} warehouse={w} />
      ))}

      <div className="grid min-w-0 gap-5 2xl:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2.5">
          <SectionTitle hint={t("warehouse.ship.inboundHint")}>{t("warehouse.ship.inbound")}</SectionTitle>
          <ShipmentsTable rows={inbound} caption={t("warehouse.ship.inbound")} showWarehouse />
        </section>
        <section className="flex min-w-0 flex-col gap-2.5">
          <SectionTitle hint={t("warehouse.ship.outboundHint")}>{t("warehouse.ship.outbound")}</SectionTitle>
          <ShipmentsTable rows={outbound} caption={t("warehouse.ship.outbound")} showWarehouse />
        </section>
      </div>
    </Page>
  );
}

function WarehouseSection({ warehouse }: { warehouse: Warehouse }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const look = useLookup();
  const zones = useForge((s) => s.zones);
  const items = useForge((s) => s.items);
  const shipments = useForge((s) => s.shipments);

  const sum = useMemo(() => {
    let capacity = 0, used = 0;
    for (const z of zones) {
      if (z.warehouseId !== warehouse.id) continue;
      const u = zoneUsage(z, items, shipments);
      capacity += u.capacity;
      used += u.used;
    }
    const here = items.filter((i) => i.warehouseId === warehouse.id);
    return { capacity, used, occupancy: capacity > 0 ? used / capacity : 0, value: here.reduce((s, i) => s + stockValue(i), 0), count: here.length };
  }, [zones, items, shipments, warehouse.id]);

  const factory = look.factory(warehouse.factoryId);
  const href = `/warehouse/${encodeURIComponent(warehouse.id)}`;

  return (
    <section className="panel min-w-0" aria-label={tl(warehouse.name)}>
      <header className="flex flex-col gap-3 border-b border-line px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="label mb-1 flex flex-wrap items-center gap-2">
            <Code>{warehouse.code}</Code>
            {factory && <span>{tl(factory.name)}</span>}
          </div>
          <h2 className="text-[16px] font-semibold text-ink">
            <Link href={href} className="hover:text-forge-text">
              {tl(warehouse.name)}
            </Link>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-[150px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="label">{t("warehouse.occupancy")}</span>
              <span className="num text-[13px] font-semibold text-ink">{fmt.pct(sum.occupancy, 0)}</span>
            </div>
            <Progress value={sum.occupancy} tone={sum.occupancy >= 0.9 ? "danger" : sum.occupancy >= 0.8 ? "warn" : "accent"} className="mt-1.5" label={t("warehouse.occupancy")} />
            <div className="num mt-1 text-[11.5px] text-ink-3">{t("warehouse.usedOf", { used: sum.used, cap: sum.capacity })}</div>
          </div>
          <div>
            <div className="label">{t("warehouse.stockValue")}</div>
            <div className="num mt-1 text-[13px] font-semibold text-ink">{fmt.compactMoney(sum.value)}</div>
            <div className="num mt-0.5 text-[11.5px] text-ink-3">{t("inventory.nSkus", { n: sum.count })}</div>
          </div>
          <div className="min-w-0">
            <div className="label mb-1">{t("warehouse.manager")}</div>
            <Member id={warehouse.managerId} />
          </div>
          <Link href={href} className={linkButton}>
            {t("warehouse.open")}
            <ArrowRight aria-hidden className="size-3.5 rtl:-scale-x-100" />
          </Link>
        </div>
      </header>
      <div className="p-4">
        <WarehouseFloor warehouse={warehouse} />
      </div>
    </section>
  );
}
