"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { Plus } from "lucide-react";
import type { ID, InventoryItem } from "@/domain/types";
import { poValue, stockStatus, STOCK_RANK } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { useForge } from "@/store/store";
import { Code, DataList, Gauge, Panel, SimBadge, type Tone } from "@/components/ui/primitives";
import { EntityLink, EntityNotFound, Guard, Kpi, KpiStrip, Page, PageHeader } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status";
import { DataTable, type Column } from "@/components/table/DataTable";
import { ChartPanel, ChartTooltip, SERIES, useChartProps } from "@/components/charts/kit";
import { DemoNotice, SupplierStatusBadge } from "./parts";
import { PurchaseOrdersTable } from "./PurchaseOrdersTable";
import { poIsLate, poIsOpen } from "./logic";

const MONTHS_SHOWN = 6;
const rateTone = (v: number): Tone => (v >= 95 ? "ok" : v >= 90 ? "info" : "warn");

export function SupplierDetailView({ id }: { id: ID }) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const router = useRouter();
  const chart = useChartProps();
  const supplier = useForge((s) => s.suppliers.find((x) => x.id === id));
  const allOrders = useForge((s) => s.purchaseOrders);
  const allItems = useForge((s) => s.items);
  const now = useForge((s) => s.now);

  const orders = useMemo(() => allOrders.filter((po) => po.supplierId === id), [allOrders, id]);
  const items = useMemo(() => allItems.filter((i) => i.supplierId === id), [allItems, id]);

  const stats = useMemo(() => {
    const s = { total: 0, open: 0, openCount: 0, received: 0, onSchedule: 0, late: 0, cancelled: 0 };
    for (const po of orders) {
      if (po.status === "cancelled") {
        s.cancelled++;
        continue;
      }
      s.total += poValue(po);
      if (po.status === "received") s.received++;
      else if (poIsLate(po, now)) s.late++;
      else s.onSchedule++;
      if (poIsOpen(po)) {
        s.openCount++;
        s.open += poValue(po);
      }
    }
    return s;
  }, [orders, now]);

  // Month buckets end at the simulated "now"; the bucket only changes when the month does.
  const nowDate = new Date(now);
  const monthIndex = nowDate.getFullYear() * 12 + nowDate.getMonth();
  const spend = useMemo(() => {
    const label = new Intl.DateTimeFormat(fmt.locale, { month: "short", year: "2-digit" });
    const buckets = Array.from({ length: MONTHS_SHOWN }, (_, i) => {
      const m = monthIndex - (MONTHS_SHOWN - 1 - i);
      return { key: m, month: label.format(new Date(Math.floor(m / 12), m % 12, 1)), value: 0, orders: 0 };
    });
    for (const po of orders) {
      if (po.status === "cancelled") continue;
      const d = new Date(po.createdAt);
      const b = buckets.find((x) => x.key === d.getFullYear() * 12 + d.getMonth());
      if (b) {
        b.value += poValue(po);
        b.orders++;
      }
    }
    return buckets;
  }, [orders, monthIndex, fmt.locale]);

  if (!supplier) return <EntityNotFound backHref="/procurement?tab=suppliers" backLabel={t("nav.suppliers")} />;

  const itemColumns: Column<InventoryItem>[] = [
    {
      id: "sku",
      header: t("common.sku"),
      cell: (i) => <EntityLink entity={{ type: "item", id: i.id }} />,
      sortValue: (i) => i.sku,
      hideable: false,
      mobile: "title",
    },
    { id: "name", header: t("common.name"), cell: (i) => <span className="text-ink-2">{tl(i.name)}</span>, sortValue: (i) => tl(i.name), mobile: "subtitle" },
    { id: "category", header: t("common.category"), cell: (i) => td(`invcat.${i.category}`), sortValue: (i) => i.category },
    { id: "status", header: t("procurement.materials.stock"), cell: (i) => <StatusBadge kind="stock" value={stockStatus(i)} />, sortValue: (i) => STOCK_RANK[stockStatus(i)], mobile: "badge" },
    {
      id: "onHand",
      header: t("procurement.materials.onHand"),
      cell: (i) => (
        <span className="num whitespace-nowrap">
          {fmt.num(i.quantity)} <span className="text-[11.5px] text-ink-3">{i.unit}</span>
        </span>
      ),
      sortValue: (i) => i.quantity,
      align: "end",
    },
    { id: "reorder", header: t("procurement.materials.reorder"), cell: (i) => <span className="num text-ink-2">{fmt.num(i.reorderLevel)}</span>, sortValue: (i) => i.reorderLevel, align: "end" },
    { id: "cost", header: t("procurement.line.unitCost"), cell: (i) => <span className="num">{fmt.money(i.unitCost, 2)}</span>, sortValue: (i) => i.unitCost, align: "end" },
  ];

  const derived: [string, number, string][] = [
    [t("supplier.delivery.received"), stats.received, "text-ink"],
    [t("supplier.delivery.onSchedule"), stats.onSchedule, "text-ink"],
    [t("supplier.delivery.late"), stats.late, stats.late > 0 ? "text-danger" : "text-ink"],
    [t("supplier.delivery.cancelled"), stats.cancelled, "text-ink"],
  ];

  return (
    <Page>
      <PageHeader
        back={{ href: "/procurement?tab=suppliers", label: t("nav.suppliers") }}
        eyebrow={
          <>
            {t("entity.supplier")} <Code>{supplier.id}</Code>
          </>
        }
        title={supplier.name}
        meta={<SupplierStatusBadge status={supplier.status} />}
        subtitle={`${tl(supplier.city)}, ${tl(supplier.country)}`}
        actions={
          <Guard cap="po.manage">
            <Link
              href={`/procurement?new=1&supplier=${encodeURIComponent(supplier.id)}`}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-md border border-forge bg-forge px-3 text-[13px] font-semibold text-forge-ink hover:brightness-110"
            >
              <Plus aria-hidden className="size-3.5" strokeWidth={2.2} />
              {t("procurement.create")}
            </Link>
          </Guard>
        }
      />
      <DemoNotice />

      <KpiStrip columns={4}>
        <Kpi label={t("supplier.kpi.total")} value={stats.total} format={fmt.money} hint={t("supplier.kpi.totalHint", { n: orders.length - stats.cancelled })} />
        <Kpi label={t("supplier.kpi.open")} value={stats.open} format={fmt.money} hint={t("procurement.kpi.openHint", { n: stats.openCount })} />
        <Kpi label={t("supplier.kpi.materials")} value={items.length} format={fmt.num} hint={supplier.categories.map((c) => td(`invcat.${c}`)).join(" · ")} />
        <Kpi label={t("supplier.leadTime")} value={supplier.leadTimeDays} format={fmt.num} unit={t("common.days")} hint={supplier.paymentTerms} />
      </KpiStrip>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <Panel title={t("supplier.profile")}>
          <DataList
            items={[
              { label: t("common.name"), value: supplier.name },
              { label: t("common.id"), value: <Code>{supplier.id}</Code> },
              { label: t("common.status"), value: <SupplierStatusBadge status={supplier.status} /> },
              { label: t("supplier.country"), value: `${tl(supplier.city)}, ${tl(supplier.country)}` },
              { label: t("supplier.since"), value: <span className="num">{fmt.date(supplier.since)}</span> },
              { label: t("supplier.paymentTerms"), value: supplier.paymentTerms },
              { label: t("supplier.leadTime"), value: <span className="num">{t("supplier.days", { n: supplier.leadTimeDays })}</span> },
              { label: t("supplier.categories"), value: supplier.categories.map((c) => td(`invcat.${c}`)).join(" · ") },
            ]}
          />
        </Panel>

        <Panel title={t("supplier.contact")} actions={<SimBadge label={t("supplier.contact.fictional")} />}>
          <DataList
            columns={1}
            items={[
              { label: t("supplier.contact.name"), value: supplier.contactName },
              { label: t("supplier.contact.email"), value: <bdi className="code text-[12.5px]">{supplier.email}</bdi> },
              { label: t("supplier.contact.phone"), value: <bdi dir="ltr" className="num">{supplier.phone}</bdi> },
            ]}
          />
          <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">{t("supplier.contact.note")}</p>
        </Panel>

        <Panel title={t("supplier.delivery.title")} subtitle={t("supplier.delivery.subtitle")}>
          <div className="flex flex-wrap items-start gap-5">
            <div className="flex items-center gap-3">
              <Gauge value={supplier.onTimeRate / 100} tone={rateTone(supplier.onTimeRate)} size={88} label={`${t("supplier.onTime")}: ${fmt.pct(supplier.onTimeRate / 100)}`}>
                <span className="display num text-[17px] text-ink">{fmt.pct(supplier.onTimeRate / 100)}</span>
              </Gauge>
              <div className="max-w-[190px]">
                <div className="label">{t("supplier.onTime")}</div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{t("supplier.rating.seeded")}</p>
              </div>
            </div>
            <div className="min-w-[200px] flex-1">
              <div className="label">{t("supplier.delivery.derived")}</div>
              <dl className="mt-2 divide-y divide-line border-y border-line text-[12.5px]">
                {derived.map(([label, value, cls]) => (
                  <div key={label} className="flex items-center justify-between gap-3 py-1.5">
                    <dt className="text-ink-2">{label}</dt>
                    <dd className={`num font-semibold ${cls}`}>{fmt.num(value)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">{t("supplier.delivery.derivedNote")}</p>
            </div>
          </div>
        </Panel>

        <Panel title={t("supplier.quality.title")} subtitle={t("supplier.quality.subtitle")}>
          <div className="flex flex-wrap items-center gap-4">
            <Gauge value={supplier.qualityRate / 100} tone={rateTone(supplier.qualityRate)} size={88} label={`${t("supplier.quality")}: ${fmt.pct(supplier.qualityRate / 100)}`}>
              <span className="display num text-[17px] text-ink">{fmt.pct(supplier.qualityRate / 100)}</span>
            </Gauge>
            <div className="min-w-[200px] flex-1">
              <div className="label">{t("supplier.quality")}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{t("supplier.quality.explain", { accepted: fmt.pct(supplier.qualityRate / 100), rejected: fmt.pct(1 - supplier.qualityRate / 100) })}</p>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{t("supplier.rating.seeded")}</p>
            </div>
          </div>
        </Panel>
      </div>

      <ChartPanel
        title={t("supplier.spend.title")}
        subtitle={t("supplier.spend.subtitle", { n: MONTHS_SHOWN })}
        height={220}
        empty={spend.every((b) => b.value === 0)}
        table={{ columns: [t("supplier.spend.month"), t("supplier.spend.orders"), t("supplier.spend.value")], rows: spend.map((b) => [b.month, b.orders, fmt.money(b.value)]) }}
      >
        <BarChart data={spend} margin={chart.margin}>
          <CartesianGrid {...chart.grid} stroke="var(--line)" />
          <XAxis dataKey="month" {...chart.xAxis} tick={{ fill: "var(--ink-3)", fontSize: 11 }} />
          <YAxis {...chart.yAxis} width={52} tick={{ fill: "var(--ink-3)", fontSize: 11 }} tickFormatter={(v: number) => fmt.compactMoney(v)} />
          <Tooltip cursor={chart.barCursor} content={<ChartTooltip formatValue={(v) => fmt.money(v)} />} />
          <Bar dataKey="value" name={t("supplier.spend.value")} fill={SERIES[0]} maxBarSize={44} radius={[2, 2, 0, 0]} {...chart.series} />
        </BarChart>
      </ChartPanel>

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold text-ink">{t("supplier.materials")}</h2>
        <DataTable
          rows={items}
          columns={itemColumns}
          getRowId={(i) => i.id}
          caption={t("supplier.materials")}
          searchText={(i) => `${i.sku} ${i.name.en} ${i.name.ar}`}
          initialSort={{ id: "status", dir: "desc" }}
          rowHref={(i) => `/inventory/${i.id}`}
          empty={{ title: t("supplier.materials.empty") }}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold text-ink">{t("supplier.history")}</h2>
        <PurchaseOrdersTable supplierId={supplier.id} onOpen={(poId) => router.push(`/procurement?po=${encodeURIComponent(poId)}`)} />
      </section>
    </Page>
  );
}
