"use client";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ClipboardCheck, PackageCheck, Plus, Truck, Wallet } from "lucide-react";
import type { ID } from "@/domain/types";
import { poValue } from "@/domain/rules";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { DAY } from "@/lib/time";
import { useForge } from "@/store/store";
import { Tabs } from "@/components/ui/primitives";
import { Kpi, KpiStrip, Page, PageHeader } from "@/components/ui/page";
import { DemoNotice, GuardedButton } from "./parts";
import { PoDrawer } from "./PoDrawer";
import { PoFormModal } from "./PoFormModal";
import { PurchaseOrdersTable } from "./PurchaseOrdersTable";
import { RequestedMaterials, useMaterialsNeeded } from "./RequestedMaterials";
import { SuppliersTable } from "./SuppliersTable";
import { RECEIVED_WINDOW_DAYS, poIsLate, poIsOpen, poOutstandingValue, poReceivedValue } from "./logic";

type Tab = "orders" | "suppliers" | "materials";
const TABS: Tab[] = ["orders", "suppliers", "materials"];

export function ProcurementView() {
  const { t } = useT();
  const fmt = useFmt();
  const sp = useSearchParams();
  const orders = useForge((s) => s.purchaseOrders);
  const suppliers = useForge((s) => s.suppliers);
  const now = useForge((s) => s.now);
  const materials = useMaterialsNeeded();
  const [editId, setEditId] = useState<ID | null>(null);

  // The URL is the source of truth for the open record, the create dialog and the tab (deep links).
  const tabParam = sp.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "orders";
  const poId = sp.get("po");
  const creating = sp.get("new") === "1" || sp.has("item");
  const editPo = editId ? orders.find((o) => o.id === editId && o.status === "draft") : undefined;

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    const qs = q.toString();
    // Native history calls are synced into useSearchParams by the Next.js router.
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, []);

  const kpi = useMemo(() => {
    const k = { openValue: 0, openCount: 0, pendingCount: 0, pendingValue: 0, transitCount: 0, transitValue: 0, receivedValue: 0, lateCount: 0, lateValue: 0 };
    for (const po of orders) {
      if (po.status !== "cancelled" && po.expectedDate >= now - RECEIVED_WINDOW_DAYS * DAY) k.receivedValue += poReceivedValue(po);
      if (!poIsOpen(po)) continue;
      k.openCount++;
      k.openValue += poValue(po);
      if (po.status === "pending") {
        k.pendingCount++;
        k.pendingValue += poValue(po);
      }
      if (po.status === "ordered" || po.status === "partial") {
        k.transitCount++;
        k.transitValue += poOutstandingValue(po);
      }
      if (poIsLate(po, now)) {
        k.lateCount++;
        k.lateValue += poOutstandingValue(po);
      }
    }
    return k;
  }, [orders, now]);

  const closeForm = () => {
    setEditId(null);
    setParams({ new: null, item: null, supplier: null });
  };
  const createButton = (
    <GuardedButton cap="po.manage" variant="primary" icon={Plus} onClick={() => setParams({ new: "1", item: null, supplier: null, po: null })}>
      {t("procurement.create")}
    </GuardedButton>
  );

  return (
    <Page>
      <PageHeader eyebrow={t("procurement.eyebrow")} title={t("nav.procurement")} subtitle={t("procurement.subtitle")} actions={createButton} />
      <DemoNotice />

      <KpiStrip columns={5}>
        <Kpi className="col-span-2 xl:col-span-1" label={t("procurement.kpi.openValue")} value={kpi.openValue} format={fmt.money} icon={Wallet} hint={t("procurement.kpi.openHint", { n: kpi.openCount })} />
        <Kpi
          label={t("procurement.kpi.pending")}
          value={kpi.pendingCount}
          format={fmt.num}
          icon={ClipboardCheck}
          tone={kpi.pendingCount > 0 ? "warn" : undefined}
          hint={t("procurement.kpi.valueHint", { value: fmt.money(kpi.pendingValue) })}
        />
        <Kpi label={t("procurement.kpi.transit")} value={kpi.transitCount} format={fmt.num} icon={Truck} hint={t("procurement.kpi.outstandingHint", { value: fmt.money(kpi.transitValue) })} />
        <Kpi label={t("procurement.kpi.received", { days: RECEIVED_WINDOW_DAYS })} value={kpi.receivedValue} format={fmt.money} icon={PackageCheck} hint={t("procurement.kpi.receivedHint", { days: RECEIVED_WINDOW_DAYS })} />
        <Kpi
          label={t("procurement.kpi.late")}
          value={kpi.lateCount}
          format={fmt.num}
          icon={AlertTriangle}
          tone={kpi.lateCount > 0 ? "danger" : undefined}
          hint={kpi.lateCount > 0 ? t("procurement.kpi.outstandingHint", { value: fmt.money(kpi.lateValue) }) : t("procurement.kpi.lateNone")}
        />
      </KpiStrip>

      <Tabs
        label={t("procurement.tabs")}
        value={tab}
        onChange={(v) => setParams({ tab: v === "orders" ? null : v })}
        tabs={[
          { value: "orders", label: t("procurement.tab.orders"), count: orders.length },
          { value: "suppliers", label: t("procurement.tab.suppliers"), count: suppliers.length },
          { value: "materials", label: t("procurement.tab.materials"), count: materials.length },
        ]}
      />

      {tab === "orders" && <PurchaseOrdersTable onOpen={(id) => setParams({ po: id })} activeId={poId} />}
      {tab === "suppliers" && <SuppliersTable />}
      {tab === "materials" && <RequestedMaterials rows={materials} onCreate={(itemId) => setParams({ item: itemId, new: "1", supplier: null })} />}

      <PoDrawer
        poId={creating || editPo ? null : poId}
        onClose={() => setParams({ po: null })}
        onEdit={(id) => setEditId(id)}
      />
      <PoFormModal
        open={creating || !!editPo}
        edit={editPo}
        prefill={{ supplierId: sp.get("supplier"), itemId: sp.get("item") }}
        onClose={closeForm}
        onSaved={(id) => {
          setEditId(null);
          setParams({ new: null, item: null, supplier: null, tab: null, po: id });
        }}
      />
    </Page>
  );
}
