"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Factory, Pencil, ShoppingCart, SlidersHorizontal } from "lucide-react";
import type { InventoryItem, WorkOrder } from "@/domain/types";
import { palletsUsed, stockStatus, stockValue, woIsOpen } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { DAY, HOUR } from "@/lib/time";
import { useForge } from "@/store/store";
import { ChartPanel, ChartTooltip, useChartProps } from "@/components/charts/kit";
import { DataTable, type Column } from "@/components/table/DataTable";
import { EntityLink, EntityNotFound, Guard, Kpi, KpiStrip, Page, PageHeader, useLookup } from "@/components/ui/page";
import { Badge, Button, Code, DataList, Field, Input, LegendItem, Panel } from "@/components/ui/primitives";
import { STOCK_TONE, StatusBadge } from "@/components/ui/status";
import { useAction } from "@/components/ui/toast";
import { AdjustStockModal } from "./AdjustStockModal";
import { ItemFormModal } from "./ItemFormModal";
import { ZoneMap, useZoneUsage } from "./ZoneMap";
import { MovementsTable, QtyFlash, SectionTitle, StockLevel, linkButton, useQty } from "./shared";

/** Window used for the consumption rate behind "days of cover". */
const COVER_WINDOW_DAYS = 30;

interface RelatedOrder {
  wo: WorkOrder;
  relation: "consumes" | "produces";
  /** Material still required by the order (BOM qty × remaining units). */
  need: number | null;
}

export function ItemDetailView({ id }: { id: string }) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const q = useQty();
  const cp = useChartProps();
  const look = useLookup();
  const item = useForge((s) => s.items.find((i) => i.id === id));
  const now = useForge((s) => s.now);
  const allMovements = useForge((s) => s.movements);
  const products = useForge((s) => s.products);
  const workOrders = useForge((s) => s.workOrders);
  const purchaseOrders = useForge((s) => s.purchaseOrders);
  const allZones = useForge((s) => s.zones);

  const [adjusting, setAdjusting] = useState(false);
  const [editing, setEditing] = useState(false);

  const movements = useMemo(() => allMovements.filter((m) => m.itemId === id), [allMovements, id]);
  const whZones = useMemo(() => allZones.filter((z) => z.warehouseId === item?.warehouseId), [allZones, item?.warehouseId]);
  const usage = useZoneUsage(whZones);

  // The chart's right edge only needs hourly resolution; avoids redrawing on every simulation tick.
  const nowHour = Math.floor(now / HOUR) * HOUR;
  const quantity = item?.quantity ?? 0;
  const history = useMemo(() => {
    const asc = movements.slice().sort((a, b) => a.at - b.at);
    if (asc.length === 0) return [];
    const pts = [{ at: asc[0].at - DAY, balance: Math.round((asc[0].balance - asc[0].qty) * 100) / 100 }, ...asc.map((m) => ({ at: m.at, balance: m.balance }))];
    if (nowHour > asc[asc.length - 1].at) pts.push({ at: nowHour, balance: quantity });
    return pts;
  }, [movements, nowHour, quantity]);

  // Days of cover = on hand ÷ (units issued or scrapped in the last 30 days ÷ 30).
  const consumed = useMemo(() => {
    const from = now - COVER_WINDOW_DAYS * DAY;
    return movements.filter((m) => m.at >= from && m.qty < 0 && (m.type === "issue" || m.type === "scrap")).reduce((s, m) => s - m.qty, 0);
  }, [movements, now]);

  const related = useMemo<RelatedOrder[]>(() => {
    if (!item) return [];
    const perUnit = new Map<string, number>();
    for (const p of products) {
      const line = p.bom.find((b) => b.itemId === item.id);
      if (line) perUnit.set(p.id, line.qtyPerUnit);
    }
    return workOrders
      .filter((wo) => perUnit.has(wo.productId) || (!!item.productId && wo.productId === item.productId))
      .map((wo): RelatedOrder => {
        const per = perUnit.get(wo.productId);
        return per !== undefined
          ? { wo, relation: "consumes", need: woIsOpen(wo) ? Math.round(per * Math.max(0, wo.plannedQty - wo.completedQty) * 100) / 100 : null }
          : { wo, relation: "produces", need: null };
      })
      .sort((a, b) => Number(woIsOpen(b.wo)) - Number(woIsOpen(a.wo)) || (woIsOpen(a.wo) ? a.wo.dueDate - b.wo.dueDate : b.wo.dueDate - a.wo.dueDate));
  }, [item, products, workOrders]);

  const openPos = useMemo(
    () => purchaseOrders.filter((po) => po.status !== "received" && po.status !== "cancelled" && po.lines.some((ln) => ln.itemId === id)).sort((a, b) => a.expectedDate - b.expectedDate),
    [purchaseOrders, id],
  );

  if (!item) return <EntityNotFound backHref="/inventory" backLabel={t("nav.inventory")} />;

  const status = stockStatus(item);
  const dailyUse = consumed / COVER_WINDOW_DAYS;
  const cover = dailyUse > 0 ? Math.max(0, item.quantity) / dailyUse : null;
  const supplier = look.supplier(item.supplierId);
  const warehouse = look.warehouse(item.warehouseId);
  const zone = look.zone(item.zoneId);
  const product = look.product(item.productId);
  const openNeed = related.reduce((s, r) => s + (r.need ?? 0), 0);
  const onOrder = openPos.reduce((s, po) => s + po.lines.filter((ln) => ln.itemId === item.id).reduce((x, ln) => x + Math.max(0, ln.qty - ln.receivedQty), 0), 0);
  const balances = history.map((h) => h.balance);
  const yMax = Math.max(item.reorderLevel, ...balances, 1) * 1.12;
  const yMin = Math.min(0, ...balances);
  const requestHref = `/procurement?new=1&item=${encodeURIComponent(item.sku)}`;

  const woColumns: Column<RelatedOrder>[] = [
    { id: "id", header: t("common.workOrder"), cell: (r) => <EntityLink entity={{ type: "workOrder", id: r.wo.id }} />, sortValue: (r) => r.wo.id, mobile: "title", hideable: false },
    { id: "product", header: t("common.product"), cell: (r) => <span className="text-ink-2">{look.product(r.wo.productId) ? tl(look.product(r.wo.productId)!.name) : "—"}</span>, mobile: "subtitle" },
    { id: "relation", header: t("inventory.detail.relation"), cell: (r) => <Badge tone={r.relation === "consumes" ? "info" : "accent"}>{t(r.relation === "consumes" ? "inventory.detail.consumes" : "inventory.detail.produces")}</Badge>, sortValue: (r) => r.relation },
    {
      id: "need",
      header: t("inventory.detail.stillRequired"),
      cell: (r) =>
        r.need !== null ? (
          <span className="num">
            {q.qty(r.need)} <span className="text-ink-3">{item.unit}</span>
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
      sortValue: (r) => r.need ?? -1,
      align: "end",
    },
    { id: "due", header: t("common.due"), cell: (r) => <span className="num whitespace-nowrap text-ink-2">{fmt.dateShort(r.wo.dueDate)}</span>, sortValue: (r) => r.wo.dueDate },
    { id: "status", header: t("common.status"), cell: (r) => <StatusBadge kind="wo" value={r.wo.status} />, sortValue: (r) => td(`wostatus.${r.wo.status}`), mobile: "badge", hideable: false },
  ];

  return (
    <Page>
      <PageHeader
        back={{ href: "/inventory", label: t("nav.inventory") }}
        eyebrow={
          <>
            <Code>{item.sku}</Code>
            <span>{td(`invcat.${item.category}`)}</span>
          </>
        }
        title={tl(item.name)}
        meta={<StatusBadge kind="stock" value={status} />}
        actions={
          <>
            {supplier && (
              <Link href={requestHref} className={linkButton}>
                <ShoppingCart aria-hidden className="size-3.5" />
                {t("inventory.detail.createRequest")}
              </Link>
            )}
            <Guard cap="inventory.manage">
              <Button icon={Pencil} onClick={() => setEditing(true)}>
                {t("common.edit")}
              </Button>
            </Guard>
            <Guard cap="inventory.adjust">
              <Button variant="primary" icon={SlidersHorizontal} onClick={() => setAdjusting(true)}>
                {t("inventory.adjustStock")}
              </Button>
            </Guard>
          </>
        }
      />

      {/* Stock overview */}
      <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line lg:grid-cols-[1.3fr_3fr]">
        <div className="bg-base px-4 py-3.5">
          <div className="label">{t("inventory.detail.onHand")}</div>
          <div className="mt-2 flex items-baseline gap-2">
            <QtyFlash itemId={item.id}>
              <span className="num display text-[38px] text-ink">{q.qty(item.quantity)}</span>
              <span className="text-[13px] text-ink-3">{item.unit}</span>
            </QtyFlash>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusBadge kind="stock" value={status} />
            <StockLevel item={item} />
          </div>
          <p className="mt-2 text-[11.5px] text-ink-3">{item.reorderLevel > 0 ? t("inventory.detail.levelHint") : t("inventory.detail.noReorderHint")}</p>
        </div>
        <KpiStrip columns={4} className="rounded-none border-0">
          <Kpi label={t("inventory.col.reorder")} value={item.reorderLevel} format={(n) => q.qty(Math.round(n * 100) / 100)} unit={item.unit} hint={item.reorderLevel > 0 ? t("inventory.detail.criticalAt", { qty: item.reorderLevel * 0.5, unit: item.unit }) : undefined} />
          <Kpi label={t("inventory.col.value")} value={stockValue(item)} format={(n) => fmt.money(n)} hint={t("inventory.detail.atCost", { cost: fmt.money(item.unitCost, 2), unit: item.unit })} />
          <Kpi
            label={t("inventory.detail.cover")}
            value={cover ?? 0}
            format={(n) => (cover === null ? "—" : fmt.num(n, n < 10 ? 1 : 0))}
            unit={cover === null ? undefined : t("common.days")}
            tone={cover !== null && supplier && cover < supplier.leadTimeDays ? "warn" : undefined}
            hint={cover === null ? t("inventory.detail.coverNone", { days: COVER_WINDOW_DAYS }) : t("inventory.detail.coverFormula", { days: COVER_WINDOW_DAYS, rate: Math.round(dailyUse * 100) / 100, unit: item.unit })}
          />
          <Kpi label={t("inventory.detail.onOrder")} value={onOrder} format={(n) => q.qty(Math.round(n * 100) / 100)} unit={item.unit} hint={t("inventory.detail.onOrderHint", { n: openPos.length, need: openNeed, unit: item.unit })} />
        </KpiStrip>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <ChartPanel
          className="xl:col-span-2"
          title={t("inventory.detail.history")}
          subtitle={t("inventory.detail.historyHint")}
          height={280}
          empty={history.length === 0}
          legend={
            <>
              <LegendItem color="var(--c1)" label={t("inventory.detail.balance", { unit: item.unit })} shape="line" />
              {item.reorderLevel > 0 && <LegendItem color="var(--amber)" label={t("inventory.detail.reorderLine", { qty: item.reorderLevel })} shape="dash" />}
            </>
          }
          table={{
            columns: [t("common.date"), t("inventory.col.balance")],
            rows: history.map((h) => [fmt.dateTime(h.at), h.balance]),
          }}
        >
          <AreaChart data={history} margin={cp.margin}>
            <CartesianGrid {...cp.grid} />
            <XAxis {...cp.xAxis} dataKey="at" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => fmt.dateShort(v)} />
            <YAxis {...cp.yAxis} domain={[yMin, yMax]} tickFormatter={(v: number) => fmt.compact(v)} />
            <Tooltip cursor={cp.cursor} content={<ChartTooltip formatLabel={(l) => fmt.dateTime(Number(l))} formatValue={(v) => q.qty(v)} unit={item.unit} />} />
            {item.reorderLevel > 0 && <ReferenceLine y={item.reorderLevel} stroke="var(--amber)" strokeDasharray="5 4" strokeWidth={1.25} ifOverflow="extendDomain" />}
            <Area {...cp.series} type="stepAfter" dataKey="balance" name={t("inventory.col.balance")} stroke="var(--c1)" strokeWidth={1.75} fill="var(--c1)" fillOpacity={0.12} dot={false} activeDot={{ r: 3 }} />
          </AreaChart>
        </ChartPanel>

        <div className="flex min-w-0 flex-col gap-4">
          {/* Supplier */}
          <Panel title={t("inventory.detail.supplier")}>
            {supplier ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <EntityLink entity={{ type: "supplier", id: supplier.id }} className="text-[14px] font-semibold">
                    {supplier.name}
                  </EntityLink>
                  <Badge tone={supplier.status === "preferred" ? "ok" : supplier.status === "approved" ? "info" : "warn"}>{td(`supstatus.${supplier.status}`)}</Badge>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  {tl(supplier.city)} · {tl(supplier.country)}
                </p>
                <DataList
                  className="mt-3.5"
                  items={[
                    { label: t("inventory.detail.leadTime"), value: <span className="num">{t("inventory.detail.nDays", { n: supplier.leadTimeDays })}</span> },
                    { label: t("inventory.detail.onTime"), value: <span className="num">{fmt.pct(supplier.onTimeRate / 100)}</span> },
                  ]}
                />
                <Link href={requestHref} className={`${linkButton} mt-4 w-full`}>
                  <ShoppingCart aria-hidden className="size-3.5" />
                  {t("inventory.detail.createRequest")}
                </Link>
              </>
            ) : (
              <div className="flex items-start gap-2.5 text-[12.5px] text-ink-2">
                <Factory aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
                <p>{product ? t("inventory.detail.inHouse", { product: product.name }) : t("inventory.detail.noSupplier")}</p>
              </div>
            )}
          </Panel>

          <ReorderEditor key={item.reorderLevel} item={item} />
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        {/* Location */}
        <Panel
          title={t("inventory.detail.location")}
          actions={
            warehouse && (
              <Link href={`/warehouse/${encodeURIComponent(warehouse.id)}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-2 hover:text-forge-text">
                {t("inventory.detail.openWarehouse")}
                <ArrowRight aria-hidden className="size-3.5 rtl:-scale-x-100" />
              </Link>
            )
          }
        >
          <DataList
            items={[
              {
                label: t("common.warehouse"),
                value: warehouse ? (
                  <EntityLink entity={{ type: "warehouse", id: warehouse.id }}>
                    <Code className="me-1.5">{warehouse.code}</Code>
                    {tl(warehouse.name)}
                  </EntityLink>
                ) : (
                  "—"
                ),
              },
              {
                label: t("common.zone"),
                value: zone ? (
                  <>
                    <Code className="me-1.5 font-semibold">{zone.code}</Code>
                    {tl(zone.name)}
                  </>
                ) : (
                  <Code>{item.zoneId}</Code>
                ),
              },
              { label: t("warehouse.inspector.kind"), value: zone ? td(`zonekind.${zone.kind}`) : "—" },
              { label: t("inventory.detail.pallets"), value: <span className="num">{t("inventory.detail.palletsValue", { n: palletsUsed(item), per: item.unitsPerPallet, unit: item.unit })}</span> },
            ]}
          />
          {warehouse && (
            <div className="mt-4">
              <ZoneMap warehouse={warehouse} zones={whZones} usage={usage} selectedId={item.zoneId} size="mini" />
              <p className="mt-1.5 text-[11.5px] text-ink-3">{t("inventory.detail.mapHint")}</p>
            </div>
          )}
        </Panel>

        {/* Open purchase orders */}
        <Panel title={t("inventory.detail.openPos")} subtitle={t("inventory.detail.openPosHint")} className="xl:col-span-2" flush>
          {openPos.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">{t("inventory.detail.noOpenPos")}</p>
          ) : (
            <ul className="divide-y divide-line/70">
              {openPos.map((po) => {
                const ln = po.lines.find((x) => x.itemId === item.id)!;
                return (
                  <li key={po.id} className="grid grid-cols-2 items-center gap-x-4 gap-y-1.5 px-4 py-2.5 sm:grid-cols-[110px_minmax(0,1fr)_auto_auto]">
                    <EntityLink entity={{ type: "po", id: po.id }} />
                    <span className="justify-self-end sm:order-last">
                      <StatusBadge kind="po" value={po.status} />
                    </span>
                    <span className="min-w-0 truncate text-[12.5px] text-ink-2">{look.supplier(po.supplierId)?.name ?? "—"}</span>
                    <span className="text-end text-[12.5px]">
                      <span className="num block text-ink">{t("inventory.detail.poQty", { received: ln.receivedQty, qty: ln.qty, unit: item.unit })}</span>
                      <span className="num block text-[11.5px] text-ink-3">{t("inventory.detail.expected", { when: fmt.relative(po.expectedDate, now) })}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <section className="flex min-w-0 flex-col gap-2.5">
        <SectionTitle hint={t("inventory.detail.relatedHint")}>{t("inventory.detail.related")}</SectionTitle>
        <DataTable rows={related} columns={woColumns} getRowId={(r) => r.wo.id} caption={t("inventory.detail.related")} pageSize={10} rowHref={(r) => `/work-orders/${encodeURIComponent(r.wo.id)}`} empty={{ title: t("inventory.detail.noRelated") }} />
      </section>

      <section className="flex min-w-0 flex-col gap-2.5">
        <SectionTitle hint={t("inventory.detail.movementsHint")}>{t("inventory.detail.movements")}</SectionTitle>
        <MovementsTable rows={movements} caption={t("inventory.detail.movements")} typeFilter emptyTitle={t("inventory.noMovements")} />
      </section>

      <ItemFormModal open={editing} item={item} onClose={() => setEditing(false)} />
      <AdjustStockModal item={adjusting ? item : null} onClose={() => setAdjusting(false)} />
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Reorder threshold editor                                            */
/* ------------------------------------------------------------------ */

function ReorderEditor({ item }: { item: InventoryItem }) {
  const { t } = useT();
  const run = useAction();
  const updateItem = useForge((s) => s.updateItem);
  const [value, setValue] = useState(String(item.reorderLevel));
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n) && n >= 0;
  const changed = valid && n !== item.reorderLevel;
  const before = stockStatus(item);
  const after = valid ? stockStatus({ quantity: item.quantity, reorderLevel: n }) : before;

  const save = () => {
    if (!changed) return;
    run(
      updateItem(item.id, { reorderLevel: n }),
      t("inventory.detail.reorderSaved", { sku: item.sku }),
      after !== before ? t("inventory.adjust.statusChanged", { from: `@stock.${before}`, to: `@stock.${after}` }) : undefined,
    );
  };

  return (
    <Panel title={t("inventory.detail.threshold")} subtitle={t("inventory.detail.thresholdHint")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex items-end gap-2"
      >
        <Field label={t("inventory.detail.thresholdLabel", { unit: item.unit })} error={valid ? null : t("err.nonNegative")} className="flex-1">
          {(p) => <Input {...p} type="number" inputMode="decimal" min={0} step="any" value={value} onChange={(e) => setValue(e.target.value)} />}
        </Field>
        <Guard cap="inventory.manage">
          <Button type="submit" variant={changed ? "primary" : "secondary"} disabled={!changed} className={valid ? undefined : "mb-[22px]"}>
            {t("common.save")}
          </Button>
        </Guard>
      </form>
      {changed && (
        <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2" aria-live="polite">
          {t("inventory.detail.thresholdPreview")}
          <Badge tone={STOCK_TONE[after]} dot>
            {t(`stock.${after}`)}
          </Badge>
        </p>
      )}
    </Panel>
  );
}
