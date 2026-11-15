"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, Eye, MoreHorizontal, Pencil, Plus, SlidersHorizontal } from "lucide-react";
import type { ID, InventoryCategory, InventoryItem, StockStatus } from "@/domain/types";
import { STOCK_RANK, stockStatus, stockValue } from "@/domain/rules";
import { useT } from "@/i18n";
import { downloadCsv } from "@/lib/csv";
import { useFmt } from "@/lib/format";
import { useRouter } from "next/navigation";
import { inventorySummary } from "@/store/selectors";
import { useForge } from "@/store/store";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Menu } from "@/components/ui/overlay";
import { Guard, Page, PageHeader, useCan, useLookup } from "@/components/ui/page";
import { Button, Code, CountUp, IconButton, Panel, Select, Tabs, cn, toneText } from "@/components/ui/primitives";
import { STOCK_TONE, StatusBadge } from "@/components/ui/status";
import { AdjustStockModal } from "./AdjustStockModal";
import { ItemFormModal } from "./ItemFormModal";
import { CATEGORIES, CategoryValue, QtyFlash, STOCK_STATUSES, StockLevel, useQty } from "./shared";

type CategoryFilter = InventoryCategory | "all";
type StatusFilter = StockStatus | "attention" | "all";

export function InventoryView() {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const q = useQty();
  const router = useRouter();
  const look = useLookup();
  const items = useForge((s) => s.items);
  const warehouses = useForge((s) => s.warehouses);
  const canManage = useCan("inventory.manage");
  const canAdjust = useCan("inventory.adjust");

  const [category, setCategory] = useState<CategoryFilter>("all");
  const [warehouse, setWarehouse] = useState<ID | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [adjustId, setAdjustId] = useState<ID | null>(null);
  const [editId, setEditId] = useState<ID | null>(null);
  const [adding, setAdding] = useState(false);

  const summary = useMemo(() => inventorySummary(items), [items]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const i of items) c[i.category] = (c[i.category] ?? 0) + 1;
    return c;
  }, [items]);

  const rows = useMemo(
    () =>
      items.filter((i) => {
        if (category !== "all" && i.category !== category) return false;
        if (warehouse !== "all" && i.warehouseId !== warehouse) return false;
        if (status === "all") return true;
        const st = stockStatus(i);
        return status === "attention" ? st !== "healthy" : st === status;
      }),
    [items, category, warehouse, status],
  );
  const activeFilters = (category !== "all" ? 1 : 0) + (warehouse !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0);
  const clearFilters = () => {
    setCategory("all");
    setWarehouse("all");
    setStatus("all");
  };

  const adjustItem = adjustId ? (items.find((i) => i.id === adjustId) ?? null) : null;
  const editItem = editId ? (items.find((i) => i.id === editId) ?? null) : null;

  const exportCsv = (list: InventoryItem[]) =>
    downloadCsv(
      "forge-inventory",
      [t("common.sku"), t("inventory.col.item"), t("common.category"), t("common.quantity"), t("common.unit"), t("common.warehouse"), t("common.zone"), t("inventory.col.reorder"), t("inventory.col.unitCost"), t("inventory.col.value"), t("common.status")],
      list.map((i) => [i.sku, tl(i.name), td(`invcat.${i.category}`), i.quantity, i.unit, look.warehouse(i.warehouseId)?.code ?? i.warehouseId, i.zoneId, i.reorderLevel, i.unitCost, Math.round(stockValue(i) * 100) / 100, td(`stock.${stockStatus(i)}`)]),
    );

  const columns: Column<InventoryItem>[] = [
    { id: "sku", header: t("common.sku"), cell: (i) => <Code className="text-ink-2">{i.sku}</Code>, sortValue: (i) => i.sku, mobile: "subtitle", hideable: false, width: "110px" },
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
    { id: "category", header: t("common.category"), cell: (i) => <span className="whitespace-nowrap text-ink-2">{td(`invcat.${i.category}`)}</span>, sortValue: (i) => td(`invcat.${i.category}`), mobile: "hidden" },
    {
      id: "quantity",
      header: t("common.quantity"),
      cell: (i) => (
        <QtyFlash itemId={i.id}>
          <span className="num font-semibold text-ink">{q.qty(i.quantity)}</span>
          <span className="text-[11.5px] font-normal text-ink-3 md:hidden">{i.unit}</span>
        </QtyFlash>
      ),
      sortValue: (i) => i.quantity,
      align: "end",
    },
    { id: "unit", header: t("common.unit"), cell: (i) => <span className="text-ink-3">{i.unit}</span>, mobile: "hidden", width: "64px" },
    {
      id: "warehouse",
      header: t("common.warehouse"),
      cell: (i) => (
        <span className="whitespace-nowrap">
          <Code className="text-ink-2">{look.warehouse(i.warehouseId)?.code ?? i.warehouseId}</Code>
          <span className="text-ink-3"> · </span>
          <Code className="text-ink-3">{i.zoneId}</Code>
        </span>
      ),
      sortValue: (i) => `${i.warehouseId} ${i.zoneId}`,
    },
    { id: "reorder", header: t("inventory.col.reorder"), cell: (i) => (i.reorderLevel > 0 ? <span className="num text-ink-2">{q.qty(i.reorderLevel)}</span> : <span className="text-ink-3">—</span>), sortValue: (i) => i.reorderLevel, align: "end" },
    { id: "level", header: t("inventory.col.level"), cell: (i) => <StockLevel item={i} />, sortValue: (i) => (i.reorderLevel > 0 ? i.quantity / i.reorderLevel : Number.MAX_SAFE_INTEGER) },
    { id: "unitCost", header: t("inventory.col.unitCost"), cell: (i) => <span className="num text-ink-2">{fmt.money(i.unitCost, 2)}</span>, sortValue: (i) => i.unitCost, align: "end", mobile: "hidden", defaultHidden: false },
    { id: "value", header: t("inventory.col.value"), cell: (i) => <span className="num">{fmt.money(stockValue(i))}</span>, sortValue: (i) => stockValue(i), align: "end" },
    { id: "status", header: t("common.status"), cell: (i) => <StatusBadge kind="stock" value={stockStatus(i)} />, sortValue: (i) => STOCK_RANK[stockStatus(i)], mobile: "badge", hideable: false },
  ];

  const attention: { key: StockStatus; n: number }[] = [
    { key: "low", n: summary.low },
    { key: "critical", n: summary.critical },
    { key: "out", n: summary.out },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow={t("inventory.eyebrow")}
        title={t("nav.inventory")}
        subtitle={t("inventory.subtitle")}
        actions={
          <>
            <Button icon={Download} onClick={() => exportCsv(rows)}>
              {t("common.exportCsv")}
            </Button>
            <Guard cap="inventory.manage">
              <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                {t("inventory.addItem")}
              </Button>
            </Guard>
          </>
        }
      />

      {/* Summary band */}
      <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-[1fr_0.7fr_1.5fr]">
        <div className="bg-base px-4 py-3.5">
          <div className="label">{t("inventory.totalValue")}</div>
          <CountUp value={summary.value} format={(n) => fmt.money(n)} className="display mt-2 block text-[30px] text-ink" />
          <p className="mt-1.5 text-[11.5px] text-ink-3">{t("inventory.totalValueHint")}</p>
        </div>
        <div className="bg-base px-4 py-3.5">
          <div className="label">{t("inventory.skuCount")}</div>
          <CountUp value={summary.count} format={(n) => fmt.num(Math.round(n))} className="display mt-2 block text-[30px] text-ink" />
          <p className="mt-1.5 text-[11.5px] text-ink-3">{t("inventory.skuCountHint", { n: warehouses.length })}</p>
        </div>
        <div className="bg-base px-4 py-3.5 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <span className="label">{t("inventory.needsAttention")}</span>
            <button type="button" onClick={() => setStatus(status === "attention" ? "all" : "attention")} aria-pressed={status === "attention"} className="rounded-sm text-[11.5px] font-medium text-ink-2 underline decoration-line-2 decoration-dotted underline-offset-[3px] hover:text-forge-text">
              {t("inventory.showAttention", { n: summary.attention })}
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {attention.map((a) => {
              const active = status === a.key;
              return (
                <button
                  key={a.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatus(active ? "all" : a.key)}
                  className={cn("min-w-0 rounded-md border px-2.5 py-2 text-start transition-colors", active ? "border-forge bg-forge/10" : "border-line hover:border-line-2 hover:bg-raised")}
                >
                  <span className={cn("num display block text-[26px]", a.n > 0 ? toneText[STOCK_TONE[a.key]] : "text-ink-3")}>{fmt.num(a.n)}</span>
                  <span className="mt-1 block truncate text-[11.5px] text-ink-2">{td(`stock.${a.key}`)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Panel title={t("inventory.valueByCategory")} subtitle={t("inventory.valueByCategoryHint")}>
        <CategoryValue items={items} />
      </Panel>

      <div className="flex flex-col gap-0">
        <Tabs<CategoryFilter>
          label={t("common.category")}
          value={category}
          onChange={setCategory}
          className="px-1"
          tabs={[{ value: "all", label: t("common.all"), count: counts.all }, ...CATEGORIES.map((c) => ({ value: c as CategoryFilter, label: td(`invcat.${c}`), count: counts[c] ?? 0 }))]}
        />
        <DataTable
          className="mt-3"
          rows={rows}
          columns={columns}
          getRowId={(i) => i.id}
          caption={t("inventory.tableCaption")}
          searchText={(i) => `${i.sku} ${i.name.en} ${i.name.ar} ${i.zoneId} ${i.warehouseId}`}
          searchPlaceholder={t("inventory.search")}
          initialSort={{ id: "status", dir: "desc" }}
          pageSize={20}
          selectable
          rowHref={(i) => `/inventory/${encodeURIComponent(i.id)}`}
          activeFilters={activeFilters}
          onClearFilters={clearFilters}
          filters={
            <>
              <Select aria-label={t("common.category")} value={category} onChange={(e) => setCategory(e.target.value as CategoryFilter)}>
                <option value="all">{t("inventory.filter.allCategories")}</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {td(`invcat.${c}`)}
                  </option>
                ))}
              </Select>
              <Select aria-label={t("common.warehouse")} value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
                <option value="all">{t("inventory.filter.allWarehouses")}</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {tl(w.name)}
                  </option>
                ))}
              </Select>
              <Select aria-label={t("inventory.filter.stockStatus")} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                <option value="all">{t("inventory.filter.allStatuses")}</option>
                <option value="attention">{t("inventory.needsAttention")}</option>
                {STOCK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {td(`stock.${s}`)}
                  </option>
                ))}
              </Select>
            </>
          }
          bulkActions={(selected, clear) => (
            <Button
              size="sm"
              icon={Download}
              onClick={() => {
                exportCsv(selected);
                clear();
              }}
            >
              {t("inventory.exportSelected")}
            </Button>
          )}
          rowActions={(i) => (
            <Menu
              label={t("common.actions")}
              trigger={(p) => <IconButton icon={MoreHorizontal} label={t("common.more")} size="sm" tooltipSide="top" {...p} />}
              items={[
                { label: t("inventory.adjustStock"), icon: SlidersHorizontal, onSelect: () => setAdjustId(i.id), disabled: !canAdjust, hint: canAdjust ? undefined : t("inventory.roleLocked") },
                { label: t("inventory.editItem"), icon: Pencil, onSelect: () => setEditId(i.id), disabled: !canManage, hint: canManage ? undefined : t("inventory.roleLocked") },
                null,
                { label: t("inventory.openItem"), icon: Eye, onSelect: () => router.push(`/inventory/${encodeURIComponent(i.id)}`) },
              ]}
            />
          )}
          empty={{ title: t("inventory.empty"), hint: t("inventory.emptyHint") }}
        />
      </div>

      <ItemFormModal open={adding} onClose={() => setAdding(false)} />
      <ItemFormModal open={!!editItem} item={editItem} onClose={() => setEditId(null)} />
      <AdjustStockModal item={adjustItem} onClose={() => setAdjustId(null)} />
    </Page>
  );
}
