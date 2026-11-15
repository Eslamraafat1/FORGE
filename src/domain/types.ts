/**
 * FORGE domain model.
 * Every entity in the demo dataset is described here. All timestamps are epoch
 * milliseconds on the simulated demo clock (see lib/time.ts).
 */

export type ID = string;

/** A string that exists in both supported languages. */
export interface L10n {
  en: string;
  ar: string;
}

/** A translatable message: dictionary key + interpolation params. */
export interface Msg {
  key: string;
  params?: Record<string, string | number | L10n>;
}

export type EntityType =
  | "machine"
  | "workOrder"
  | "item"
  | "supplier"
  | "line"
  | "inspection"
  | "maintenance"
  | "po"
  | "warehouse"
  | "report"
  | "member";

export interface EntityRef {
  type: EntityType;
  id: ID;
}

export type Severity = "info" | "warning" | "critical" | "success";
export type Priority = "low" | "medium" | "high" | "urgent";

/* ------------------------------------------------------------------ */
/* Organisation                                                        */
/* ------------------------------------------------------------------ */

export interface Factory {
  id: ID;
  code: string;
  name: L10n;
  city: L10n;
}

export interface Product {
  id: ID;
  sku: string;
  name: L10n;
  /** Standard value of one finished unit, USD. */
  unitValue: number;
  /** Bill of materials: inventory item consumed per finished unit. */
  bom: { itemId: ID; qtyPerUnit: number }[];
}

export interface ProductionShift {
  id: "A" | "B" | "C";
  name: L10n;
  startHour: number;
  endHour: number;
  supervisorId: ID;
}

/* ------------------------------------------------------------------ */
/* Production                                                          */
/* ------------------------------------------------------------------ */

export type LineStatus = "running" | "idle" | "changeover" | "maintenance" | "stopped";

export interface ProductionLine {
  id: ID;
  code: string;
  name: L10n;
  factoryId: ID;
  productId: ID;
  status: LineStatus;
  /** Ideal rate in units per hour. */
  nominalRate: number;
  /** Target output for the current shift, units. */
  shiftTarget: number;
  /** Units produced so far in the current shift. */
  shiftOutput: number;
  shiftRejected: number;
  shiftDowntimeMin: number;
  /** Totals from earlier shifts of the current production day (06:00 → 06:00). */
  dayCarryOutput?: number;
  dayCarryRejected?: number;
  dayCarryDowntimeMin?: number;
  supervisorId: ID;
}

export type MachineStatus = "running" | "idle" | "maintenance" | "warning" | "offline";

export interface Machine {
  id: ID;
  name: L10n;
  kind: L10n;
  manufacturer: string;
  model: string;
  serial: string;
  lineId: ID;
  factoryId: ID;
  /** Position of the machine along its line, 0-based. */
  station: number;
  installDate: number;
  status: MachineStatus;
  /** Utilisation over the trailing 7 days, percent. */
  utilization: number;
  /** Nominal operating temperature, °C (simulated). */
  baseTemp: number;
  /** Nominal operating speed in `speedUnit` (simulated). */
  baseSpeed: number;
  speedUnit: string;
  lastMaintenance: number;
  nextMaintenance: number;
  location: L10n;
}

export type WorkOrderStatus =
  | "draft"
  | "scheduled"
  | "in_progress"
  | "paused"
  | "completed"
  | "cancelled";

export interface WorkOrder {
  id: ID;
  productId: ID;
  lineId: ID | null;
  plannedQty: number;
  completedQty: number;
  rejectedQty: number;
  priority: Priority;
  /** Planned production window (used by planning). */
  plannedStart: number;
  plannedEnd: number;
  dueDate: number;
  status: WorkOrderStatus;
  supervisorId: ID;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  notes?: string;
}

export type DowntimeCause =
  | "mechanical"
  | "electrical"
  | "changeover"
  | "material"
  | "quality"
  | "planned";

export interface DowntimeEvent {
  id: ID;
  machineId: ID;
  lineId: ID;
  start: number;
  minutes: number;
  cause: DowntimeCause;
}

/** One production day for one line. Source for all historical analytics. */
export interface DailyLineStat {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** Start of that day, epoch ms. */
  ts: number;
  lineId: ID;
  productId: ID;
  /** Planned output, units. */
  planned: number;
  /** Actual total output, units (good + rejected). */
  actual: number;
  rejected: number;
  /** Planned production time, minutes. */
  plannedMin: number;
  /** Downtime, minutes (sum of downtime events for the day). */
  downtimeMin: number;
}

/* ------------------------------------------------------------------ */
/* Inventory, warehouse, procurement                                   */
/* ------------------------------------------------------------------ */

export type InventoryCategory =
  | "raw"
  | "component"
  | "wip"
  | "finished"
  | "packaging"
  | "spare";

export type StockStatus = "healthy" | "low" | "critical" | "out";

export interface InventoryItem {
  id: ID;
  sku: string;
  name: L10n;
  category: InventoryCategory;
  quantity: number;
  unit: string;
  warehouseId: ID;
  zoneId: ID;
  reorderLevel: number;
  unitCost: number;
  /** How many units fit on one pallet position (drives zone occupancy). */
  unitsPerPallet: number;
  supplierId?: ID;
  productId?: ID;
}

export type MovementType =
  | "receipt"
  | "issue"
  | "production"
  | "adjustment"
  | "count"
  | "scrap"
  | "transfer";

export interface StockMovement {
  id: ID;
  itemId: ID;
  at: number;
  type: MovementType;
  /** Signed quantity change. */
  qty: number;
  /** Balance after the movement. */
  balance: number;
  reason?: string;
  ref?: EntityRef;
  byId: ID;
}

export interface Warehouse {
  id: ID;
  code: string;
  name: L10n;
  factoryId: ID;
  managerId: ID;
  /** Layout grid size for the zone map. */
  cols: number;
  rows: number;
}

export type ZoneKind = "rack" | "bulk" | "cold" | "staging" | "dock" | "cage";

export interface WarehouseZone {
  id: ID;
  warehouseId: ID;
  code: string;
  name: L10n;
  kind: ZoneKind;
  categories: InventoryCategory[];
  /** Capacity in pallet positions. */
  capacity: number;
  /** Grid placement on the warehouse map. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ShipmentStatus = "scheduled" | "in_transit" | "arrived" | "loading" | "dispatched" | "delayed";

export interface Shipment {
  id: ID;
  direction: "inbound" | "outbound";
  warehouseId: ID;
  /** Supplier name or (fictional) customer name. */
  party: string;
  carrier: string;
  eta: number;
  status: ShipmentStatus;
  pallets: number;
  poId?: ID;
}

export interface Supplier {
  id: ID;
  name: string;
  country: L10n;
  city: L10n;
  contactName: string;
  email: string;
  phone: string;
  categories: InventoryCategory[];
  /** Share of deliveries on time, percent. */
  onTimeRate: number;
  /** Share of received units accepted, percent. */
  qualityRate: number;
  leadTimeDays: number;
  since: number;
  paymentTerms: string;
  status: "preferred" | "approved" | "probation";
}

export type PurchaseOrderStatus =
  | "draft"
  | "pending"
  | "approved"
  | "ordered"
  | "partial"
  | "received"
  | "cancelled";

export interface PurchaseOrderLine {
  itemId: ID;
  qty: number;
  receivedQty: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: ID;
  supplierId: ID;
  status: PurchaseOrderStatus;
  createdAt: number;
  expectedDate: number;
  requestedById: ID;
  approvedById?: ID;
  lines: PurchaseOrderLine[];
  notes?: string;
}

/* ------------------------------------------------------------------ */
/* Quality                                                             */
/* ------------------------------------------------------------------ */

export type DefectCategory =
  | "dimensional"
  | "surface"
  | "assembly"
  | "material"
  | "functional"
  | "cosmetic";

export interface Defect {
  category: DefectCategory;
  qty: number;
  note?: string;
}

export type InspectionStatus = "scheduled" | "in_progress" | "passed" | "failed" | "conditional";

export interface CorrectiveAction {
  description: string;
  assigneeId: ID;
  dueDate: number;
  status: "open" | "resolved";
  resolvedAt?: number;
}

export interface QualityInspection {
  id: ID;
  workOrderId: ID;
  productId: ID;
  inspectorId: ID;
  date: number;
  inspectedQty: number;
  passedQty: number;
  rejectedQty: number;
  defects: Defect[];
  status: InspectionStatus;
  notes: string;
  correctiveAction?: CorrectiveAction;
}

/* ------------------------------------------------------------------ */
/* Maintenance                                                         */
/* ------------------------------------------------------------------ */

export type MaintenanceType = "preventive" | "corrective" | "predictive";
export type MaintenanceStatus = "requested" | "scheduled" | "in_progress" | "completed" | "cancelled";

export interface MaintenanceOrder {
  id: ID;
  machineId: ID;
  type: MaintenanceType;
  description: L10n;
  priority: Priority;
  technicianId: ID | null;
  scheduledDate: number;
  estimatedHours: number;
  status: MaintenanceStatus;
  /** 0–100 */
  progress: number;
  /** Estimated or actual cost, USD. */
  cost: number;
  createdAt: number;
  completedAt?: number;
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export type Role =
  | "admin"
  | "ops_manager"
  | "supervisor"
  | "warehouse_manager"
  | "inspector"
  | "technician"
  | "procurement"
  | "viewer";

export type Department =
  | "operations"
  | "production"
  | "warehouse"
  | "quality"
  | "maintenance"
  | "procurement"
  | "executive"
  | "it";

export interface TeamMember {
  id: ID;
  name: L10n;
  role: Role;
  department: Department;
  factoryId: ID;
  status: "on_shift" | "active" | "away" | "offline";
  email: string;
  lastActivity: Msg;
  lastActiveAt: number;
}

/* ------------------------------------------------------------------ */
/* Alerts, notifications, activity                                     */
/* ------------------------------------------------------------------ */

export type EventCategory =
  | "production"
  | "quality"
  | "inventory"
  | "maintenance"
  | "logistics"
  | "procurement"
  | "system";

export type AlertStatus = "open" | "acknowledged" | "resolved";

export interface Alert {
  id: ID;
  severity: "info" | "warning" | "critical";
  status: AlertStatus;
  category: EventCategory;
  title: Msg;
  detail: Msg;
  entity: EntityRef;
  createdAt: number;
  assigneeId?: ID;
  acknowledgedById?: ID;
  resolvedAt?: number;
}

export interface Notification {
  id: ID;
  category: EventCategory;
  severity: Severity;
  msg: Msg;
  entity?: EntityRef;
  at: number;
  read: boolean;
}

export interface ActivityEvent {
  id: ID;
  at: number;
  category: EventCategory;
  severity: Severity;
  msg: Msg;
  entity?: EntityRef;
  actorId?: ID;
}

/* ------------------------------------------------------------------ */
/* The complete dataset                                                */
/* ------------------------------------------------------------------ */

export interface ForgeData {
  factories: Factory[];
  products: Product[];
  shifts: ProductionShift[];
  lines: ProductionLine[];
  machines: Machine[];
  workOrders: WorkOrder[];
  downtimeEvents: DowntimeEvent[];
  dailyStats: DailyLineStat[];
  items: InventoryItem[];
  movements: StockMovement[];
  warehouses: Warehouse[];
  zones: WarehouseZone[];
  shipments: Shipment[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  inspections: QualityInspection[];
  maintenanceOrders: MaintenanceOrder[];
  team: TeamMember[];
  alerts: Alert[];
  notifications: Notification[];
  activity: ActivityEvent[];
}
