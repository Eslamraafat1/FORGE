"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ID, InventoryItem } from "@/domain/types";
import { STOCK_RANK, stockStatus, stockValue } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { useForge } from "@/store/store";
import { RankBars } from "@/components/charts/kit";
import { DataTable, type Column } from "@/components/table/DataTable";
import { EntityNotFound, Kpi, KpiStrip, Member, Page, PageHeader, useLookup } from "@/components/ui/page";
import { Code, DataList, Panel, Select } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { ShipmentsTable } from "./ShipmentsTable";
import { shipmentInProgress } from "./WarehouseView";
import { WarehouseFloor, useZoneUsage } from "./ZoneMap";
import { CategoryValue, MovementsTable, QtyFlash, SectionTitle, StockLevel, useQty } from "./shared";

export function WarehouseDetailView({ id }: { id: string }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const q = useQty();
  const look = useLookup();
  const warehouse = useForge((s) => s.warehouses.find((w) => w.id === id));
  const allZones = useForge((s) => s.zones);
  const allItems = useForge((s) => s.items);
  const allMovements = useForge((s) => s.movements);
  const allShipments = useForge((s) => s.shipments);

  const [selected, setSelected] = useState<ID | null>(null);
  const [zoneFilter, setZoneFilter] = useState<ID | "all">("all");

  const zones = useMemo(() => allZones.filter((z) => z.warehouseId === id), [allZones, id]);
  const usage = useZoneUsage(zones);
  const items = useMemo(() => allItems.filter((i) => i.warehouseId === id), [allItems, id]);
  const movements = useMemo(() => {
    const ids = new Set(items.map((i) => i.id));
    return allMovements.filter((m) => ids.has(m.itemId));
  }, [allMovements, items]);
  const shipments = useMemo(() => allShipments.filter((s) => s.warehouseId === id), [allShipments, id]);

  if (!warehouse) return <EntityNotFound backHref="/warehouse" backLabel={t("nav.warehouse")} />;

  let capacity = 0, used = 0;
  for (const u of usage.values()) {
    capacity += u.capacity;
    used += u.used;
  }
  const occupancy = capacity > 0 ? used / capacity : 0;
  const value = items.reduce((s, i) => s + stockValue(i), 0);
  const attention = items.filter((i) => stockStatus(i) !== "healthy").length;
  const active = shipments.filter(shipmentInProgress);
  const factory = look.factory(warehouse.factoryId);

  const ranked = zones
    .map((z) => ({ zone: z, u: usage.get(z.id)! }))
    .sort((a, b) => b.u.occupancy - a.u.occupancy)
    .map(({ zone, u }) => ({
      key: zone.id,
      label: (
        <>
          <Code className="me-2 font-semibold text-ink">{zone.code}</Code>
          {tl(zone.name)}
        </>
      ),
      value: u.occupancy,
      hint: t("warehouse.usedOf", { used: u.used, cap: u.capacity }),
      color: zone.id === selected ? "var(--forge)" : "var(--c5)",
    }));

  const itemRows = zoneFilter === "all" ? items : items.filter((i) => i.zoneId === zoneFilter);
  const columns: Column<InventoryItem>[] = [
    { id: "sku", header: t("common.sku"), cell: (i) => <Code className="text-ink-2">{i.sku}</Code>, sortValue: (i) => i.sku, mobile: "subtitle", hideable: false },
    {
      id: "name",
      header: t("inventory.col.item"),
      cell: (i) => (
        <Link href={`/inventory/${encodeURIComponent(i.id)}`} className="font-medium text-ink hover:text-forge-text">
          {tl(i.name)}
        </Link>
      ),
      sortValue: (i) => tl(i.name),
      mobile: "title",
      hideable: false,
    },
    { id: "zone", header: t("common.zone"), cell: (i) => <Code className="text-ink-2">{i.zoneId}</Code>, sortValue: (i) => i.zoneId },
    {
      id: "quantity",
      header: t("common.quantity"),
      cell: (i) => (
        <QtyFlash itemId={i.id}>
          <span className="num font-semibold text-ink">{q.qty(i.quantity)}</span>
          <span className="text-[11.5px] font-normal text-ink-3">{i.unit}</span>
        </QtyFlash>
      ),
      sortValue: (i) => i.quantity,
      align: "end",
    },
    { id: "level", header: t("inventory.col.level"), cell: (i) => <StockLevel item={i} />, sortValue: (i) => (i.reorderLevel > 0 ? i.quantity / i.reorderLevel : Number.MAX_SAFE_INTEGER) },
    { id: "value", header: t("inventory.col.value"), cell: (i) => <span className="num">{fmt.money(stockValue(i))}</span>, sortValue: (i) => stockValue(i), align: "end" },
    { id: "status", header: t("common.status"), cell: (i) => <StatusBadge kind="stock" value={stockStatus(i)} />, sortValue: (i) => STOCK_RANK[stockStatus(i)], mobile: "badge", hideable: false },
  ];

  return (
    <Page>
      <PageHeader
        back={{ href: "/warehouse", label: t("nav.warehouse") }}
        eyebrow={
          <>
            <Code>{warehouse.code}</Code>
            {factory && <span>{tl(factory.name)}</span>}
          </>
        }
        title={tl(warehouse.name)}
        subtitle={t("warehouse.detail.subtitle")}
      />

      <KpiStrip columns={5}>
        <Kpi label={t("warehouse.kpi.capacity")} value={capacity} format={(n) => fmt.num(Math.round(n))} unit={t("warehouse.positions")} hint={t("warehouse.detail.zonesHint", { n: zones.length })} />
        <Kpi label={t("warehouse.occupancy")} value={occupancy} format={(n) => fmt.pct(n)} tone={occupancy >= 0.9 ? "danger" : occupancy >= 0.8 ? "warn" : undefined} hint={t("warehouse.usedOf", { used, cap: capacity })} />
        <Kpi label={t("warehouse.kpi.available")} value={capacity - used} format={(n) => fmt.num(Math.round(n))} unit={t("warehouse.positions")} />
        <Kpi label={t("warehouse.stockValue")} value={value} format={(n) => fmt.compactMoney(n)} hint={t("inventory.nSkus", { n: items.length })} />
        <Kpi label={t("inventory.needsAttention")} value={attention} format={(n) => fmt.num(Math.round(n))} tone={attention > 0 ? "warn" : undefined} hint={t("warehouse.detail.attentionHint")} />
      </KpiStrip>

      <Panel title={t("warehouse.map.title")} subtitle={t("warehouse.map.hint")}>
        <WarehouseFloor warehouse={warehouse} size="lg" selectedId={selected} onSelect={setSelected} />
      </Panel>

      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Panel title={t("inventory.valueByCategory")} subtitle={t("warehouse.detail.valueHint")} className="lg:col-span-2">
          <CategoryValue items={items} />
        </Panel>
        <Panel title={t("warehouse.manager")}>
          <Member id={warehouse.managerId} showRole size={30} />
          <DataList
            className="mt-4"
            items={[
              { label: t("common.factory"), value: factory ? tl(factory.name) : "—" },
              { label: t("warehouse.detail.activeShipments"), value: <span className="num">{fmt.num(active.length)}</span> },
            ]}
          />
        </Panel>
      </div>

      <Panel title={t("warehouse.detail.occupancyByZone")} subtitle={t("warehouse.detail.occupancyByZoneHint")}>
        <RankBars rows={ranked} max={1} formatValue={(v) => fmt.pct(v, 0)} onSelect={(key) => setSelected(key === selected ? null : key)} />
      </Panel>

      <section className="flex min-w-0 flex-col gap-2.5">
        <SectionTitle hint={t("warehouse.detail.itemsHint")}>{t("warehouse.detail.items")}</SectionTitle>
        <DataTable
          rows={itemRows}
          columns={columns}
          getRowId={(i) => i.id}
          caption={t("warehouse.detail.items")}
          searchText={(i) => `${i.sku} ${i.name.en} ${i.name.ar} ${i.zoneId}`}
          searchPlaceholder={t("inventory.search")}
          initialSort={{ id: "status", dir: "desc" }}
          rowHref={(i) => `/inventory/${encodeURIComponent(i.id)}`}
          activeFilters={zoneFilter === "all" ? 0 : 1}
          onClearFilters={() => setZoneFilter("all")}
          filters={
            <Select aria-label={t("common.zone")} value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
              <option value="all">{t("warehouse.detail.allZones")}</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.code} · {tl(z.name)}
                </option>
              ))}
            </Select>
          }
          empty={{ title: t("warehouse.detail.noItems") }}
        />
      </section>

      <section className="flex min-w-0 flex-col gap-2.5">
        <SectionTitle hint={t("warehouse.detail.movementsHint")}>{t("warehouse.detail.movements")}</SectionTitle>
        <MovementsTable rows={movements} caption={t("warehouse.detail.movements")} showItem typeFilter emptyTitle={t("inventory.noMovements")} />
      </section>

      <section className="flex min-w-0 flex-col gap-2.5">
        <SectionTitle>{t("warehouse.detail.shipments")}</SectionTitle>
        <ShipmentsTable rows={shipments} caption={t("warehouse.detail.shipments")} showDirection />
      </section>
    </Page>
  );
}
