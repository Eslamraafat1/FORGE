"use client";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { ID, InventoryItem, StockStatus } from "@/domain/types";
import { STOCK_RANK, stockStatus } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { useForge } from "@/store/store";
import { Select } from "@/components/ui/primitives";
import { EntityLink, useLookup } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status";
import { DataTable, type Column } from "@/components/table/DataTable";
import { GuardedButton } from "./parts";
import { onOrderByItem, suggestedOrderQty } from "./logic";

interface Row {
  item: InventoryItem;
  status: StockStatus;
  onOrder: number;
  suggested: number;
  supplierName: string;
}

/** Purchased items at or below their reorder level, with a transparent suggested quantity. */
export function useMaterialsNeeded(): Row[] {
  const items = useForge((s) => s.items);
  const orders = useForge((s) => s.purchaseOrders);
  const lookup = useLookup();
  return useMemo(() => {
    const onOrder = onOrderByItem(orders);
    return items
      .filter((i) => i.supplierId && stockStatus(i) !== "healthy")
      .map((item) => {
        const oo = onOrder.get(item.id) ?? 0;
        return { item, status: stockStatus(item), onOrder: oo, suggested: suggestedOrderQty(item, oo), supplierName: lookup.supplier(item.supplierId)?.name ?? "—" };
      });
  }, [items, orders, lookup]);
}

export function RequestedMaterials({ rows, onCreate }: { rows: Row[]; onCreate: (itemId: ID) => void }) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const suppliers = useForge((s) => s.suppliers);
  const [supplier, setSupplier] = useState<ID | "">("");
  const shown = useMemo(() => (supplier ? rows.filter((r) => r.item.supplierId === supplier) : rows), [rows, supplier]);
  const supplierIds = useMemo(() => new Set(rows.map((r) => r.item.supplierId)), [rows]);
  const qty = (n: number, unit: string, cls = "text-ink") => (
    <span className={`num whitespace-nowrap ${cls}`}>
      {fmt.num(n)} <span className="text-[11.5px] text-ink-3">{unit}</span>
    </span>
  );

  const columns: Column<Row>[] = [
    {
      id: "item",
      header: t("procurement.materials.item"),
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <EntityLink entity={{ type: "item", id: r.item.id }} className="self-start" />
          <span className="truncate text-[12.5px] font-normal text-ink-2">{tl(r.item.name)}</span>
        </span>
      ),
      sortValue: (r) => r.item.sku,
      hideable: false,
      mobile: "title",
    },
    {
      id: "supplier",
      header: t("common.supplier"),
      cell: (r) => (r.item.supplierId ? <EntityLink entity={{ type: "supplier", id: r.item.supplierId }}>{r.supplierName}</EntityLink> : "—"),
      sortValue: (r) => r.supplierName,
      mobile: "subtitle",
    },
    {
      id: "status",
      header: t("procurement.materials.stock"),
      cell: (r) => <StatusBadge kind="stock" value={r.status} />,
      sortValue: (r) => STOCK_RANK[r.status],
      mobile: "badge",
    },
    { id: "onHand", header: t("procurement.materials.onHand"), cell: (r) => qty(r.item.quantity, r.item.unit), sortValue: (r) => r.item.quantity, align: "end" },
    { id: "reorder", header: t("procurement.materials.reorder"), cell: (r) => qty(r.item.reorderLevel, r.item.unit, "text-ink-2"), sortValue: (r) => r.item.reorderLevel, align: "end" },
    {
      id: "onOrder",
      header: t("procurement.materials.onOrder"),
      cell: (r) => (r.onOrder > 0 ? qty(r.onOrder, r.item.unit) : <span className="text-ink-3">—</span>),
      sortValue: (r) => r.onOrder,
      align: "end",
    },
    {
      id: "suggested",
      header: t("procurement.materials.suggested"),
      cell: (r) => (r.suggested > 0 ? qty(r.suggested, r.item.unit, "font-semibold text-ink") : <span className="text-[12px] text-ink-3">{t("procurement.materials.covered")}</span>),
      sortValue: (r) => r.suggested,
      align: "end",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-md border border-line bg-base px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
        <span className="label me-2">{t("common.demoCalc")}</span>
        {t("procurement.materials.rule")}
      </p>
      <DataTable
        rows={shown}
        columns={columns}
        getRowId={(r) => r.item.id}
        caption={t("procurement.tab.materials")}
        searchText={(r) => `${r.item.sku} ${r.item.name.en} ${r.item.name.ar} ${r.supplierName}`}
        searchPlaceholder={t("procurement.materials.search")}
        filters={
          <Select aria-label={t("common.supplier")} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="">{t("procurement.filter.allSuppliers")}</option>
            {suppliers
              .filter((s) => supplierIds.has(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
        }
        activeFilters={supplier ? 1 : 0}
        onClearFilters={() => setSupplier("")}
        initialSort={{ id: "status", dir: "desc" }}
        rowActions={(r) => (
          <GuardedButton cap="po.manage" size="sm" icon={Plus} aria-label={t("procurement.materials.createFor", { sku: r.item.sku })} onClick={() => onCreate(r.item.id)}>
            <span className="hidden sm:inline">{t("procurement.materials.create")}</span>
          </GuardedButton>
        )}
        empty={{ title: t("procurement.materials.empty"), hint: t("procurement.materials.emptyHint") }}
      />
    </div>
  );
}
