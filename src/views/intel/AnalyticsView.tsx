"use client";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { RotateCcw, X } from "lucide-react";
import type { InventoryCategory } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { startOfDay } from "@/lib/time";
import { useForge } from "@/store/store";
import { Page, PageHeader } from "@/components/ui/page";
import { Button, Segmented, Select, SimBadge, Tabs } from "@/components/ui/primitives";
import { DEFAULT_FILTERS, buildScope, type AnalyticsFilters, type RangeDays } from "./analytics-model";
import { InventorySection, OeeSection, QualitySection } from "./analytics-insight";
import { DowntimeSection, ProductionSection } from "./analytics-production";
import { INV_CATS } from "./shared";

type Section = "production" | "downtime" | "quality" | "inventory" | "oee";
const RANGES: RangeDays[] = [7, 14, 30, 60];

export function AnalyticsView() {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const now = useForge((s) => s.now);
  const lines = useForge((s) => s.lines);
  const factories = useForge((s) => s.factories);
  const products = useForge((s) => s.products);
  const dailyStats = useForge((s) => s.dailyStats);
  const downtimeEvents = useForge((s) => s.downtimeEvents);
  const inspections = useForge((s) => s.inspections);
  const workOrders = useForge((s) => s.workOrders);
  const items = useForge((s) => s.items);
  const warehouses = useForge((s) => s.warehouses);
  const zones = useForge((s) => s.zones);
  const shipments = useForge((s) => s.shipments);
  const movements = useForge((s) => s.movements);

  const [filters, setFilters] = useState<AnalyticsFilters>(DEFAULT_FILTERS);
  const [section, setSection] = useState<Section>("production");
  const set = (patch: Partial<AnalyticsFilters>) => setFilters((f) => ({ ...f, ...patch }));

  // History only changes when the simulated day rolls over, so key the scope on the day, not the minute.
  const today = startOfDay(now);
  const scope = useMemo(
    () => buildScope({ filters, now: today, lines, dailyStats, downtimeEvents, inspections, workOrders, items, warehouses }),
    [filters, today, lines, dailyStats, downtimeEvents, inspections, workOrders, items, warehouses],
  );

  const lineOptions = lines.filter((l) => !filters.factoryId || l.factoryId === filters.factoryId);
  const factory = factories.find((f) => f.id === filters.factoryId);
  const line = lines.find((l) => l.id === filters.lineId);
  const product = products.find((p) => p.id === filters.productId);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (factory) chips.push({ key: "factory", label: `${t("common.factory")}: ${tl(factory.name)}`, clear: () => set({ factoryId: "" }) });
  if (line) chips.push({ key: "line", label: `${t("common.line")}: ${line.code} · ${tl(line.name)}`, clear: () => set({ lineId: "" }) });
  if (product) chips.push({ key: "product", label: `${t("common.product")}: ${tl(product.name)}`, clear: () => set({ productId: "" }) });
  if (filters.invCategory) chips.push({ key: "cat", label: `${t("analytics.filter.invCategory")}: ${td(`invcat.${filters.invCategory}`)}`, clear: () => set({ invCategory: "" }) });
  const dirty = chips.length > 0 || filters.days !== DEFAULT_FILTERS.days;

  return (
    <Page>
      <PageHeader eyebrow={t("analytics.eyebrow")} title={t("nav.analytics")} subtitle={t("analytics.subtitle")} meta={<SimBadge />} />

      <section aria-label={t("common.filters")} className="panel p-3">
        <div className="grid grid-cols-2 items-end gap-x-3 gap-y-2.5 md:flex md:flex-wrap">
          <FilterSlot label={t("common.dateRange")} className="col-span-2">
            <Segmented label={t("common.dateRange")} value={String(filters.days)} onChange={(v) => set({ days: Number(v) as RangeDays })} options={RANGES.map((d) => ({ value: String(d), label: t(`common.range.${d}d`) }))} />
          </FilterSlot>
          <FilterSlot label={t("common.factory")}>
            <Select
              aria-label={t("common.factory")}
              value={filters.factoryId}
              onChange={(e) => {
                const factoryId = e.target.value;
                // The line list depends on the factory: drop a line that is not in the new factory.
                const keep = !factoryId || lines.some((l) => l.id === filters.lineId && l.factoryId === factoryId);
                set({ factoryId, lineId: keep ? filters.lineId : "" });
              }}
            >
              <option value="">{t("analytics.filter.allFactories")}</option>
              {factories.map((f) => (
                <option key={f.id} value={f.id}>
                  {tl(f.name)}
                </option>
              ))}
            </Select>
          </FilterSlot>
          <FilterSlot label={t("common.line")}>
            <Select aria-label={t("common.line")} value={filters.lineId} onChange={(e) => set({ lineId: e.target.value })}>
              <option value="">{t("analytics.filter.allLines")}</option>
              {lineOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {`${l.code} · ${tl(l.name)}`}
                </option>
              ))}
            </Select>
          </FilterSlot>
          <FilterSlot label={t("common.product")}>
            <Select aria-label={t("common.product")} value={filters.productId} onChange={(e) => set({ productId: e.target.value })}>
              <option value="">{t("analytics.filter.allProducts")}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {tl(p.name)}
                </option>
              ))}
            </Select>
          </FilterSlot>
          <FilterSlot label={t("analytics.filter.invCategory")}>
            <Select aria-label={t("analytics.filter.invCategory")} value={filters.invCategory} onChange={(e) => set({ invCategory: e.target.value as InventoryCategory | "" })}>
              <option value="">{t("analytics.filter.allCategories")}</option>
              {INV_CATS.map((c) => (
                <option key={c} value={c}>
                  {td(`invcat.${c}`)}
                </option>
              ))}
            </Select>
          </FilterSlot>
          <Button variant="ghost" icon={RotateCcw} disabled={!dirty} onClick={() => setFilters(DEFAULT_FILTERS)} className="col-span-2 md:ms-auto">
            {t("common.reset")}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-2.5 text-[12px] text-ink-3">
          <span className="num">
            {t("analytics.filter.window", { from: fmt.dateShort(scope.from), to: fmt.date(scope.to), days: filters.days })}
            {" · "}
            {scope.prev ? t("analytics.filter.compared", { days: filters.days }) : t("analytics.filter.noPrev")}
          </span>
          {chips.length === 0 ? (
            <span>{t("analytics.filter.none")}</span>
          ) : (
            <ul className="flex flex-wrap items-center gap-1.5" aria-label={t("analytics.filter.active")}>
              {chips.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={c.clear}
                    aria-label={t("analytics.filter.remove", { filter: c.label })}
                    className="inline-flex h-6 items-center gap-1 rounded-sm border border-line-2 bg-raised px-1.5 text-[11.5px] font-medium text-ink hover:border-ink-3"
                  >
                    {c.label}
                    <X aria-hidden className="size-3 text-ink-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Tabs
        label={t("analytics.sections")}
        value={section}
        onChange={setSection}
        tabs={[
          { value: "production", label: t("analytics.tab.production") },
          { value: "downtime", label: t("analytics.tab.downtime") },
          { value: "quality", label: t("analytics.tab.quality") },
          { value: "inventory", label: t("analytics.tab.inventory") },
          { value: "oee", label: t("analytics.tab.oee") },
        ]}
      />

      <div role="tabpanel" aria-label={t(`analytics.tab.${section}`)} key={section} className="animate-fade">
        {section === "production" && <ProductionSection scope={scope} />}
        {section === "downtime" && <DowntimeSection scope={scope} />}
        {section === "quality" && <QualitySection scope={scope} />}
        {section === "inventory" && <InventorySection scope={scope} movements={movements} zones={zones} shipments={shipments} now={now} />}
        {section === "oee" && <OeeSection scope={scope} />}
      </div>

      <p className="text-[11.5px] leading-relaxed text-ink-3">{t("analytics.disclaimer")}</p>
    </Page>
  );
}

function FilterSlot({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 md:min-w-[150px] ${className ?? ""}`}>
      <span aria-hidden className="label">
        {label}
      </span>
      {children}
    </div>
  );
}
