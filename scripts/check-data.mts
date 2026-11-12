/**
 * Data consistency check for the demo dataset.  Run: npx tsx scripts/check-data.mts
 * Verifies referential integrity and the invariants the UI relies on.
 */
import { createSeed } from "../src/data/seed";
import { stockStatus, woConflicts } from "../src/domain/rules";
import { coreEn } from "../src/i18n/dict/core.en";

const d = createSeed();
const errors: string[] = [];
const must = (ok: boolean, msg: string) => { if (!ok) errors.push(msg); };
const ids = <T extends { id: string }>(l: T[]) => new Set(l.map((x) => x.id));
const unique = (name: string, l: { id: string }[]) => must(ids(l).size === l.length, `${name}: duplicate ids`);

for (const [k, v] of Object.entries(d)) if (Array.isArray(v) && v.length && "id" in v[0]) unique(k, v as { id: string }[]);

const lines = ids(d.lines), machines = ids(d.machines), products = ids(d.products), team = ids(d.team), items = ids(d.items),
  zones = ids(d.zones), whs = ids(d.warehouses), sups = ids(d.suppliers), wos = ids(d.workOrders), pos = ids(d.purchaseOrders),
  qis = ids(d.inspections), mos = ids(d.maintenanceOrders);
const refOk = (t: string, id: string) => ({ machine: machines, workOrder: wos, item: items, supplier: sups, line: lines, inspection: qis, maintenance: mos, po: pos, warehouse: whs, member: team } as Record<string, Set<string>>)[t]?.has(id) ?? true;

for (const m of d.machines) must(lines.has(m.lineId), `machine ${m.id} line`);
for (const w of d.workOrders) {
  must(products.has(w.productId) && (w.lineId === null || lines.has(w.lineId)) && team.has(w.supervisorId), `wo ${w.id} refs`);
  must(w.completedQty <= w.plannedQty && w.rejectedQty <= w.completedQty && w.plannedEnd > w.plannedStart, `wo ${w.id} quantities/window`);
}
for (const l of d.lines) must(d.workOrders.filter((w) => w.lineId === l.id && w.status === "in_progress").length <= 1, `line ${l.id} >1 active WO`);
for (const l of d.lines.filter((x) => x.status === "running")) must(d.workOrders.some((w) => w.lineId === l.id && w.status === "in_progress"), `running line ${l.id} has no active WO`);
for (const p of d.products) for (const b of p.bom) must(items.has(b.itemId), `bom ${p.id} ${b.itemId}`);
for (const p of d.products) must(d.items.some((i) => i.category === "finished" && i.productId === p.id), `no FG item for ${p.id}`);
for (const i of d.items) must(zones.has(i.zoneId) && whs.has(i.warehouseId) && (!i.supplierId || sups.has(i.supplierId)), `item ${i.id} refs`);
for (const i of d.items) { const last = d.movements.find((m) => m.itemId === i.id); must(!!last && last.balance === i.quantity, `item ${i.id} latest movement balance != qty`); }
for (const m of d.movements) must(m.balance >= 0, `movement ${m.id} negative balance`);
for (const p of d.purchaseOrders) { must(sups.has(p.supplierId), `po ${p.id} supplier`); for (const ln of p.lines) must(items.has(ln.itemId) && ln.receivedQty <= ln.qty, `po ${p.id} line ${ln.itemId}`); }
for (const s of d.shipments) must(whs.has(s.warehouseId) && (!s.poId || pos.has(s.poId)), `shipment ${s.id} refs`);
for (const q of d.inspections) { must(wos.has(q.workOrderId) && team.has(q.inspectorId), `insp ${q.id} refs`); must(q.passedQty + q.rejectedQty === q.inspectedQty && q.defects.reduce((s, x) => s + x.qty, 0) === q.rejectedQty, `insp ${q.id} sums`); }
for (const m of d.maintenanceOrders) must(machines.has(m.machineId) && (!m.technicianId || team.has(m.technicianId)), `mo ${m.id} refs`);
for (const a of d.alerts) must(refOk(a.entity.type, a.entity.id), `alert ${a.id} entity ${a.entity.type}:${a.entity.id}`);
for (const n of [...d.notifications, ...d.activity]) if (n.entity) must(refOk(n.entity.type, n.entity.id), `event ${n.id} entity ${n.entity.type}:${n.entity.id}`);
const keys = new Set(Object.keys(coreEn));
const checkMsg = (where: string, m: { key: string; params?: Record<string, unknown> }) => {
  must(keys.has(m.key), `${where}: missing dictionary key ${m.key}`);
  for (const v of Object.values(m.params ?? {})) if (typeof v === "string" && v.startsWith("@")) must(keys.has(v.slice(1)), `${where}: missing param key ${v}`);
};
d.alerts.forEach((a) => { checkMsg(a.id, a.title); checkMsg(a.id, a.detail); });
d.notifications.forEach((n) => checkMsg(n.id, n.msg));
d.activity.forEach((n) => checkMsg(n.id, n.msg));
d.team.forEach((n) => checkMsg(n.id, n.lastActivity));
for (const s of d.dailyStats) must(s.downtimeMin < s.plannedMin && s.rejected <= s.actual, `stat ${s.date} ${s.lineId}`);

const conflicts = d.workOrders.flatMap((a, i) => d.workOrders.slice(i + 1).filter((b) => woConflicts(a, b)).map((b) => `${a.id}×${b.id}`));
const stock = d.items.reduce((m, i) => ((m[stockStatus(i)] = (m[stockStatus(i)] ?? 0) + 1), m), {} as Record<string, number>);
console.log(JSON.stringify({
  counts: Object.fromEntries(Object.entries(d).map(([k, v]) => [k, (v as unknown[]).length])),
  woByStatus: d.workOrders.reduce((m, w) => ((m[w.status] = (m[w.status] ?? 0) + 1), m), {} as Record<string, number>),
  inspByStatus: d.inspections.reduce((m, w) => ((m[w.status] = (m[w.status] ?? 0) + 1), m), {} as Record<string, number>),
  stock, planningConflicts: conflicts,
  zoneCaps: d.zones.map((z) => `${z.id}:${z.capacity}`).join(" "),
  shift: d.lines.map((l) => `${l.id} ${l.shiftOutput}/${l.shiftTarget}`).join(" | "),
  activeWos: d.workOrders.filter((w) => w.status === "in_progress" || w.status === "paused").map((w) => `${w.id} ${w.lineId} ${w.completedQty}/${w.plannedQty}`),
}, null, 1));
if (errors.length) { console.error(`\n${errors.length} CONSISTENCY ERRORS:\n` + errors.slice(0, 40).join("\n")); process.exit(1); }
console.log("\nDATA CONSISTENCY: OK");
