/**
 * Workflow checks against the real store (no UI).  Run: npx tsx scripts/check-workflows.mts
 * Exercises the cascades the product promises: work-order lifecycle, stock
 * adjustments, purchasing, quality, maintenance, the simulation and reset.
 */
import { useForge } from "../src/store/store";
import { stockStatus } from "../src/domain/rules";
import { networkLive } from "../src/store/selectors";

const s = () => useForge.getState();
let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);
const item = (id: string) => s().items.find((i) => i.id === id)!;
const wo = (id: string) => s().workOrders.find((w) => w.id === id)!;
const line = (id: string) => s().lines.find((l) => l.id === id)!;
const machine = (id: string) => s().machines.find((m) => m.id === id)!;
const openAlerts = (type: string, id: string) => s().alerts.filter((a) => a.status !== "resolved" && a.entity.type === type && a.entity.id === id);

/* ------------------------------------------------------------------ */
section("Work order lifecycle");
{
  const before = { fg: item("FG-HP220").quantity, steel: item("RAW-2001").quantity, housing: item("CMP-1001").quantity, activity: s().activity.length };
  check("reject completed > planned", !s().updateWorkOrderProgress("WO-5133", 9999, 0).ok);
  check("reject rejected > completed", !s().updateWorkOrderProgress("WO-5133", 400, 401).ok);
  check("reject non-integer", !s().updateWorkOrderProgress("WO-5133", 400.5, 0).ok);
  check("invalid transition completed→? blocked", !s().setWorkOrderStatus("WO-5101", "in_progress").ok);
  check("draft cannot start without line", !s().setWorkOrderStatus("WO-5147", "in_progress").ok);
  check("second order cannot start on busy line", !s().setWorkOrderStatus("WO-5138", "in_progress").ok);

  const shiftBefore = line("L-01").shiftOutput;
  const doneBefore = wo("WO-5133").completedQty;
  check("progress update ok", s().updateWorkOrderProgress("WO-5133", doneBefore + 50, wo("WO-5133").rejectedQty).ok);
  check("shift counter follows order progress", line("L-01").shiftOutput === shiftBefore + 50, `${line("L-01").shiftOutput} vs ${shiftBefore + 50}`);

  check("pause ok", s().setWorkOrderStatus("WO-5133", "paused").ok);
  check("line idles when its order pauses", line("L-01").status === "idle");
  check("resume ok", s().setWorkOrderStatus("WO-5133", "in_progress").ok);
  check("line runs again", line("L-01").status === "running");

  const o = wo("WO-5133");
  check("complete ok", s().setWorkOrderStatus("WO-5133", "completed").ok);
  const good = o.completedQty - o.rejectedQty;
  check("finished goods received (good units only)", item("FG-HP220").quantity === before.fg + good, `${item("FG-HP220").quantity} vs ${before.fg + good}`);
  check("materials backflushed per BOM (3.2 kg steel / unit)", Math.abs(item("RAW-2001").quantity - (before.steel - 3.2 * o.completedQty)) < 0.01);
  check("materials backflushed per BOM (1 housing / unit)", item("CMP-1001").quantity === before.housing - o.completedQty);
  check("line freed after completion", line("L-01").status === "idle");
  check("activity + notification recorded", s().activity.length > before.activity && s().notifications[0].msg.key === "evt.woCompleted");
  check("completed order is terminal", !s().setWorkOrderStatus("WO-5133", "paused").ok && !s().updateWorkOrder("WO-5133", { plannedQty: 10 }).ok);
  check("stock movements reference the order", s().movements.some((m) => m.ref?.id === "WO-5133" && m.type === "production"));

  const created = s().createWorkOrder({ productId: "P1", lineId: null, plannedQty: 100, priority: "high", plannedStart: s().now, plannedEnd: s().now + 3_600_000, dueDate: s().now + 86_400_000, supervisorId: "TM-03" });
  check("create without line → draft", created.ok && wo(created.ok ? created.id! : "").status === "draft");
  check("reject zero quantity", !s().createWorkOrder({ productId: "P1", lineId: null, plannedQty: 0, priority: "low", plannedStart: 1, plannedEnd: 2, dueDate: 3, supervisorId: "TM-03" }).ok);
  check("reject end before start", !s().createWorkOrder({ productId: "P1", lineId: null, plannedQty: 5, priority: "low", plannedStart: 5, plannedEnd: 2, dueDate: 3, supervisorId: "TM-03" }).ok);
  if (created.ok) {
    check("schedule draft onto a line", s().scheduleWorkOrder(created.id!, { lineId: "L-01", plannedStart: s().now, plannedEnd: s().now + 7_200_000 }).ok && wo(created.id!).status === "scheduled");
    check("start scheduled order", s().setWorkOrderStatus(created.id!, "in_progress").ok && line("L-01").status === "running");
    check("cancel frees the line", s().setWorkOrderStatus(created.id!, "cancelled").ok && line("L-01").status === "idle");
  }
}

/* ------------------------------------------------------------------ */
section("Inventory adjustments");
{
  const it = item("RAW-2002"); // 6,150 kg, reorder 3,500 → healthy
  check("starts healthy", stockStatus(it) === "healthy");
  check("cannot go negative with ordinary reason", !s().adjustStock("RAW-2002", -99999, "damage").ok);
  check("zero adjustment rejected", !s().adjustStock("RAW-2002", 0, "count").ok);
  check("remove to below reorder", s().adjustStock("RAW-2002", -3000, "scrap", "test").ok);
  check("quantity updated", item("RAW-2002").quantity === 3150);
  check("status → low", stockStatus(item("RAW-2002")) === "low");
  check("alert raised when threshold crossed", openAlerts("item", "RAW-2002").length === 1);
  check("movement recorded with balance", s().movements[0].itemId === "RAW-2002" && s().movements[0].balance === 3150 && s().movements[0].qty === -3000);
  check("restock", s().adjustStock("RAW-2002", 3000, "found").ok);
  check("alert resolved on recovery", openAlerts("item", "RAW-2002").length === 0 && stockStatus(item("RAW-2002")) === "healthy");
  check("negative allowed only with explicit reason", s().adjustStock("CMP-1007", -10, "pending_receipt").ok && item("CMP-1007").quantity === -10);
  check("duplicate SKU rejected", !s().addItem({ sku: "raw-2001", name: { en: "x", ar: "x" }, category: "raw", unit: "kg", warehouseId: "WH-H1", zoneId: "H1-A", reorderLevel: 1, unitCost: 1, unitsPerPallet: 1 }).ok);
  const add = s().addItem({ sku: "TST-0001", name: { en: "Test", ar: "اختبار" }, category: "spare", unit: "pcs", warehouseId: "WH-H1", zoneId: "H1-D", reorderLevel: 5, unitCost: 10, unitsPerPallet: 100, quantity: 20 });
  check("add item with opening balance", add.ok && item("TST-0001").quantity === 20);
}

/* ------------------------------------------------------------------ */
section("Procurement");
{
  const po = s().purchaseOrders.find((p) => p.status === "ordered" && p.lines.some((l) => l.itemId === "CMP-1007"))!;
  const before = item("CMP-1007").quantity;
  check("over-receipt rejected", !s().receivePurchaseOrder(po.id, { "CMP-1007": 999999 }).ok);
  check("empty receipt rejected", !s().receivePurchaseOrder(po.id, {}).ok);
  check("partial receipt ok", s().receivePurchaseOrder(po.id, { "CMP-1007": 3000 }).ok);
  check("stock increased by receipt", item("CMP-1007").quantity === before + 3000);
  check("status → partial", s().purchaseOrders.find((p) => p.id === po.id)!.status === "partial");
  check("out-of-stock alert resolved by receipt", openAlerts("item", "CMP-1007").length === 0);
  const rest = Object.fromEntries(s().purchaseOrders.find((p) => p.id === po.id)!.lines.map((l) => [l.itemId, l.qty - l.receivedQty]));
  check("final receipt → received", s().receivePurchaseOrder(po.id, rest).ok && s().purchaseOrders.find((p) => p.id === po.id)!.status === "received");
  check("received order cannot be received again", !s().receivePurchaseOrder(po.id, rest).ok);

  const pending = s().purchaseOrders.find((p) => p.status === "pending")!;
  check("cannot skip approval", !s().setPurchaseOrderStatus(pending.id, "ordered").ok);
  check("approve", s().setPurchaseOrderStatus(pending.id, "approved").ok && s().purchaseOrders.find((p) => p.id === pending.id)!.approvedById === "TM-01");
  check("only drafts are editable", !s().updatePurchaseOrder(pending.id, { supplierId: pending.supplierId, expectedDate: s().now, lines: [{ itemId: pending.lines[0].itemId, qty: 1 }] }).ok);
  check("create rejects no lines", !s().createPurchaseOrder({ supplierId: "SUP-01", expectedDate: s().now, lines: [] }).ok);
  const created = s().createPurchaseOrder({ supplierId: "SUP-01", expectedDate: s().now + 86_400_000, lines: [{ itemId: "RAW-2001", qty: 500 }] });
  check("create draft", created.ok && s().purchaseOrders.find((p) => p.id === created.id)!.status === "draft");
}

/* ------------------------------------------------------------------ */
section("Quality");
{
  const created = s().createInspection({ workOrderId: "WO-5134", inspectorId: "TM-08", date: s().now });
  check("create inspection", created.ok);
  const id = created.ok ? created.id! : "";
  const produced = wo("WO-5134").completedQty;
  check("cannot inspect more than produced", !s().recordInspection(id, { inspectedQty: produced + 1, defects: [], notes: "" }).ok);
  check("rejects cannot exceed inspected", !s().recordInspection(id, { inspectedQty: 10, defects: [{ category: "surface", qty: 11 }], notes: "" }).ok);
  check("no inspection for draft orders", !s().createInspection({ workOrderId: "WO-5147", inspectorId: "TM-08", date: s().now }).ok);
  check("record failing result (5% rejects)", s().recordInspection(id, { inspectedQty: 200, defects: [{ category: "assembly", qty: 7 }, { category: "surface", qty: 3 }], notes: "test" }).ok);
  const qi = s().inspections.find((q) => q.id === id)!;
  check("outcome computed: failed", qi.status === "failed" && qi.rejectedQty === 10 && qi.passedQty === 190);
  check("quality alert raised", openAlerts("inspection", id).length === 1);
  check("order reject count never below inspection findings", wo("WO-5134").rejectedQty >= s().inspections.filter((q) => q.workOrderId === "WO-5134").reduce((a, q) => a + q.rejectedQty, 0));
  check("assign corrective action", s().assignCorrectiveAction(id, { description: "Re-check fixture", assigneeId: "TM-04", dueDate: s().now + 86_400_000 }).ok);
  check("resolve → alert resolved", s().resolveCorrectiveAction(id).ok && openAlerts("inspection", id).length === 0);
}

/* ------------------------------------------------------------------ */
section("Maintenance & machine cascades");
{
  check("line with a down machine cannot run", !s().setLineStatus("L-04", "running").ok);
  const mo = s().maintenanceOrders.find((m) => m.machineId === "MX-0403" && m.status === "in_progress")!;
  check("progress range validated", !s().updateMaintenance(mo.id, { progress: 140 }).ok);
  check("complete maintenance", s().completeMaintenance(mo.id, 2500).ok);
  check("machine restored", machine("MX-0403").status === "idle");
  check("service schedule reset (+90 days)", Math.round((machine("MX-0403").nextMaintenance - machine("MX-0403").lastMaintenance) / 86_400_000) === 90 && machine("MX-0403").lastMaintenance === s().now);
  check("machine alerts resolved", openAlerts("machine", "MX-0403").length === 0);
  check("line released from maintenance", line("L-04").status === "idle");
  check("paused order can resume now", s().setWorkOrderStatus("WO-5137", "in_progress").ok && line("L-04").status === "running" && machine("MX-0403").status === "running");

  const req = s().createMaintenance({ machineId: "MX-0501", type: "corrective", description: "Feeder jam", priority: "high", technicianId: null, scheduledDate: s().now, estimatedHours: 2 });
  check("request without technician → requested", req.ok && s().maintenanceOrders.find((m) => m.id === req.id)!.status === "requested");
  check("cannot start unassigned", !s().startMaintenance(req.ok ? req.id! : "").ok);
  check("assign technician → scheduled", s().updateMaintenance(req.id!, { technicianId: "TM-12" }).ok && s().maintenanceOrders.find((m) => m.id === req.id)!.status === "scheduled");
  check("start maintenance", s().startMaintenance(req.id!).ok);
  check("machine down, line stopped, order paused", machine("MX-0501").status === "maintenance" && line("L-05").status === "maintenance" && wo("WO-5136").status === "paused");
  check("machine cannot run while line is down", !s().setMachineStatus("MX-0502", "running").ok || line("L-05").status === "running");
}

/* ------------------------------------------------------------------ */
section("Alerts");
{
  check("acknowledge open alert", s().acknowledgeAlert("AL-404").ok && s().alerts.find((a) => a.id === "AL-404")!.status === "acknowledged");
  check("cannot acknowledge twice", !s().acknowledgeAlert("AL-404").ok);
  check("assign", s().assignAlert("AL-404", "TM-04").ok && s().alerts.find((a) => a.id === "AL-404")!.assigneeId === "TM-04");
  check("resolve", s().resolveAlert("AL-404").ok && !s().resolveAlert("AL-404").ok);
}

/* ------------------------------------------------------------------ */
section("Simulation determinism & reset");
{
  s().resetDemo();
  const run = (ticks: number) => {
    s().resetDemo();
    for (let i = 0; i < ticks; i++) s().simTick();
    return JSON.stringify({ lines: s().lines.map((l) => [l.shiftOutput, l.shiftRejected, l.shiftDowntimeMin]), wos: s().workOrders.map((w) => [w.status, w.completedQty]), now: s().now, alerts: s().alerts.length });
  };
  const a = run(300);
  const b = run(300);
  check("same ticks → identical state (deterministic)", a === b);
  const live = networkLive(s().lines, s().now);
  check("live metrics stay in range", live.oee > 0 && live.oee <= 1 && live.quality <= 1 && live.availability <= 1 && live.performance <= 1);
  for (const w of s().workOrders) check(`order ${w.id} quantities valid after simulation`, w.completedQty <= w.plannedQty && w.rejectedQty <= w.completedQty);
  for (const l of s().lines) check(`line ${l.id} has ≤1 active order`, s().workOrders.filter((w) => w.lineId === l.id && w.status === "in_progress").length <= 1);
  // 300 ticks = 5 simulated hours: crosses the 14:00 shift change.
  check("shift rollover carried shift totals into the production day", s().lines.some((l) => (l.dayCarryOutput ?? 0) > 0));
  // 12 simulated hours is enough for the running orders to finish through the completion cascade.
  run(720);
  check("simulation completes orders via the cascade", s().workOrders.filter((w) => w.status === "completed").length > 30);
  check("completed-by-simulation orders received finished goods", s().movements.some((m) => m.type === "production" && m.ref?.type === "workOrder" && m.byId !== undefined));
  for (const w of s().workOrders) check(`order ${w.id} quantities valid after 12 h`, w.completedQty <= w.plannedQty && w.rejectedQty <= w.completedQty);
  s().resetDemo();
  check("reset restores seed", wo("WO-5133").status === "in_progress" && item("CMP-1007").quantity === 0 && s().tick === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log("WORKFLOWS: OK");
