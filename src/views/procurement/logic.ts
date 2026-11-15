/**
 * Procurement view helpers — pure derivations over purchase orders and items.
 * Business rules themselves live in domain/rules.ts; these only combine them.
 */
import type { ID, InventoryItem, PurchaseOrder, PurchaseOrderStatus, Supplier } from "@/domain/types";
import { poReceivedRatio } from "@/domain/rules";
import type { Tone } from "@/components/ui/primitives";
import { DAY } from "@/lib/time";

export const PO_STATUSES: PurchaseOrderStatus[] = ["draft", "pending", "approved", "ordered", "partial", "received", "cancelled"];

export const SUPPLIER_TONE: Record<Supplier["status"], Tone> = { preferred: "ok", approved: "info", probation: "warn" };

/** Window used by the "received" KPI, days. */
export const RECEIVED_WINDOW_DAYS = 30;

export function poIsOpen(po: Pick<PurchaseOrder, "status">): boolean {
  return po.status !== "received" && po.status !== "cancelled";
}

/** Open, not fully received, and the expected delivery day has fully passed on the simulated clock. */
export function poIsLate(po: PurchaseOrder, now: number): boolean {
  return poIsOpen(po) && po.expectedDate + DAY <= now && poReceivedRatio(po) < 1;
}

/** Whole days past the expected delivery day (0 when not late). */
export function poDaysLate(po: PurchaseOrder, now: number): number {
  return poIsLate(po, now) ? Math.max(1, Math.floor((now - po.expectedDate) / DAY)) : 0;
}

export function poReceivedValue(po: Pick<PurchaseOrder, "lines">): number {
  return po.lines.reduce((s, ln) => s + ln.receivedQty * ln.unitCost, 0);
}

export function poOutstandingValue(po: Pick<PurchaseOrder, "lines">): number {
  return po.lines.reduce((s, ln) => s + Math.max(0, ln.qty - ln.receivedQty) * ln.unitCost, 0);
}

/** Outstanding quantity per item across every open purchase order (draft → partially received). */
export function onOrderByItem(orders: PurchaseOrder[]): Map<ID, number> {
  const map = new Map<ID, number>();
  for (const po of orders) {
    if (!poIsOpen(po)) continue;
    for (const ln of po.lines) {
      const out = Math.max(0, ln.qty - ln.receivedQty);
      if (out > 0) map.set(ln.itemId, (map.get(ln.itemId) ?? 0) + out);
    }
  }
  return map;
}

/**
 * Suggested order quantity (demo rule, shown in the UI):
 *   2 × reorder level − on hand − on order, never below zero.
 */
export function suggestedOrderQty(item: Pick<InventoryItem, "quantity" | "reorderLevel">, onOrder: number): number {
  return Math.max(0, Math.ceil(2 * item.reorderLevel - Math.max(0, item.quantity) - onOrder));
}
