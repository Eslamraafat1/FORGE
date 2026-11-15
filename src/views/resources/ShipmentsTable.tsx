"use client";
import Link from "next/link";
import type { Shipment } from "@/domain/types";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { useForge } from "@/store/store";
import { DataTable, type Column } from "@/components/table/DataTable";
import { EntityLink } from "@/components/ui/page";
import { Badge, Code, cn } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";

export function ShipmentsTable({
  rows,
  caption,
  showWarehouse,
  showDirection,
  pageSize = 10,
}: {
  rows: Shipment[];
  caption: string;
  showWarehouse?: boolean;
  showDirection?: boolean;
  pageSize?: number;
}) {
  const { t, td } = useT();
  const fmt = useFmt();
  const now = useForge((s) => s.now);

  const columns: Column<Shipment>[] = [
    { id: "id", header: t("warehouse.ship.id"), cell: (s) => <Code className="font-semibold text-ink">{s.id}</Code>, sortValue: (s) => s.id, mobile: "subtitle", hideable: false },
    ...(showDirection
      ? [
          {
            id: "direction",
            header: t("warehouse.ship.direction"),
            cell: (s: Shipment) => <Badge tone={s.direction === "inbound" ? "info" : "neutral"}>{td(`ship.${s.direction}`)}</Badge>,
            sortValue: (s: Shipment) => s.direction,
          },
        ]
      : []),
    { id: "party", header: t("warehouse.ship.party"), cell: (s) => <span className="text-ink">{s.party}</span>, sortValue: (s) => s.party, mobile: "title", hideable: false },
    { id: "carrier", header: t("warehouse.ship.carrier"), cell: (s) => <span className="text-ink-2">{s.carrier}</span>, sortValue: (s) => s.carrier },
    ...(showWarehouse
      ? [
          {
            id: "warehouse",
            header: t("common.warehouse"),
            cell: (s: Shipment) => (
              <Link href={`/warehouse/${encodeURIComponent(s.warehouseId)}`} className="hover:text-forge-text">
                <Code className="text-ink-2">{s.warehouseId}</Code>
              </Link>
            ),
            sortValue: (s: Shipment) => s.warehouseId,
          },
        ]
      : []),
    {
      id: "eta",
      header: t("warehouse.ship.eta"),
      cell: (s) => (
        <span className="inline-flex flex-col">
          <span className="num whitespace-nowrap text-ink">{fmt.dateTime(s.eta)}</span>
          <span className={cn("num whitespace-nowrap text-[11.5px]", s.status === "delayed" ? "font-semibold text-danger" : "text-ink-3")}>{fmt.relative(s.eta, now)}</span>
        </span>
      ),
      sortValue: (s) => s.eta,
    },
    { id: "pallets", header: t("warehouse.ship.pallets"), cell: (s) => <span className="num">{fmt.num(s.pallets)}</span>, sortValue: (s) => s.pallets, align: "end" },
    { id: "status", header: t("common.status"), cell: (s) => <StatusBadge kind="shipment" value={s.status} />, sortValue: (s) => td(`shipstatus.${s.status}`), mobile: "badge", hideable: false },
    { id: "po", header: t("warehouse.ship.po"), cell: (s) => (s.poId ? <EntityLink entity={{ type: "po", id: s.poId }} /> : <span className="text-ink-3">—</span>), sortValue: (s) => s.poId ?? "" },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(s) => s.id}
      caption={caption}
      initialSort={{ id: "eta", dir: "asc" }}
      pageSize={pageSize}
      searchText={(s) => `${s.id} ${s.party} ${s.carrier} ${s.poId ?? ""} ${s.warehouseId}`}
      searchPlaceholder={t("warehouse.ship.search")}
      empty={{ title: t("warehouse.ship.empty") }}
    />
  );
}
