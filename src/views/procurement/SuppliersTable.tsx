"use client";
import { useMemo, useState } from "react";
import type { InventoryCategory, Supplier } from "@/domain/types";
import { poValue } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { useForge } from "@/store/store";
import { Code, Select } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/table/DataTable";
import { SupplierStatusBadge } from "./parts";
import { poIsOpen } from "./logic";

interface Row {
  supplier: Supplier;
  openCount: number;
  openValue: number;
}

const STATUSES: Supplier["status"][] = ["preferred", "approved", "probation"];
const STATUS_RANK: Record<Supplier["status"], number> = { preferred: 0, approved: 1, probation: 2 };

export function SuppliersTable() {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const suppliers = useForge((s) => s.suppliers);
  const orders = useForge((s) => s.purchaseOrders);
  const [status, setStatus] = useState<Supplier["status"] | "">("");
  const [category, setCategory] = useState<InventoryCategory | "">("");

  const categories = useMemo(() => [...new Set(suppliers.flatMap((s) => s.categories))], [suppliers]);

  const rows = useMemo<Row[]>(
    () =>
      suppliers
        .filter((s) => (!status || s.status === status) && (!category || s.categories.includes(category)))
        .map((supplier) => {
          const open = orders.filter((po) => po.supplierId === supplier.id && poIsOpen(po));
          return { supplier, openCount: open.length, openValue: open.reduce((sum, po) => sum + poValue(po), 0) };
        }),
    [suppliers, orders, status, category],
  );

  const rate = (v: number) => <span className={v < 90 ? "num text-amber" : "num text-ink"}>{fmt.pct(v / 100)}</span>;

  const columns: Column<Row>[] = [
    {
      id: "name",
      header: t("common.supplier"),
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-ink">{r.supplier.name}</span>
          <Code className="text-[11px] text-ink-3">{r.supplier.id}</Code>
        </span>
      ),
      sortValue: (r) => r.supplier.name,
      hideable: false,
      mobile: "title",
    },
    {
      id: "country",
      header: t("supplier.country"),
      cell: (r) => (
        <span className="text-ink-2">
          {tl(r.supplier.city)}, {tl(r.supplier.country)}
        </span>
      ),
      sortValue: (r) => tl(r.supplier.country),
      mobile: "subtitle",
    },
    {
      id: "categories",
      header: t("supplier.categories"),
      cell: (r) => <span className="text-[12.5px] text-ink-2">{r.supplier.categories.map((c) => td(`invcat.${c}`)).join(" · ")}</span>,
    },
    {
      id: "status",
      header: t("common.status"),
      cell: (r) => <SupplierStatusBadge status={r.supplier.status} />,
      sortValue: (r) => STATUS_RANK[r.supplier.status],
      mobile: "badge",
    },
    { id: "onTime", header: t("supplier.onTime"), cell: (r) => rate(r.supplier.onTimeRate), sortValue: (r) => r.supplier.onTimeRate, align: "end" },
    { id: "quality", header: t("supplier.quality"), cell: (r) => rate(r.supplier.qualityRate), sortValue: (r) => r.supplier.qualityRate, align: "end" },
    {
      id: "lead",
      header: t("supplier.leadTime"),
      cell: (r) => <span className="num">{t("supplier.days", { n: r.supplier.leadTimeDays })}</span>,
      sortValue: (r) => r.supplier.leadTimeDays,
      align: "end",
    },
    {
      id: "open",
      header: t("supplier.openOrders"),
      cell: (r) =>
        r.openCount === 0 ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span className="num whitespace-nowrap">
            <span className="font-medium text-ink">{fmt.num(r.openCount)}</span>
            <span className="ms-1.5 text-ink-3">{fmt.money(r.openValue)}</span>
          </span>
        ),
      sortValue: (r) => r.openValue,
      align: "end",
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(r) => r.supplier.id}
      caption={t("procurement.tab.suppliers")}
      searchText={(r) => `${r.supplier.id} ${r.supplier.name} ${r.supplier.country.en} ${r.supplier.country.ar} ${r.supplier.city.en} ${r.supplier.city.ar}`}
      searchPlaceholder={t("supplier.search")}
      filters={
        <>
          <Select aria-label={t("common.status")} value={status} onChange={(e) => setStatus(e.target.value as Supplier["status"] | "")}>
            <option value="">{t("procurement.filter.allStatuses")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`supstatus.${s}`)}
              </option>
            ))}
          </Select>
          <Select aria-label={t("common.category")} value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory | "")}>
            <option value="">{t("supplier.allCategories")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {td(`invcat.${c}`)}
              </option>
            ))}
          </Select>
        </>
      }
      activeFilters={(status ? 1 : 0) + (category ? 1 : 0)}
      onClearFilters={() => {
        setStatus("");
        setCategory("");
      }}
      initialSort={{ id: "name", dir: "asc" }}
      rowHref={(r) => `/suppliers/${r.supplier.id}`}
      empty={{ title: t("supplier.empty") }}
    />
  );
}
