"use client";
/**
 * Shared building blocks for the Inventory and Warehouse modules:
 * category colours, stock level bar, quantity highlight, movement table.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { create } from "zustand";
import { motion } from "motion/react";
import type { ID, InventoryCategory, InventoryItem, MovementType, StockMovement, StockStatus } from "@/domain/types";
import { stockStatus, stockValue } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { useReducedMotion } from "@/store/prefs";
import type { AdjustReason } from "@/store/store";
import { SERIES } from "@/components/charts/kit";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Badge, Code, Progress, SegmentBar, Select, cn, type Tone } from "@/components/ui/primitives";
import { EntityLink, Member, useLookup } from "@/components/ui/page";
import { STOCK_TONE } from "@/components/ui/status";

export const CATEGORIES = ["raw", "component", "wip", "finished", "packaging", "spare"] as const satisfies readonly InventoryCategory[];
export const STOCK_STATUSES: StockStatus[] = ["healthy", "low", "critical", "out"];
export const MOVEMENT_TYPES: MovementType[] = ["receipt", "issue", "production", "adjustment", "count", "scrap", "transfer"];
export const ADJUST_REASONS: AdjustReason[] = ["count", "damage", "scrap", "return", "found", "correction", "pending_receipt"];

/** Category identity colours — fixed assignment, never by rank. */
export const CATEGORY_COLOR: Record<InventoryCategory, string> = {
  raw: SERIES[0],
  component: SERIES[1],
  wip: SERIES[2],
  finished: SERIES[3],
  packaging: SERIES[4],
  spare: SERIES[5],
};

export const MOVEMENT_TONE: Record<MovementType, Tone> = {
  receipt: "ok",
  production: "ok",
  issue: "info",
  adjustment: "neutral",
  count: "neutral",
  scrap: "warn",
  transfer: "neutral",
};

/** Link styled like a secondary button. */
export const linkButton =
  "inline-flex h-[34px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-line-2 bg-raised px-3 text-[13px] font-medium text-ink transition-colors hover:border-ink-3 hover:bg-panel";

/** Quantities can carry up to two decimals; whole numbers print without them. */
export function useQty() {
  const fmt = useFmt();
  return useMemo(
    () => ({
      qty: (n: number) => fmt.num(n, Number.isInteger(n) ? 0 : 2),
      signed: (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt.num(Math.abs(n), Number.isInteger(n) ? 0 : 2)}`,
    }),
    [fmt],
  );
}

export function SectionTitle({ children, hint, actions }: { children: ReactNode; hint?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1.5">
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold text-ink">{children}</h2>
        {hint && <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quantity highlight after a stock change                             */
/* ------------------------------------------------------------------ */

interface FlashState {
  itemId: ID | null;
  n: number;
  flash(itemId: ID): void;
}

/** UI-only signal: which item's quantity was just changed by the user. */
export const useStockFlash = create<FlashState>((set, get) => ({
  itemId: null,
  n: 0,
  flash: (itemId) => {
    const n = get().n + 1;
    set({ itemId, n });
    window.setTimeout(() => {
      if (get().n === n) set({ itemId: null });
    }, 2600);
  },
}));

/** Wraps a quantity; briefly highlights it after the user adjusts that item. */
export function QtyFlash({ itemId, children, className }: { itemId: ID; children: ReactNode; className?: string }) {
  const active = useStockFlash((s) => (s.itemId === itemId ? s.n : 0));
  const reduced = useReducedMotion();
  return (
    <span className={cn("relative -mx-1 inline-flex items-baseline gap-1 rounded-sm px-1", active > 0 && "outline outline-1 outline-forge/70", className)}>
      {active > 0 && !reduced && (
        <motion.span
          key={active}
          aria-hidden
          className="absolute inset-0 rounded-sm bg-forge/30"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: "easeOut" }}
        />
      )}
      <span className="relative inline-flex items-baseline gap-1">{children}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Stock level                                                         */
/* ------------------------------------------------------------------ */

/**
 * Compact stock-vs-reorder bar. The scale runs from 0 to 2× the reorder
 * level, so the marker in the middle is the reorder threshold.
 */
export function StockLevel({ item, className }: { item: Pick<InventoryItem, "quantity" | "reorderLevel">; className?: string }) {
  const { t } = useT();
  const fmt = useFmt();
  if (item.reorderLevel <= 0) return <span className="text-[12px] text-ink-3">{t("inventory.noReorder")}</span>;
  const ratio = item.quantity / item.reorderLevel;
  const label = fmt.pct(Math.max(0, ratio), 0);
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Progress value={ratio / 2} marker={0.5} tone={STOCK_TONE[stockStatus(item)]} label={t("inventory.levelAria", { pct: label })} className="w-16 shrink-0" />
      <span className="num w-10 text-start text-[11.5px] text-ink-3">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Value by category                                                   */
/* ------------------------------------------------------------------ */

export function CategoryValue({ items, className }: { items: InventoryItem[]; className?: string }) {
  const { td, t } = useT();
  const fmt = useFmt();
  const rows = useMemo(
    () =>
      CATEGORIES.map((c) => {
        const list = items.filter((i) => i.category === c);
        return { category: c, count: list.length, value: Math.round(list.reduce((s, i) => s + stockValue(i), 0)) };
      }),
    [items],
  );
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className={className}>
      <SegmentBar className="!h-3" segments={rows.map((r) => ({ value: r.value, color: CATEGORY_COLOR[r.category], label: td(`invcat.${r.category}`) }))} />
      <ul className="mt-3.5 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 2xl:grid-cols-6">
        {rows.map((r) => (
          <li key={r.category} className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 shrink-0 rounded-[1px]" style={{ background: CATEGORY_COLOR[r.category] }} />
              <span className="truncate text-[12px] text-ink-2">{td(`invcat.${r.category}`)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="num text-[14px] font-semibold text-ink">{fmt.compactMoney(r.value)}</span>
              <span className="num text-[11.5px] text-ink-3">{fmt.pct(total > 0 ? r.value / total : 0)}</span>
            </div>
            <div className="num text-[11.5px] text-ink-3">{t("inventory.nSkus", { n: r.count })}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Movements                                                           */
/* ------------------------------------------------------------------ */

/** Localised label for a stored movement reason ("count", "damage: note", free text). */
export function useReasonLabel() {
  const { t, td } = useT();
  return (reason: string | undefined): string => {
    if (!reason) return "";
    if (reason === "Opening balance") return t("inventory.reason.opening");
    const m = /^([a-z_]+)(?::\s*(.*))?$/.exec(reason);
    if (m && (ADJUST_REASONS as string[]).includes(m[1])) return m[2] ? `${td(`reason.${m[1]}`)} — ${m[2]}` : td(`reason.${m[1]}`);
    return reason;
  };
}

export function SignedQty({ value, unit }: { value: number; unit?: string }) {
  const q = useQty();
  return (
    <span className={cn("num whitespace-nowrap font-semibold", value > 0 ? "text-ok" : value < 0 ? "text-danger" : "text-ink-2")}>
      <bdi>{q.signed(value)}</bdi>
      {unit && <span className="ms-1 font-normal text-ink-3">{unit}</span>}
    </span>
  );
}

export function MovementsTable({
  rows,
  caption,
  showItem,
  typeFilter,
  pageSize = 10,
  emptyTitle,
}: {
  rows: StockMovement[];
  caption: string;
  /** Show the item column (warehouse-level history). */
  showItem?: boolean;
  typeFilter?: boolean;
  pageSize?: number;
  emptyTitle: string;
}) {
  const { t, td, tl } = useT();
  const fmt = useFmt();
  const q = useQty();
  const look = useLookup();
  const reasonLabel = useReasonLabel();
  const [type, setType] = useState<MovementType | "all">("all");
  const filtered = useMemo(() => (type === "all" ? rows : rows.filter((m) => m.type === type)), [rows, type]);

  const columns: Column<StockMovement>[] = [
    {
      id: "at",
      header: t("common.date"),
      cell: (m) => <span className="num whitespace-nowrap text-ink-2">{fmt.dateTime(m.at)}</span>,
      sortValue: (m) => m.at,
      mobile: "subtitle",
      hideable: false,
    },
    ...(showItem
      ? [
          {
            id: "item",
            header: t("inventory.col.item"),
            cell: (m: StockMovement) => {
              const item = look.item(m.itemId);
              return (
                <span className="flex min-w-0 flex-col">
                  <EntityLink entity={{ type: "item", id: m.itemId }} />
                  {item && <span className="truncate text-[12px] font-normal text-ink-3">{tl(item.name)}</span>}
                </span>
              );
            },
            sortValue: (m: StockMovement) => m.itemId,
            mobile: "title" as const,
            hideable: false,
          },
        ]
      : []),
    {
      id: "type",
      header: t("common.type"),
      cell: (m) => <Badge tone={MOVEMENT_TONE[m.type]}>{td(`mvtype.${m.type}`)}</Badge>,
      sortValue: (m) => td(`mvtype.${m.type}`),
      mobile: showItem ? "badge" : "title",
    },
    {
      id: "qty",
      header: t("common.quantity"),
      cell: (m) => <SignedQty value={m.qty} unit={look.item(m.itemId)?.unit} />,
      sortValue: (m) => m.qty,
      align: "end",
      mobile: showItem ? "meta" : "badge",
    },
    {
      id: "balance",
      header: t("inventory.col.balance"),
      cell: (m) => <span className="num">{q.qty(m.balance)}</span>,
      sortValue: (m) => m.balance,
      align: "end",
    },
    {
      id: "reason",
      header: t("inventory.col.reason"),
      cell: (m) => <span className="text-ink-2">{reasonLabel(m.reason) || <span className="text-ink-3">—</span>}</span>,
    },
    {
      id: "ref",
      header: t("inventory.col.reference"),
      cell: (m) => (m.ref ? <EntityLink entity={m.ref} /> : <span className="text-ink-3">—</span>),
    },
    {
      id: "by",
      header: t("inventory.col.by"),
      cell: (m) => <Member id={m.byId} size={20} />,
      sortValue: (m) => m.byId,
    },
  ];

  return (
    <DataTable
      rows={filtered}
      columns={columns}
      getRowId={(m) => m.id}
      caption={caption}
      initialSort={{ id: "at", dir: "desc" }}
      pageSize={pageSize}
      searchText={showItem ? (m) => `${m.itemId} ${look.item(m.itemId)?.name.en ?? ""} ${look.item(m.itemId)?.name.ar ?? ""} ${m.ref?.id ?? ""}` : undefined}
      searchPlaceholder={t("inventory.searchMovements")}
      filters={
        typeFilter ? (
          <Select aria-label={t("inventory.filter.movementType")} value={type} onChange={(e) => setType(e.target.value as MovementType | "all")}>
            <option value="all">{t("inventory.filter.allTypes")}</option>
            {MOVEMENT_TYPES.map((x) => (
              <option key={x} value={x}>
                {td(`mvtype.${x}`)}
              </option>
            ))}
          </Select>
        ) : undefined
      }
      activeFilters={type === "all" ? 0 : 1}
      onClearFilters={() => setType("all")}
      empty={{ title: emptyTitle }}
    />
  );
}

/** SKU code + localised name, linking to the item. */
export function ItemRef({ item, className }: { item: Pick<InventoryItem, "id" | "sku" | "name">; className?: string }) {
  const { tl } = useT();
  return (
    <Link href={`/inventory/${encodeURIComponent(item.id)}`} className={cn("group/item flex min-w-0 items-baseline gap-2 rounded-sm", className)}>
      <Code className="shrink-0 text-ink-2 group-hover/item:text-forge-text">{item.sku}</Code>
      <span className="truncate text-[12.5px] text-ink group-hover/item:text-forge-text">{tl(item.name)}</span>
    </Link>
  );
}
