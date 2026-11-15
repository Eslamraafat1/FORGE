"use client";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import type { ID, PurchaseOrder, PurchaseOrderStatus } from "@/domain/types";
import { poReceivedRatio, poValue } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { useForge } from "@/store/store";
import { Badge, Code, Progress, Select } from "@/components/ui/primitives";
import { EntityLink, Member, useLookup } from "@/components/ui/page";
import { StatusBadge } from "@/components/ui/status";
import { DataTable, type Column } from "@/components/table/DataTable";
import { PO_STATUSES, poDaysLate } from "./logic";

interface Row {
  po: PurchaseOrder;
  supplierName: string;
  firstItem: string;
  value: number;
  ratio: number;
  daysLate: number;
  search: string;
}

/** Expected delivery date with its delivery state (late is flagged with text + icon, not colour alone). */
export function DeliveryCell({ po, daysLate }: { po: PurchaseOrder; daysLate: number }) {
  const { t } = useT();
  const fmt = useFmt();
  const now = useForge((s) => s.now);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="num whitespace-nowrap">{fmt.date(po.expectedDate)}</span>
      {daysLate > 0 ? (
        <Badge tone="danger" icon={AlertTriangle}>
          {t("procurement.delivery.late", { n: daysLate })}
        </Badge>
      ) : po.status === "received" ? (
        <span className="text-[11.5px] text-ink-3">{t("procurement.delivery.received")}</span>
      ) : po.status === "cancelled" ? (
        <span className="text-[11.5px] text-ink-3">{t("procurement.delivery.cancelled")}</span>
      ) : (
        <span className="text-[11.5px] text-ink-3">{fmt.relative(po.expectedDate, now)}</span>
      )}
    </span>
  );
}

export function PurchaseOrdersTable({
  onOpen,
  activeId,
  toolbarEnd,
  supplierId,
}: {
  onOpen: (id: ID) => void;
  activeId?: ID | null;
  toolbarEnd?: ReactNode;
  /** Restrict to one supplier (hides the supplier column and filter). */
  supplierId?: ID;
}) {
  const { t, tl } = useT();
  const fmt = useFmt();
  const orders = useForge((s) => s.purchaseOrders);
  const suppliers = useForge((s) => s.suppliers);
  const now = useForge((s) => s.now);
  const lookup = useLookup();
  const [status, setStatus] = useState<PurchaseOrderStatus | "">("");
  const [supplier, setSupplier] = useState<ID | "">("");
  const [delivery, setDelivery] = useState<"" | "late">("");

  const rows = useMemo<Row[]>(() => {
    return orders
      .filter((po) => (!supplierId || po.supplierId === supplierId) && (!status || po.status === status) && (!supplier || po.supplierId === supplier))
      .map((po) => {
        const supplierName = lookup.supplier(po.supplierId)?.name ?? po.supplierId;
        const first = lookup.item(po.lines[0]?.itemId);
        const names = po.lines.map((ln) => {
          const it = lookup.item(ln.itemId);
          return it ? `${it.sku} ${it.name.en} ${it.name.ar}` : ln.itemId;
        });
        return {
          po,
          supplierName,
          firstItem: first ? tl(first.name) : (po.lines[0]?.itemId ?? "—"),
          value: poValue(po),
          ratio: poReceivedRatio(po),
          daysLate: poDaysLate(po, now),
          search: `${po.id} ${supplierName} ${names.join(" ")}`,
        };
      })
      .filter((r) => delivery !== "late" || r.daysLate > 0);
  }, [orders, supplierId, status, supplier, delivery, lookup, now, tl]);

  const columns: Column<Row>[] = [
    {
      id: "id",
      header: t("procurement.col.po"),
      cell: (r) => <Code className="font-semibold text-ink">{r.po.id}</Code>,
      sortValue: (r) => r.po.id,
      hideable: false,
      mobile: "title",
    },
    ...(supplierId
      ? []
      : [
          {
            id: "supplier",
            header: t("common.supplier"),
            cell: (r) => <EntityLink entity={{ type: "supplier", id: r.po.supplierId }}>{r.supplierName}</EntityLink>,
            sortValue: (r) => r.supplierName,
            mobile: "subtitle",
          } satisfies Column<Row>,
        ]),
    {
      id: "status",
      header: t("common.status"),
      cell: (r) => <StatusBadge kind="po" value={r.po.status} />,
      sortValue: (r) => PO_STATUSES.indexOf(r.po.status),
      mobile: "badge",
    },
    {
      id: "materials",
      header: t("procurement.col.materials"),
      cell: (r) => (
        <span className="inline-flex max-w-[240px] items-baseline gap-1.5">
          <span className="num shrink-0 text-ink">{t("procurement.itemsCount", { n: r.po.lines.length })}</span>
          <span className="truncate text-[12px] text-ink-3">
            {r.firstItem}
            {r.po.lines.length > 1 && <span className="num"> {t("procurement.moreItems", { n: r.po.lines.length - 1 })}</span>}
          </span>
        </span>
      ),
      sortValue: (r) => r.po.lines.length,
    },
    {
      id: "value",
      header: t("procurement.col.value"),
      cell: (r) => <span className="num font-medium text-ink">{fmt.money(r.value)}</span>,
      sortValue: (r) => r.value,
      align: "end",
    },
    {
      id: "received",
      header: t("procurement.col.received"),
      cell: (r) => (
        <span className="flex min-w-[96px] items-center gap-2">
          <Progress value={r.ratio} tone={r.ratio >= 1 ? "ok" : "accent"} label={t("procurement.col.received")} />
          <span className="num w-9 shrink-0 text-end text-[12px] text-ink-2">{fmt.pct(r.ratio, 0)}</span>
        </span>
      ),
      sortValue: (r) => r.ratio,
      width: "150px",
    },
    {
      id: "delivery",
      header: t("procurement.col.delivery"),
      cell: (r) => <DeliveryCell po={r.po} daysLate={r.daysLate} />,
      sortValue: (r) => r.po.expectedDate,
    },
    {
      id: "requestedBy",
      header: t("procurement.col.requestedBy"),
      cell: (r) => <Member id={r.po.requestedById} size={20} />,
      sortValue: (r) => lookup.member(r.po.requestedById)?.name.en ?? "",
      mobile: "hidden",
    },
    {
      id: "approvedBy",
      header: t("procurement.col.approvedBy"),
      cell: (r) => (r.po.approvedById ? <Member id={r.po.approvedById} size={20} /> : <span className="text-ink-3">—</span>),
      sortValue: (r) => lookup.member(r.po.approvedById)?.name.en ?? "",
      mobile: "hidden",
    },
    {
      id: "created",
      header: t("common.created"),
      cell: (r) => <span className="num whitespace-nowrap text-ink-2">{fmt.date(r.po.createdAt)}</span>,
      sortValue: (r) => r.po.createdAt,
      defaultHidden: true,
      mobile: "hidden",
    },
  ];

  const active = (status ? 1 : 0) + (supplier ? 1 : 0) + (delivery ? 1 : 0);

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(r) => r.po.id}
      caption={t("procurement.tab.orders")}
      searchText={(r) => r.search}
      searchPlaceholder={t("procurement.orders.search")}
      filters={
        <>
          <Select aria-label={t("common.status")} value={status} onChange={(e) => setStatus(e.target.value as PurchaseOrderStatus | "")}>
            <option value="">{t("procurement.filter.allStatuses")}</option>
            {PO_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`postatus.${s}`)}
              </option>
            ))}
          </Select>
          {!supplierId && (
            <Select aria-label={t("common.supplier")} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">{t("procurement.filter.allSuppliers")}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
          <Select aria-label={t("procurement.col.delivery")} value={delivery} onChange={(e) => setDelivery(e.target.value as "" | "late")}>
            <option value="">{t("procurement.filter.allDeliveries")}</option>
            <option value="late">{t("procurement.filter.lateOnly")}</option>
          </Select>
        </>
      }
      activeFilters={active}
      onClearFilters={() => {
        setStatus("");
        setSupplier("");
        setDelivery("");
      }}
      toolbarEnd={toolbarEnd}
      initialSort={{ id: "created", dir: "desc" }}
      onRowClick={(r) => onOpen(r.po.id)}
      activeRowId={activeId}
      empty={{ title: t("procurement.orders.empty"), hint: t("procurement.orders.emptyHint") }}
    />
  );
}
