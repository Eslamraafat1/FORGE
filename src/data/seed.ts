/**
 * Deterministic demo dataset for FORGE.
 * Everything here is fictional and generated from a fixed seed, anchored to
 * DEMO_EPOCH. Calling createSeed() always returns the same dataset.
 */
import type {
  ActivityEvent,
  Alert,
  DailyLineStat,
  Defect,
  DefectCategory,
  DowntimeCause,
  DowntimeEvent,
  Factory,
  ForgeData,
  InventoryCategory,
  InventoryItem,
  L10n,
  Machine,
  MachineStatus,
  MaintenanceOrder,
  Notification,
  Product,
  ProductionLine,
  ProductionShift,
  PurchaseOrder,
  QualityInspection,
  Shipment,
  StockMovement,
  Supplier,
  TeamMember,
  Warehouse,
  WarehouseZone,
  WorkOrder,
  ZoneKind,
} from "@/domain/types";
import { createRng } from "@/lib/rng";
import { DAY, DEMO_EPOCH, HOUR, MIN, dayKey, startOfDay } from "@/lib/time";

const l = (en: string, ar: string): L10n => ({ en, ar });

export const CURRENT_USER_ID = "TM-01";
export const HISTORY_DAYS = 60;

/* ------------------------------------------------------------------ */
/* Static reference data                                               */
/* ------------------------------------------------------------------ */

const factories: Factory[] = [
  { id: "HLD", code: "HLD", name: l("Halden Works", "مصنع هالدن"), city: l("Halden District", "منطقة هالدن") },
  { id: "MRD", code: "MRD", name: l("Meridian Plant", "مصنع ميريديان") , city: l("Meridian Bay", "خليج ميريديان") },
];

const products: Product[] = [
  {
    id: "P1", sku: "HP-220", name: l("Hydraulic Pump HP-220", "مضخة هيدروليكية HP-220"), unitValue: 640,
    bom: [
      { itemId: "CMP-1001", qtyPerUnit: 1 }, { itemId: "CMP-1002", qtyPerUnit: 1 },
      { itemId: "RAW-2001", qtyPerUnit: 3.2 }, { itemId: "CMP-1010", qtyPerUnit: 1 },
    ],
  },
  {
    id: "P2", sku: "SA-410", name: l("Servo Actuator SA-410", "مشغّل سيرفو SA-410"), unitValue: 415,
    bom: [
      { itemId: "CMP-1003", qtyPerUnit: 1 }, { itemId: "CMP-1004", qtyPerUnit: 1 },
      { itemId: "RAW-2002", qtyPerUnit: 1.4 }, { itemId: "CMP-1010", qtyPerUnit: 1 },
    ],
  },
  {
    id: "P3", sku: "GB-135", name: l("Planetary Gearbox GB-135", "علبة تروس كوكبية GB-135"), unitValue: 1180,
    bom: [
      { itemId: "RAW-2001", qtyPerUnit: 6.5 }, { itemId: "CMP-1005", qtyPerUnit: 2 },
      { itemId: "CMP-1006", qtyPerUnit: 4 }, { itemId: "RAW-2005", qtyPerUnit: 0.4 },
    ],
  },
  {
    id: "P4", sku: "CV-080", name: l("Control Valve CV-080", "صمام تحكم CV-080"), unitValue: 185,
    bom: [
      { itemId: "RAW-2003", qtyPerUnit: 0.9 }, { itemId: "CMP-1007", qtyPerUnit: 1 },
      { itemId: "CMP-1002", qtyPerUnit: 1 },
    ],
  },
  {
    id: "P5", sku: "MC-750", name: l("Motor Controller MC-750", "وحدة تحكم بالمحرك MC-750"), unitValue: 290,
    bom: [
      { itemId: "CMP-1008", qtyPerUnit: 1 }, { itemId: "CMP-1009", qtyPerUnit: 2 },
      { itemId: "RAW-2004", qtyPerUnit: 3 }, { itemId: "CMP-1011", qtyPerUnit: 1 },
    ],
  },
  {
    id: "P6", sku: "BH-300", name: l("Bearing Housing BH-300", "مبيت محامل BH-300"), unitValue: 230,
    bom: [
      { itemId: "RAW-2006", qtyPerUnit: 4.8 }, { itemId: "RAW-2007", qtyPerUnit: 2 },
      { itemId: "CMP-1012", qtyPerUnit: 1 },
    ],
  },
];

const shifts: ProductionShift[] = [
  { id: "A", name: l("Shift A · Morning", "الوردية أ · الصباحية"), startHour: 6, endHour: 14, supervisorId: "TM-03" },
  { id: "B", name: l("Shift B · Afternoon", "الوردية ب · المسائية"), startHour: 14, endHour: 22, supervisorId: "TM-04" },
  { id: "C", name: l("Shift C · Night", "الوردية ج · الليلية"), startHour: 22, endHour: 6, supervisorId: "TM-05" },
];

const team: TeamMember[] = (
  [
    ["TM-01", "Alex Morgan", "أليكس مورغان", "ops_manager", "operations", "HLD", "on_shift", "act.acknowledgedAlert", 14],
    ["TM-02", "Priya Raman", "بريا رامان", "admin", "it", "HLD", "active", "act.updatedRoles", 95],
    ["TM-03", "Marcus Lindqvist", "ماركوس ليندكفيست", "supervisor", "production", "HLD", "on_shift", "act.startedShift", 222],
    ["TM-04", "Hana Okafor", "هناء أوكافور", "supervisor", "production", "HLD", "on_shift", "act.pausedLine", 92],
    ["TM-05", "Diego Santoro", "دييغو سانتورو", "supervisor", "production", "MRD", "on_shift", "act.startedChangeover", 71],
    ["TM-06", "Layla Haddad", "ليلى حداد", "warehouse_manager", "warehouse", "HLD", "on_shift", "act.receivedShipment", 48],
    ["TM-07", "Tomasz Nowak", "توماش نوفاك", "warehouse_manager", "warehouse", "MRD", "active", "act.cycleCount", 180],
    ["TM-08", "Ingrid Solberg", "إنغريد سولبرغ", "inspector", "quality", "HLD", "on_shift", "act.recordedInspection", 33],
    ["TM-09", "Kenji Watanabe", "كينجي واتانابي", "inspector", "quality", "MRD", "away", "act.recordedInspection", 310],
    ["TM-10", "Omar Farouk", "عمر فاروق", "technician", "maintenance", "HLD", "on_shift", "act.startedMaintenance", 88],
    ["TM-11", "Elena Petrova", "إيلينا بتروفا", "technician", "maintenance", "HLD", "active", "act.completedMaintenance", 1300],
    ["TM-12", "Samuel Adeyemi", "صامويل أديمي", "technician", "maintenance", "MRD", "on_shift", "act.inspectedMachine", 64],
    ["TM-13", "Claire Dubois", "كلير دوبوا", "procurement", "procurement", "HLD", "active", "act.submittedPo", 126],
    ["TM-14", "Victor Reyes", "فيكتور رييس", "viewer", "executive", "HLD", "offline", "act.viewedReport", 1560],
  ] as const
).map(([id, en, ar, role, department, factoryId, status, key, minsAgo]) => ({
  id,
  name: l(en, ar),
  role,
  department,
  factoryId,
  status,
  email: `${en.toLowerCase().replace(" ", ".")}@forge-demo.example`,
  lastActivity: { key },
  lastActiveAt: DEMO_EPOCH - minsAgo * MIN,
}));

/* Lines: [id, name en, name ar, factory, product, status, rate, supervisor, shift efficiency, productive hours so far, downtime min] */
const lineDefs = [
  ["L-01", "Pump Assembly", "تجميع المضخات", "HLD", "P1", "running", 42, "TM-03", 0.95, 3.55, 9],
  ["L-02", "Servo Actuator Cell", "خلية مشغّلات السيرفو", "HLD", "P2", "running", 60, "TM-03", 0.93, 3.42, 17],
  ["L-03", "Gearbox Machining", "تشغيل علب التروس", "HLD", "P3", "running", 28, "TM-04", 0.88, 3.3, 24],
  ["L-04", "Valve Block Line", "خط كتل الصمامات", "HLD", "P4", "maintenance", 90, "TM-04", 0.94, 2.17, 92],
  ["L-05", "Controller Electronics", "إلكترونيات وحدات التحكم", "MRD", "P5", "running", 120, "TM-05", 0.96, 3.6, 6],
  ["L-06", "Housing Foundry", "مسبك المبايت", "MRD", "P6", "changeover", 55, "TM-05", 0.91, 2.5, 71],
] as const;

const lines: ProductionLine[] = lineDefs.map(([id, en, ar, factoryId, productId, status, rate, sup, eff, hours, down]) => {
  const out = Math.round(rate * hours * eff);
  return {
    id,
    code: id,
    name: l(en, ar),
    factoryId,
    productId,
    status,
    nominalRate: rate,
    shiftTarget: Math.round(rate * 8 * 0.92),
    shiftOutput: out,
    shiftRejected: Math.round(out * (id === "L-03" ? 0.034 : 0.018)),
    shiftDowntimeMin: down,
    supervisorId: sup,
  };
});

/* Machines: 4 stations per line. [kind en, kind ar, maker, model, baseTemp, baseSpeed, unit] */
type MDef = readonly [string, string, string, string, number, number, string];
const machineDefs: Record<string, readonly MDef[]> = {
  "L-01": [
    ["CNC Machining Center", "مركز تشغيل CNC", "Kessler Maschinenbau", "KM-5X 800", 58, 9200, "rpm"],
    ["Robotic Assembly Cell", "خلية تجميع روبوتية", "Aldera Robotics", "AR-Flex 6", 41, 38, "cyc/h"],
    ["Hydraulic Test Bench", "منصة اختبار هيدروليكي", "Varent Systems", "HTB-350", 52, 320, "bar"],
    ["Packaging Station", "محطة تعبئة", "Norvik Automation", "NP-Line 2", 33, 44, "u/h"],
  ],
  "L-02": [
    ["Stator Winding Machine", "آلة لف الجزء الثابت", "Takumi Precision", "TW-240", 47, 1450, "rpm"],
    ["Laser Welding Cell", "خلية لحام بالليزر", "Aldera Robotics", "AR-Weld L3", 64, 62, "cyc/h"],
    ["Encoder Calibration Rig", "جهاز معايرة المشفّر", "Varent Systems", "ECR-12", 36, 60, "u/h"],
    ["End-of-Line Tester", "جهاز اختبار نهاية الخط", "Varent Systems", "EOL-900", 38, 61, "u/h"],
  ],
  "L-03": [
    ["Gear Hobbing Machine", "آلة تفريز التروس", "Kessler Maschinenbau", "KM-Hob 320", 66, 780, "rpm"],
    ["5-Axis Milling Center", "مركز تفريز خماسي المحاور", "Takumi Precision", "TX-5 Mill", 61, 11800, "rpm"],
    ["Heat Treatment Furnace", "فرن المعالجة الحرارية", "Norvik Automation", "NF-Therm 9", 845, 28, "u/h"],
    ["Coordinate Measuring Machine", "آلة قياس الإحداثيات", "Varent Systems", "CMM-Pro 7", 24, 26, "u/h"],
  ],
  "L-04": [
    ["Bar-Feed Lathe", "مخرطة تغذية قضبان", "Takumi Precision", "TL-Swiss 32", 55, 6400, "rpm"],
    ["Deburring Robot", "روبوت إزالة النتوءات", "Aldera Robotics", "AR-Burr 4", 39, 92, "cyc/h"],
    ["Solenoid Press", "مكبس الملف اللولبي", "Kessler Maschinenbau", "KP-60T", 44, 90, "str/h"],
    ["Leak Test Station", "محطة اختبار التسرب", "Varent Systems", "LTS-16", 31, 94, "u/h"],
  ],
  "L-05": [
    ["SMT Placement Line", "خط تركيب SMT", "Norvik Automation", "NS-Place X4", 34, 32000, "cph"],
    ["Reflow Oven", "فرن إعادة الانصهار", "Norvik Automation", "NR-Reflow 10", 245, 1.2, "m/min"],
    ["Optical Inspection (AOI)", "الفحص البصري الآلي", "Varent Systems", "AOI-Vision 5", 29, 124, "u/h"],
    ["Conformal Coating Cell", "خلية الطلاء الواقي", "Aldera Robotics", "AR-Coat 2", 37, 122, "u/h"],
  ],
  "L-06": [
    ["Induction Furnace", "فرن حثّي", "Kessler Maschinenbau", "KF-Induct 2T", 1420, 1.8, "t/h"],
    ["Die Casting Machine", "آلة الصب بالقوالب", "Kessler Maschinenbau", "KD-Cast 840", 310, 58, "cyc/h"],
    ["Shot Blasting Unit", "وحدة السفع بالخردق", "Norvik Automation", "NB-Blast 6", 48, 57, "u/h"],
    ["Finishing CNC", "CNC للتشطيب", "Takumi Precision", "TF-CNC 500", 56, 8400, "rpm"],
  ],
};

/** Deliberate non-running machines so the twin shows every state. */
const machineStatusOverrides: Record<string, MachineStatus> = {
  "MX-0302": "warning",
  "MX-0403": "maintenance",
  "MX-0401": "idle",
  "MX-0402": "idle",
  "MX-0404": "idle",
  "MX-0601": "idle",
  "MX-0602": "idle",
  "MX-0603": "offline",
  "MX-0604": "idle",
};

/* Suppliers (fictional companies and contacts). */
const suppliers: Supplier[] = (
  [
    ["SUP-01", "Nordhaven Steel & Alloys", "Norway", "النرويج", "Bergen", "بيرغن", "Astrid Vik", ["raw"], 96.4, 99.1, 9, 2019, "Net 45", "preferred"],
    ["SUP-02", "Castellan Foundry Group", "Spain", "إسبانيا", "Bilbao", "بلباو", "Mateo Ruiz", ["component", "raw"], 91.2, 97.8, 14, 2020, "Net 30", "approved"],
    ["SUP-03", "Shinsei Motion Components", "Japan", "اليابان", "Nagoya", "ناغويا", "Yuki Tanabe", ["component"], 97.9, 99.6, 21, 2018, "Net 60", "preferred"],
    ["SUP-04", "Brightline Electronics", "Malaysia", "ماليزيا", "Penang", "بينانغ", "Farah Aziz", ["component"], 88.5, 98.4, 18, 2021, "Net 30", "approved"],
    ["SUP-05", "Rheintal Bearings", "Germany", "ألمانيا", "Stuttgart", "شتوتغارت", "Jonas Keller", ["component", "spare"], 94.7, 99.3, 7, 2017, "Net 45", "preferred"],
    ["SUP-06", "Apex Sealing Technologies", "United Kingdom", "المملكة المتحدة", "Sheffield", "شيفيلد", "Naomi Clarke", ["component", "spare"], 83.6, 96.2, 12, 2022, "Net 30", "probation"],
    ["SUP-07", "PackWise Industrial", "Netherlands", "هولندا", "Eindhoven", "آيندهوفن", "Daan Visser", ["packaging"], 95.8, 99.0, 5, 2020, "Net 30", "approved"],
    ["SUP-08", "Gulf Industrial Supplies", "United Arab Emirates", "الإمارات العربية المتحدة", "Sharjah", "الشارقة", "Khalid Al Mansoori", ["raw", "spare"], 92.3, 98.7, 10, 2021, "Net 45", "approved"],
  ] as const
).map(([id, name, cEn, cAr, cityEn, cityAr, contact, categories, onTime, quality, lead, since, terms, status], i) => ({
  id,
  name,
  country: l(cEn, cAr),
  city: l(cityEn, cityAr),
  contactName: contact,
  email: `${contact.toLowerCase().replace(/ /g, ".")}@${name.toLowerCase().replace(/[^a-z]+/g, "")}.example`,
  phone: `+00 555 01${String(10 + i * 7).padStart(2, "0")}`,
  categories: [...categories] as InventoryCategory[],
  onTimeRate: onTime,
  qualityRate: quality,
  leadTimeDays: lead,
  since: new Date(since, 2 + i, 1).getTime(),
  paymentTerms: terms,
  status,
}));

const warehouses: Warehouse[] = [
  { id: "WH-H1", code: "WH-H1", name: l("Halden Central Stores", "مخازن هالدن المركزية"), factoryId: "HLD", managerId: "TM-06", cols: 12, rows: 8 },
  { id: "WH-H2", code: "WH-H2", name: l("Halden Finished Goods DC", "مركز توزيع المنتجات التامة – هالدن"), factoryId: "HLD", managerId: "TM-06", cols: 12, rows: 8 },
  { id: "WH-M1", code: "WH-M1", name: l("Meridian Warehouse", "مستودع ميريديان"), factoryId: "MRD", managerId: "TM-07", cols: 12, rows: 8 },
];

/* Zones: [id, wh, name en, name ar, kind, categories, x, y, w, h, target fill ratio] */
const zoneDefs: readonly (readonly [string, string, string, string, ZoneKind, InventoryCategory[], number, number, number, number, number])[] = [
  ["H1-A", "WH-H1", "Rack Aisle A · Metals", "ممر الرفوف أ · المعادن", "rack", ["raw"], 0, 0, 5, 3, 0.82],
  ["H1-B", "WH-H1", "Rack Aisle B · Components", "ممر الرفوف ب · المكوّنات", "rack", ["component"], 5, 0, 7, 3, 0.74],
  ["H1-C", "WH-H1", "Bulk Floor", "أرضية التخزين السائب", "bulk", ["raw"], 0, 3, 4, 3, 0.61],
  ["H1-D", "WH-H1", "Small Parts Cage", "قفص القطع الصغيرة", "cage", ["spare"], 4, 3, 3, 3, 0.56],
  ["H1-E", "WH-H1", "Packaging Mezzanine", "ميزانين مواد التعبئة", "rack", ["packaging"], 7, 3, 5, 2, 0.68],
  ["H1-W", "WH-H1", "WIP Buffer", "منطقة الإنتاج تحت التشغيل", "staging", ["wip"], 7, 5, 5, 1, 0.47],
  ["H1-R", "WH-H1", "Receiving Dock", "رصيف الاستلام", "dock", [], 0, 6, 12, 2, 0],
  ["H2-A", "WH-H2", "Finished Racks A", "رفوف المنتجات التامة أ", "rack", ["finished"], 0, 0, 6, 4, 0.78],
  ["H2-B", "WH-H2", "Finished Racks B", "رفوف المنتجات التامة ب", "rack", ["finished"], 6, 0, 6, 4, 0.66],
  ["H2-P", "WH-H2", "Kitting & Packaging", "التجهيز والتعبئة", "bulk", ["packaging"], 0, 4, 4, 2, 0.52],
  ["H2-S", "WH-H2", "Outbound Staging", "تجهيز الشحنات الصادرة", "staging", [], 4, 4, 8, 2, 0],
  ["H2-D", "WH-H2", "Shipping Dock", "رصيف الشحن", "dock", [], 0, 6, 12, 2, 0],
  ["M1-A", "WH-M1", "Foundry Materials", "مواد المسبك", "bulk", ["raw"], 0, 0, 4, 4, 0.88],
  ["M1-B", "WH-M1", "Electronics Racks", "رفوف الإلكترونيات", "cold", ["component"], 4, 0, 4, 4, 0.71],
  ["M1-F", "WH-M1", "Finished Goods", "المنتجات التامة", "rack", ["finished"], 8, 0, 4, 4, 0.63],
  ["M1-W", "WH-M1", "WIP Buffer", "منطقة الإنتاج تحت التشغيل", "staging", ["wip"], 0, 4, 5, 2, 0.44],
  ["M1-S", "WH-M1", "Spares Cage", "قفص قطع الغيار", "cage", ["spare", "packaging"], 5, 4, 7, 2, 0.58],
  ["M1-D", "WH-M1", "Combined Dock", "الرصيف المشترك", "dock", [], 0, 6, 12, 2, 0],
];

/* Items: [sku, en, ar, category, qty, unit, zone, reorder, unit cost, units/pallet, supplier, product] */
type IDef = readonly [string, string, string, InventoryCategory, number, string, string, number, number, number, string?, string?];
const itemDefs: readonly IDef[] = [
  // Raw materials
  ["RAW-2001", "Alloy Steel Bar 42CrMo4", "قضبان فولاذ سبائكي 42CrMo4", "raw", 18400, "kg", "H1-A", 9000, 2.35, 1000, "SUP-01"],
  ["RAW-2002", "Aluminium Extrusion 6082", "مقاطع ألمنيوم 6082", "raw", 6150, "kg", "H1-A", 3500, 3.9, 600, "SUP-01"],
  ["RAW-2003", "Brass Rod CW614N", "قضبان نحاس أصفر CW614N", "raw", 2380, "kg", "H1-A", 2600, 7.4, 800, "SUP-08"],
  ["RAW-2004", "Copper Winding Wire 1.2 mm", "سلك لف نحاسي 1.2 مم", "raw", 41500, "m", "M1-B", 24000, 0.42, 6000, "SUP-08"],
  ["RAW-2005", "Gear Lubricant ISO VG 220", "زيت تروس ISO VG 220", "raw", 1260, "L", "H1-C", 600, 6.8, 800, "SUP-08"],
  ["RAW-2006", "Ductile Iron Ingot GJS-500", "سبائك حديد مطاوع GJS-500", "raw", 22800, "kg", "M1-A", 12000, 1.15, 1200, "SUP-02"],
  ["RAW-2007", "Foundry Sand (Silica)", "رمل المسبك (سيليكا)", "raw", 3100, "kg", "M1-A", 6000, 0.18, 1000, "SUP-02"],
  ["RAW-2008", "Cutting Fluid Concentrate", "مركّز سائل القطع", "raw", 940, "L", "H1-C", 400, 5.2, 800, "SUP-08"],
  // Components
  ["CMP-1001", "Pump Housing Casting", "مصبوبة جسم المضخة", "component", 1420, "pcs", "H1-B", 700, 48.5, 60, "SUP-02"],
  ["CMP-1002", "Shaft Seal Kit", "طقم مانع تسرب العمود", "component", 610, "pcs", "H1-B", 1500, 6.9, 1200, "SUP-06"],
  ["CMP-1003", "Servo Motor Core", "قلب محرك السيرفو", "component", 2260, "pcs", "H1-B", 1100, 71, 120, "SUP-03"],
  ["CMP-1004", "Encoder Module 17-bit", "وحدة مشفّر 17 بت", "component", 1980, "pcs", "H1-B", 1100, 38.2, 800, "SUP-03"],
  ["CMP-1005", "Tapered Roller Bearing Set", "طقم محامل أسطوانية مخروطية", "component", 3350, "pcs", "H1-B", 1400, 22.4, 400, "SUP-05"],
  ["CMP-1006", "Forged Gear Blank", "خامة ترس مطروقة", "component", 4100, "pcs", "H1-B", 2400, 14.6, 200, "SUP-02"],
  ["CMP-1007", "Solenoid Coil 24 V", "ملف لولبي 24 فولت", "component", 0, "pcs", "H1-B", 2000, 9.3, 1500, "SUP-04"],
  ["CMP-1008", "Controller PCB Panel", "لوحة دوائر وحدة التحكم", "component", 5200, "pcs", "M1-B", 2800, 31.5, 400, "SUP-04"],
  ["CMP-1009", "IGBT Power Module", "وحدة قدرة IGBT", "component", 3900, "pcs", "M1-B", 5000, 18.9, 900, "SUP-04"],
  ["CMP-1010", "Fastener Set M8 (Zinc)", "طقم مثبتات M8 (مجلفن)", "component", 9800, "set", "H1-B", 3000, 1.25, 2500, "SUP-05"],
  ["CMP-1011", "Die-Cast Enclosure", "علبة مصبوبة بالقوالب", "component", 4650, "pcs", "M1-B", 2500, 12.7, 240, "SUP-02"],
  ["CMP-1012", "Bronze Bushing 40 mm", "جلبة برونزية 40 مم", "component", 5300, "pcs", "M1-B", 2000, 4.4, 1500, "SUP-05"],
  // Work in progress
  ["WIP-3001", "Pump Body — Machined", "جسم مضخة — مشغّل", "wip", 186, "pcs", "H1-W", 0, 212, 40, undefined, "P1"],
  ["WIP-3002", "Actuator Sub-Assembly", "تجميعة فرعية للمشغّل", "wip", 240, "pcs", "H1-W", 0, 168, 80, undefined, "P2"],
  ["WIP-3003", "Gear Set — Heat Treated", "طقم تروس — معالج حرارياً", "wip", 94, "set", "H1-W", 0, 386, 30, undefined, "P3"],
  ["WIP-3005", "Controller Board — Populated", "لوحة تحكم — مجمّعة", "wip", 520, "pcs", "M1-W", 0, 104, 200, undefined, "P5"],
  ["WIP-3006", "Housing — Raw Casting", "مبيت — مصبوبة خام", "wip", 310, "pcs", "M1-W", 0, 61, 80, undefined, "P6"],
  // Finished goods
  ["FG-HP220", "Hydraulic Pump HP-220", "مضخة هيدروليكية HP-220", "finished", 1840, "pcs", "H2-A", 600, 640, 24, undefined, "P1"],
  ["FG-SA410", "Servo Actuator SA-410", "مشغّل سيرفو SA-410", "finished", 3120, "pcs", "H2-A", 900, 415, 60, undefined, "P2"],
  ["FG-GB135", "Planetary Gearbox GB-135", "علبة تروس كوكبية GB-135", "finished", 410, "pcs", "H2-B", 450, 1180, 12, undefined, "P3"],
  ["FG-CV080", "Control Valve CV-080", "صمام تحكم CV-080", "finished", 5600, "pcs", "H2-B", 2000, 185, 200, undefined, "P4"],
  ["FG-MC750", "Motor Controller MC-750", "وحدة تحكم بالمحرك MC-750", "finished", 6900, "pcs", "M1-F", 2400, 290, 150, undefined, "P5"],
  ["FG-BH300", "Bearing Housing BH-300", "مبيت محامل BH-300", "finished", 2750, "pcs", "M1-F", 1000, 230, 90, undefined, "P6"],
  // Packaging
  ["PKG-4001", "Export Crate 600×400", "صندوق تصدير 600×400", "packaging", 880, "pcs", "H1-E", 500, 11.2, 40, "SUP-07"],
  ["PKG-4002", "Corrugated Carton C-12", "كرتون مموّج C-12", "packaging", 7400, "pcs", "H1-E", 4000, 0.92, 500, "SUP-07"],
  ["PKG-4003", "VCI Anti-Corrosion Film", "غشاء VCI مانع للتآكل", "packaging", 310, "roll", "H2-P", 350, 24.5, 30, "SUP-07"],
  ["PKG-4004", "ESD Shielding Bag", "كيس حماية من الكهرباء الساكنة", "packaging", 16500, "pcs", "M1-S", 8000, 0.21, 5000, "SUP-07"],
  ["PKG-4005", "Euro Pallet (Heat Treated)", "منصة يورو (معالجة حرارياً)", "packaging", 640, "pcs", "H2-P", 300, 13.8, 18, "SUP-07"],
  // Spare parts
  ["SPR-5001", "Spindle Cartridge KM-5X", "خرطوشة عمود الدوران KM-5X", "spare", 2, "pcs", "H1-D", 2, 8400, 4, "SUP-05"],
  ["SPR-5002", "Servo Drive Belt HTD-8M", "سير محرك سيرفو HTD-8M", "spare", 26, "pcs", "H1-D", 12, 46, 200, "SUP-05"],
  ["SPR-5003", "Hydraulic Filter Element 10 µm", "عنصر فلتر هيدروليكي 10 ميكرون", "spare", 9, "pcs", "H1-D", 24, 62, 300, "SUP-06"],
  ["SPR-5004", "Laser Protective Window", "نافذة حماية الليزر", "spare", 14, "pcs", "H1-D", 8, 185, 400, "SUP-03"],
  ["SPR-5005", "Thermocouple Type K", "مزدوجة حرارية نوع K", "spare", 38, "pcs", "M1-S", 15, 28, 1000, "SUP-08"],
  ["SPR-5006", "Furnace Refractory Lining Kit", "طقم بطانة حرارية للفرن", "spare", 1, "kit", "M1-S", 1, 5200, 2, "SUP-08"],
];

/* ------------------------------------------------------------------ */
/* Generators                                                          */
/* ------------------------------------------------------------------ */

export function createSeed(): ForgeData {
  const rng = createRng(20261112);
  const today = startOfDay(DEMO_EPOCH);
  let seq = 0;
  const uid = (p: string) => `${p}-${String(++seq).padStart(5, "0")}`;

  /* Machines ------------------------------------------------------- */
  const machines: Machine[] = [];
  for (const line of lines) {
    const n = Number(line.id.slice(2));
    machineDefs[line.id].forEach(([kEn, kAr, maker, model, temp, speed, unit], station) => {
      const id = `MX-${String(n).padStart(2, "0")}${String(station + 1).padStart(2, "0")}`;
      const status = machineStatusOverrides[id] ?? "running";
      const last = today - rng.int(6, 70) * DAY;
      machines.push({
        id,
        name: l(`${kEn} ${n}${String.fromCharCode(65 + station)}`, `${kAr} ${n}${String.fromCharCode(65 + station)}`),
        kind: l(kEn, kAr),
        manufacturer: maker,
        model,
        serial: `${model.replace(/[^A-Z0-9]/gi, "").slice(0, 5).toUpperCase()}-${rng.int(100000, 999999)}`,
        lineId: line.id,
        factoryId: line.factoryId,
        station,
        installDate: new Date(rng.int(2016, 2024), rng.int(0, 11), rng.int(1, 28)).getTime(),
        status,
        utilization:
          status === "running" ? rng.int(78, 94) : status === "warning" ? 71 : status === "idle" ? rng.int(52, 68) : status === "maintenance" ? 44 : 0,
        baseTemp: temp,
        baseSpeed: speed,
        speedUnit: unit,
        lastMaintenance: last,
        nextMaintenance: last + 90 * DAY,
        location: l(`${line.factoryId} · Bay ${n} · Station ${station + 1}`, `${line.factoryId} · الجناح ${n} · المحطة ${station + 1}`),
      });
    });
  }
  const m = (id: string) => machines.find((x) => x.id === id)!;
  // Hand-tuned maintenance dates that back the seeded alerts and orders.
  m("MX-0302").lastMaintenance = today - 96 * DAY;
  m("MX-0302").nextMaintenance = today - 6 * DAY; // overdue
  m("MX-0403").lastMaintenance = today - 88 * DAY;
  m("MX-0403").nextMaintenance = today;
  m("MX-0603").lastMaintenance = today - 41 * DAY;
  m("MX-0603").nextMaintenance = today + 49 * DAY;
  m("MX-0102").lastMaintenance = today - 86 * DAY;
  m("MX-0102").nextMaintenance = today + 4 * DAY;
  m("MX-0501").lastMaintenance = today - 83 * DAY;
  m("MX-0501").nextMaintenance = today + 7 * DAY;
  m("MX-0201").lastMaintenance = today - 93 * DAY;
  m("MX-0201").nextMaintenance = today - 3 * DAY; // overdue

  /* Downtime + daily production history ---------------------------- */
  const downtimeEvents: DowntimeEvent[] = [];
  const dailyStats: DailyLineStat[] = [];
  const causes: DowntimeCause[] = ["mechanical", "mechanical", "electrical", "changeover", "changeover", "material", "quality", "planned"];
  for (let d = HISTORY_DAYS; d >= 1; d--) {
    const ts = today - d * DAY;
    const dow = new Date(ts).getDay();
    if (dow === 0) continue; // plants closed on Sundays
    const plannedMin = dow === 6 ? 480 : 960;
    for (const line of lines) {
      const lineMachines = machines.filter((x) => x.lineId === line.id);
      let downtimeMin = 0;
      const events = rng.chance(0.62) ? (rng.chance(0.28) ? 2 : 1) : 0;
      for (let e = 0; e < events; e++) {
        // L-03 runs its gear hobber hard: more, longer mechanical stops.
        const heavy = line.id === "L-03" && rng.chance(0.45);
        const minutes = heavy ? rng.int(45, 110) : rng.int(8, 62);
        const cause = heavy ? "mechanical" : rng.pick(causes);
        const machine = heavy ? lineMachines[1] : rng.pick(lineMachines);
        downtimeEvents.push({
          id: uid("DT"),
          machineId: machine.id,
          lineId: line.id,
          start: ts + 6 * HOUR + rng.int(0, plannedMin - 120) * MIN,
          minutes,
          cause,
        });
        downtimeMin += minutes;
      }
      const runtimeMin = plannedMin - downtimeMin;
      // Gentle upward drift in performance over the period.
      const drift = ((HISTORY_DAYS - d) / HISTORY_DAYS) * 0.03;
      const perf = Math.min(0.985, rng.float(0.86, 0.95) + drift);
      const actual = Math.round((line.nominalRate * runtimeMin * perf) / 60);
      const rejectRate = line.id === "L-03" ? rng.float(0.022, 0.044) : rng.float(0.009, 0.026);
      dailyStats.push({
        date: dayKey(ts),
        ts,
        lineId: line.id,
        productId: line.productId,
        planned: Math.round((line.nominalRate * plannedMin * 0.9) / 60),
        actual,
        rejected: Math.round(actual * rejectRate),
        plannedMin,
        downtimeMin,
      });
    }
  }

  /* Work orders ---------------------------------------------------- */
  const workOrders: WorkOrder[] = [];
  let woNum = 5100;
  const supervisorOf = (lineId: string) => lines.find((x) => x.id === lineId)!.supervisorId;
  const addWo = (w: Omit<WorkOrder, "id" | "supervisorId" | "createdAt"> & { supervisorId?: string; createdAt?: number }) => {
    const wo: WorkOrder = {
      id: `WO-${++woNum}`,
      supervisorId: w.supervisorId ?? (w.lineId ? supervisorOf(w.lineId) : "TM-03"),
      createdAt: w.createdAt ?? w.plannedStart - rng.int(3, 9) * DAY,
      ...w,
    };
    workOrders.push(wo);
    return wo;
  };
  const priorities = ["low", "medium", "medium", "high", "high", "urgent"] as const;

  // Completed history: 5 per line across the last 30 days.
  for (let k = 5; k >= 1; k--) {
    for (const line of lines) {
      const hours = rng.int(11, 24);
      const qty = Math.round((line.nominalRate * hours * 0.9) / 10) * 10;
      const start = today - (k * 5 + rng.int(0, 2)) * DAY + 6 * HOUR;
      const end = start + hours * HOUR * 1.6;
      addWo({
        productId: line.productId,
        lineId: line.id,
        plannedQty: qty,
        completedQty: qty,
        // One L-03 lot is seeded above the 3.6% release limit so the quality workflow has a failed inspection.
        rejectedQty: Math.round(qty * (line.id === "L-03" ? (k === 3 ? rng.float(0.022, 0.04) * 0 + 0.039 : rng.float(0.022, 0.04)) : rng.float(0.008, 0.024))),
        priority: rng.pick(priorities),
        plannedStart: start,
        plannedEnd: end,
        dueDate: end + rng.int(0, 2) * DAY,
        status: "completed",
        startedAt: start + rng.int(0, 50) * MIN,
        completedAt: end - rng.int(-90, 240) * MIN,
      });
    }
  }
  // Cancelled.
  addWo({ productId: "P4", lineId: "L-04", plannedQty: 1800, completedQty: 0, rejectedQty: 0, priority: "low", plannedStart: today - 9 * DAY + 6 * HOUR, plannedEnd: today - 8 * DAY, dueDate: today - 6 * DAY, status: "cancelled", notes: "Customer order withdrawn." });
  addWo({ productId: "P6", lineId: "L-06", plannedQty: 900, completedQty: 140, rejectedQty: 6, priority: "medium", plannedStart: today - 13 * DAY + 6 * HOUR, plannedEnd: today - 12 * DAY, dueDate: today - 10 * DAY, status: "cancelled", notes: "Pattern revision; superseded.", startedAt: today - 13 * DAY + 7 * HOUR });

  // Active: one per producing line. completedQty includes the current shift output.
  const active: [string, number, number, (typeof priorities)[number], number][] = [
    // line, planned qty, produced before this shift, priority, hours until planned end
    ["L-01", 620, 196, "high", 7],
    ["L-02", 1150, 412, "medium", 13],
    ["L-03", 340, 148, "urgent", 6],
    ["L-05", 2400, 986, "high", 12],
  ];
  for (const [lineId, qty, before, priority, hoursLeft] of active) {
    const line = lines.find((x) => x.id === lineId)!;
    const done = before + line.shiftOutput;
    addWo({
      productId: line.productId,
      lineId,
      plannedQty: qty,
      completedQty: done,
      rejectedQty: Math.round(done * (lineId === "L-03" ? 0.033 : 0.017)),
      priority,
      plannedStart: today - DAY + 14 * HOUR,
      plannedEnd: DEMO_EPOCH + hoursLeft * HOUR,
      // L-03's order is due before it can finish at the current rate → alert.
      dueDate: lineId === "L-03" ? today + 14 * HOUR : today + (lineId === "L-01" ? 1 : 2) * DAY + 16 * HOUR,
      status: "in_progress",
      startedAt: today - DAY + 14 * HOUR + 12 * MIN,
    });
  }
  // Paused on the line that is under maintenance.
  {
    const line = lines.find((x) => x.id === "L-04")!;
    const done = 1310 + line.shiftOutput;
    addWo({ productId: "P4", lineId: "L-04", plannedQty: 3600, completedQty: done, rejectedQty: Math.round(done * 0.015), priority: "medium", plannedStart: today - DAY + 6 * HOUR, plannedEnd: today + DAY + 2 * HOUR, dueDate: today + 2 * DAY + 16 * HOUR, status: "paused", startedAt: today - DAY + 6 * HOUR + 20 * MIN, notes: "Paused: solenoid press MX-0403 under corrective maintenance." });
  }
  // Scheduled. The two L-02 orders overlap on purpose (planning conflict demo).
  const sched: [string, number, (typeof priorities)[number], number, number][] = [
    // line, qty, priority, start offset hours from today 00:00, duration hours
    ["L-01", 540, "medium", 24 + 6, 15],
    ["L-01", 480, "low", 48 + 6, 13],
    ["L-02", 900, "high", 24 + 2, 17],
    ["L-02", 720, "urgent", 24 + 14, 13],
    ["L-03", 280, "medium", 24 + 6, 11],
    ["L-04", 2700, "high", 48 + 6, 32],
    ["L-05", 1900, "medium", 24, 17],
    ["L-06", 760, "high", 14, 15],
    ["L-06", 880, "medium", 48 + 6, 17],
  ];
  for (const [lineId, qty, priority, startH, dur] of sched) {
    const line = lines.find((x) => x.id === lineId)!;
    const start = today + startH * HOUR;
    addWo({ productId: line.productId, lineId, plannedQty: qty, completedQty: 0, rejectedQty: 0, priority, plannedStart: start, plannedEnd: start + dur * HOUR, dueDate: startOfDay(start + dur * HOUR) + (1 + rng.int(0, 2)) * DAY + 16 * HOUR, status: "scheduled", createdAt: today - rng.int(1, 6) * DAY });
  }
  // Drafts: not yet assigned to a line.
  for (const [productId, qty, priority] of [["P1", 400, "medium"], ["P3", 220, "high"], ["P5", 1500, "low"]] as const) {
    const start = today + 4 * DAY + 6 * HOUR;
    addWo({ productId, lineId: null, plannedQty: qty, completedQty: 0, rejectedQty: 0, priority, plannedStart: start, plannedEnd: start + 14 * HOUR, dueDate: today + 8 * DAY + 16 * HOUR, status: "draft", createdAt: today - rng.int(0, 2) * DAY + 8 * HOUR });
  }

  /* Inventory ------------------------------------------------------ */
  const zoneWarehouse = new Map(zoneDefs.map((z) => [z[0], z[1]]));
  const items: InventoryItem[] = itemDefs.map(([sku, en, ar, category, quantity, unit, zoneId, reorderLevel, unitCost, unitsPerPallet, supplierId, productId]) => ({
    id: sku,
    sku,
    name: l(en, ar),
    category,
    quantity,
    unit,
    warehouseId: zoneWarehouse.get(zoneId)!,
    zoneId,
    reorderLevel,
    unitCost,
    unitsPerPallet,
    supplierId,
    productId,
  }));

  const zones: WarehouseZone[] = zoneDefs.map(([id, warehouseId, en, ar, kind, categories, x, y, w, h, fill]) => {
    const used = items.filter((i) => i.zoneId === id).reduce((s, i) => s + Math.ceil(i.quantity / i.unitsPerPallet), 0);
    return {
      id,
      warehouseId,
      code: id,
      name: l(en, ar),
      kind,
      categories,
      capacity: fill > 0 ? Math.max(12, Math.round(used / fill / 2) * 2) : kind === "dock" ? 48 : 60,
      x, y, w, h,
    };
  });

  // Movement history: walk backwards from today's balance so balances reconcile.
  const movements: StockMovement[] = [];
  for (const item of items) {
    let balance = item.quantity;
    const count = rng.int(5, 9);
    const step = Math.max(1, Math.round(Math.max(item.reorderLevel, item.quantity, 4) * 0.12));
    let at = DEMO_EPOCH - rng.int(2, 30) * HOUR;
    const whMgr = warehouses.find((w) => w.id === item.warehouseId)!.managerId;
    for (let k = 0; k < count; k++) {
      const inbound = item.category === "finished" || item.category === "wip" ? rng.chance(0.6) : rng.chance(0.38);
      let qty = Math.max(1, Math.round(step * rng.float(0.4, 1.6)));
      let type: StockMovement["type"];
      if (inbound) {
        type = item.category === "finished" || item.category === "wip" ? "production" : "receipt";
      } else {
        type = rng.chance(0.08) ? "scrap" : "issue";
        qty = -qty;
      }
      // Balance before this movement must not be negative.
      if (balance - qty < 0) qty = balance;
      movements.push({
        id: uid("MV"),
        itemId: item.id,
        at,
        type,
        qty,
        balance,
        byId: type === "production" ? "TM-03" : whMgr,
      });
      balance -= qty;
      at -= rng.int(14, 96) * HOUR;
    }
  }
  movements.sort((a, b) => b.at - a.at);

  /* Purchase orders ------------------------------------------------ */
  const purchaseOrders: PurchaseOrder[] = [];
  let poNum = 7800;
  const cost = (id: string) => items.find((i) => i.id === id)!.unitCost;
  const po = (supplierId: string, status: PurchaseOrder["status"], createdDaysAgo: number, expectedInDays: number, lns: [string, number, number][], notes?: string) => {
    purchaseOrders.push({
      id: `PO-${++poNum}`,
      supplierId,
      status,
      createdAt: today - createdDaysAgo * DAY + 10 * HOUR,
      expectedDate: today + expectedInDays * DAY,
      requestedById: "TM-13",
      approvedById: ["approved", "ordered", "partial", "received"].includes(status) ? "TM-01" : undefined,
      lines: lns.map(([itemId, qty, receivedQty]) => ({ itemId, qty, receivedQty, unitCost: cost(itemId) })),
      notes,
    });
  };
  po("SUP-01", "received", 48, -34, [["RAW-2001", 12000, 12000], ["RAW-2002", 4000, 4000]]);
  po("SUP-03", "received", 44, -20, [["CMP-1003", 1500, 1500], ["CMP-1004", 1500, 1500]]);
  po("SUP-05", "received", 37, -28, [["CMP-1005", 2400, 2400], ["CMP-1010", 6000, 6000]]);
  po("SUP-02", "received", 31, -15, [["CMP-1001", 900, 900], ["CMP-1006", 3000, 3000]]);
  po("SUP-07", "received", 26, -20, [["PKG-4002", 5000, 5000], ["PKG-4005", 400, 400]]);
  po("SUP-04", "received", 22, -3, [["CMP-1008", 3000, 3000]]);
  po("SUP-08", "partial", 17, -2, [["RAW-2004", 30000, 18000], ["SPR-5005", 40, 40]], "Balance of copper wire rescheduled by supplier.");
  po("SUP-02", "partial", 15, 1, [["RAW-2006", 16000, 9600], ["CMP-1011", 2500, 2500]]);
  po("SUP-04", "ordered", 12, 3, [["CMP-1007", 6000, 0], ["CMP-1009", 4000, 0]], "Expedite requested: CMP-1007 is out of stock.");
  po("SUP-06", "ordered", 9, 4, [["CMP-1002", 4000, 0], ["SPR-5003", 48, 0]]);
  po("SUP-01", "ordered", 6, 5, [["RAW-2001", 10000, 0]]);
  po("SUP-08", "approved", 4, 8, [["RAW-2003", 3000, 0], ["RAW-2008", 600, 0]]);
  po("SUP-02", "pending", 2, 13, [["RAW-2007", 9000, 0], ["RAW-2006", 8000, 0]], "Foundry sand below reorder level.");
  po("SUP-07", "pending", 1, 6, [["PKG-4003", 240, 0], ["PKG-4001", 300, 0]]);
  po("SUP-05", "pending", 1, 9, [["SPR-5001", 2, 0], ["SPR-5002", 20, 0]], "Spindle cartridge at minimum; second unit requested as contingency.");
  po("SUP-03", "draft", 0, 22, [["CMP-1003", 1200, 0], ["SPR-5004", 10, 0]]);
  po("SUP-04", "draft", 0, 19, [["CMP-1008", 2500, 0]]);
  po("SUP-06", "cancelled", 20, -4, [["CMP-1002", 2000, 0]], "Cancelled after repeated delivery slips; re-issued as a new order.");

  /* Shipments ------------------------------------------------------ */
  const shipments: Shipment[] = (
    [
      ["SH-9041", "inbound", "WH-H1", "Apex Sealing Technologies", "NorthSea Freight", -3, "delayed", 6, "PO-7810"],
      ["SH-9042", "inbound", "WH-H1", "Brightline Electronics", "TransAsia Cargo", 5, "in_transit", 14, "PO-7809"],
      ["SH-9043", "inbound", "WH-H1", "Nordhaven Steel & Alloys", "NorthSea Freight", 30, "in_transit", 22, "PO-7811"],
      ["SH-9044", "inbound", "WH-M1", "Castellan Foundry Group", "Iberia Road Lines", 2, "arrived", 18, "PO-7808"],
      ["SH-9045", "inbound", "WH-M1", "Gulf Industrial Supplies", "Meridian Logistics", 52, "scheduled", 9, "PO-7807"],
      ["SH-9046", "outbound", "WH-H2", "Vantor Hydraulics GmbH", "EuroLink Transport", 1.5, "loading", 16, undefined],
      ["SH-9047", "outbound", "WH-H2", "Kairos Robotics Ltd", "EuroLink Transport", 7, "scheduled", 12, undefined],
      ["SH-9048", "outbound", "WH-H2", "Solveig Wind Systems", "NorthSea Freight", -2.4, "dispatched", 20, undefined],
      ["SH-9049", "outbound", "WH-M1", "Orbis Drive Technologies", "Meridian Logistics", 4, "loading", 10, undefined],
      ["SH-9050", "outbound", "WH-M1", "Altamira Pumps S.A.", "Iberia Road Lines", 28, "scheduled", 8, undefined],
      ["SH-9051", "outbound", "WH-H2", "Dunmore Agricultural", "EuroLink Transport", -19, "dispatched", 14, undefined],
    ] as const
  ).map(([id, direction, warehouseId, party, carrier, etaH, status, pallets, poId]) => ({
    id, direction, warehouseId, party, carrier, eta: DEMO_EPOCH + etaH * HOUR, status, pallets, poId,
  }));

  /* Quality inspections ------------------------------------------- */
  const inspections: QualityInspection[] = [];
  let qiNum = 3300;
  const defectCats: DefectCategory[] = ["dimensional", "surface", "assembly", "material", "functional", "cosmetic"];
  const splitDefects = (rejected: number, lineId: string | null): Defect[] => {
    if (rejected <= 0) return [];
    // Each line has a characteristic dominant defect.
    const lead: DefectCategory =
      lineId === "L-03" ? "dimensional" : lineId === "L-05" ? "functional" : lineId === "L-06" ? "surface" : lineId === "L-04" ? "dimensional" : "assembly";
    const first = Math.max(1, Math.round(rejected * rng.float(0.45, 0.65)));
    const out: Defect[] = [{ category: lead, qty: Math.min(first, rejected) }];
    let rest = rejected - out[0].qty;
    const others = defectCats.filter((c) => c !== lead);
    while (rest > 0) {
      const cat = rng.pick(others);
      const q = Math.min(rest, Math.max(1, Math.round(rest * rng.float(0.4, 1))));
      const ex = out.find((x) => x.category === cat);
      if (ex) ex.qty += q;
      else out.push({ category: cat, qty: q });
      rest -= q;
    }
    return out;
  };
  const inspectorOf = (lineId: string | null) => (lineId === "L-05" || lineId === "L-06" ? "TM-09" : "TM-08");
  for (const wo of workOrders) {
    if (wo.status === "completed") {
      const rate = wo.rejectedQty / wo.plannedQty;
      const failed = rate > 0.036;
      const conditional = !failed && rate > 0.03;
      inspections.push({
        id: `QI-${++qiNum}`,
        workOrderId: wo.id,
        productId: wo.productId,
        inspectorId: inspectorOf(wo.lineId),
        date: (wo.completedAt ?? wo.plannedEnd) + rng.int(1, 5) * HOUR,
        inspectedQty: wo.completedQty,
        passedQty: wo.completedQty - wo.rejectedQty,
        rejectedQty: wo.rejectedQty,
        defects: splitDefects(wo.rejectedQty, wo.lineId),
        status: failed ? "failed" : conditional ? "conditional" : "passed",
        notes: failed
          ? "Reject rate above the 3.6% release limit. Lot quarantined pending review."
          : conditional
            ? "Released under concession; reject rate above the 3.0% watch limit."
            : "Lot released. Results within control limits.",
        correctiveAction: failed || conditional
          ? {
              description: failed
                ? "Re-verify tool offsets and fixture clamping on the 5-axis milling center; 100% re-inspection of the quarantined lot."
                : "Review tool-wear compensation interval and update the control plan.",
              assigneeId: "TM-04",
              dueDate: (wo.completedAt ?? wo.plannedEnd) + 5 * DAY,
              status: (wo.completedAt ?? 0) < today - 12 * DAY ? "resolved" : "open",
              resolvedAt: (wo.completedAt ?? 0) < today - 12 * DAY ? (wo.completedAt ?? 0) + 4 * DAY : undefined,
            }
          : undefined,
      });
    } else if (wo.status === "in_progress" || wo.status === "paused") {
      // In-process inspection of the units finished before the current shift.
      const line = lines.find((x) => x.id === wo.lineId)!;
      const inspected = wo.completedQty - line.shiftOutput;
      const rejected = wo.rejectedQty - line.shiftRejected > 0 ? wo.rejectedQty - line.shiftRejected : Math.round(inspected * 0.015);
      inspections.push({
        id: `QI-${++qiNum}`,
        workOrderId: wo.id,
        productId: wo.productId,
        inspectorId: inspectorOf(wo.lineId),
        date: today + 6 * HOUR + rng.int(10, 90) * MIN,
        inspectedQty: inspected,
        passedQty: inspected - rejected,
        rejectedQty: rejected,
        defects: splitDefects(rejected, wo.lineId),
        status: "in_progress",
        notes: "In-process inspection; first-shift units verified, lot still running.",
      });
    }
  }
  // Scheduled first-article inspections for the next orders.
  for (const wo of workOrders.filter((w) => w.status === "scheduled").slice(0, 3)) {
    inspections.push({
      id: `QI-${++qiNum}`,
      workOrderId: wo.id,
      productId: wo.productId,
      inspectorId: inspectorOf(wo.lineId),
      date: wo.plannedStart + 2 * HOUR,
      inspectedQty: 0,
      passedQty: 0,
      rejectedQty: 0,
      defects: [],
      status: "scheduled",
      notes: "First-article inspection planned at order start.",
    });
  }

  /* Maintenance orders -------------------------------------------- */
  const maintenanceOrders: MaintenanceOrder[] = [];
  let moNum = 6100;
  const mo = (machineId: string, type: MaintenanceOrder["type"], en: string, ar: string, priority: MaintenanceOrder["priority"], technicianId: string | null, schedOffsetH: number, hours: number, status: MaintenanceOrder["status"], progress: number, costUsd: number) => {
    const scheduledDate = today + schedOffsetH * HOUR;
    maintenanceOrders.push({
      id: `MO-${++moNum}`,
      machineId, type, description: l(en, ar), priority, technicianId, scheduledDate,
      estimatedHours: hours, status, progress, cost: costUsd,
      createdAt: scheduledDate - rng.int(2, 8) * DAY,
      completedAt: status === "completed" ? scheduledDate + hours * HOUR : undefined,
    });
  };
  // History (completed).
  const techs = ["TM-10", "TM-11", "TM-12"];
  const pmTexts: [string, string][] = [
    ["Quarterly preventive service: lubrication, belt tension, safety interlock test.", "صيانة وقائية ربع سنوية: تشحيم، شدّ السيور، اختبار أقفال الأمان."],
    ["Replace worn guide rails and recalibrate axis backlash.", "استبدال مجاري التوجيه المتآكلة وإعادة معايرة خلوص المحاور."],
    ["Coolant system flush and filter replacement.", "تنظيف نظام التبريد واستبدال الفلاتر."],
    ["Sensor calibration and firmware verification.", "معايرة الحساسات والتحقق من البرمجيات الثابتة."],
  ];
  machines.forEach((mc, i) => {
    if (i % 2 === 0) {
      const [en, ar] = pmTexts[i % pmTexts.length];
      const tech = mc.factoryId === "MRD" ? "TM-12" : techs[i % 2];
      mo(mc.id, i % 6 === 0 ? "corrective" : "preventive", en, ar, i % 6 === 0 ? "high" : "medium", tech, Math.round((mc.lastMaintenance - today) / HOUR) + 7, i % 6 === 0 ? 6 : 3, "completed", 100, i % 6 === 0 ? rng.int(1400, 3900) : rng.int(280, 820));
    }
  });
  // Open work.
  mo("MX-0403", "corrective", "Solenoid press ram not returning to home position; hydraulic seal suspected.", "مكبس الملف اللولبي لا يعود إلى موضع البداية؛ يُشتبه في مانع التسرب الهيدروليكي.", "urgent", "TM-10", 8.2, 5, "in_progress", 45, 2350);
  mo("MX-0302", "preventive", "Overdue quarterly service: spindle bearing inspection and coolant flush.", "صيانة ربع سنوية متأخرة: فحص محامل عمود الدوران وتنظيف التبريد.", "high", "TM-11", -6 * 24 + 8, 4, "scheduled", 0, 690);
  mo("MX-0302", "predictive", "Spindle temperature trending above baseline; inspect bearing preload.", "حرارة عمود الدوران في اتجاه تصاعدي فوق خط الأساس؛ فحص التحميل المسبق للمحامل.", "urgent", null, 2, 3, "requested", 0, 1200);
  mo("MX-0201", "preventive", "Overdue winding head service and tension calibration.", "صيانة متأخرة لرأس اللف ومعايرة الشدّ.", "medium", "TM-11", -3 * 24 + 14, 3, "scheduled", 0, 540);
  mo("MX-0603", "corrective", "Shot blasting unit tripped on drive overload; unit offline.", "وحدة السفع بالخردق توقفت بسبب زيادة حمل المحرك؛ الوحدة خارج الخدمة.", "high", "TM-12", 5, 6, "scheduled", 0, 1850);
  mo("MX-0102", "preventive", "Quarterly service: gripper wear check, axis greasing, safety scanner test.", "صيانة ربع سنوية: فحص تآكل الملقط، تشحيم المحاور، اختبار ماسح الأمان.", "medium", "TM-10", 4 * 24 + 6, 3, "scheduled", 0, 460);
  mo("MX-0501", "preventive", "Quarterly service: nozzle replacement and feeder calibration.", "صيانة ربع سنوية: استبدال الفوهات ومعايرة المغذّيات.", "medium", "TM-12", 7 * 24 + 6, 4, "scheduled", 0, 980);
  mo("MX-0303", "predictive", "Furnace heating element resistance drifting; plan element replacement.", "مقاومة عنصر التسخين في الفرن تنحرف؛ التخطيط لاستبدال العنصر.", "medium", null, 9 * 24, 8, "requested", 0, 4200);
  mo("MX-0104", "corrective", "Carton erector jams intermittently; adjust vacuum cups.", "آلة تشكيل الكراتين تتعطل بشكل متقطع؛ ضبط أكواب الشفط.", "low", null, 3 * 24, 2, "requested", 0, 180);

  /* Alerts --------------------------------------------------------- */
  const P = (id: string) => products.find((p) => p.id === id)!;
  const I = (id: string) => items.find((i) => i.id === id)!;
  const failedQi = inspections.find((q) => q.status === "failed" && q.correctiveAction?.status === "resolved") ?? inspections.find((q) => q.status !== "passed") ?? inspections[0];
  const alerts: Alert[] = [
    {
      id: "AL-401", severity: "critical", status: "open", category: "maintenance",
      title: { key: "alert.tempHigh.title", params: { machine: m("MX-0302").name } },
      detail: { key: "alert.tempHigh.detail", params: { machine: "MX-0302", temp: 76, limit: 70 } },
      entity: { type: "machine", id: "MX-0302" }, createdAt: DEMO_EPOCH - 26 * MIN,
    },
    {
      id: "AL-402", severity: "critical", status: "open", category: "inventory",
      title: { key: "alert.stockOut.title", params: { item: I("CMP-1007").name } },
      detail: { key: "alert.stock.detail", params: { sku: "CMP-1007", qty: 0, unit: "pcs", reorder: 2000 } },
      entity: { type: "item", id: "CMP-1007" }, createdAt: DEMO_EPOCH - 3 * HOUR, assigneeId: "TM-13",
    },
    {
      id: "AL-403", severity: "critical", status: "acknowledged", category: "maintenance",
      title: { key: "alert.machineDown.title", params: { machine: m("MX-0403").name } },
      detail: { key: "alert.machineDown.detail", params: { machine: "MX-0403", line: "L-04", order: "MO-6113" } },
      entity: { type: "machine", id: "MX-0403" }, createdAt: DEMO_EPOCH - 92 * MIN, assigneeId: "TM-10", acknowledgedById: "TM-04",
    },
    {
      id: "AL-404", severity: "warning", status: "open", category: "production",
      title: { key: "alert.woBehind.title", params: { id: "WO-5135" } },
      detail: { key: "alert.woBehind.detail", params: { id: "WO-5135", product: P("P3").name, line: "L-03" } },
      entity: { type: "workOrder", id: "WO-5135" }, createdAt: DEMO_EPOCH - 48 * MIN,
    },
    {
      id: "AL-405", severity: "warning", status: "open", category: "inventory",
      title: { key: "alert.stockCritical.title", params: { item: I("CMP-1002").name } },
      detail: { key: "alert.stock.detail", params: { sku: "CMP-1002", qty: 610, unit: "pcs", reorder: 1500 } },
      entity: { type: "item", id: "CMP-1002" }, createdAt: DEMO_EPOCH - 5 * HOUR,
    },
    {
      id: "AL-406", severity: "warning", status: "open", category: "maintenance",
      title: { key: "alert.maintOverdue.title", params: { machine: m("MX-0201").name } },
      detail: { key: "alert.maintOverdue.detail", params: { machine: "MX-0201", days: 3 } },
      entity: { type: "machine", id: "MX-0201" }, createdAt: DEMO_EPOCH - 27 * HOUR,
    },
    {
      id: "AL-407", severity: "warning", status: "acknowledged", category: "maintenance",
      title: { key: "alert.machineOffline.title", params: { machine: m("MX-0603").name } },
      detail: { key: "alert.machineOffline.detail", params: { machine: "MX-0603", line: "L-06" } },
      entity: { type: "machine", id: "MX-0603" }, createdAt: DEMO_EPOCH - 71 * MIN, assigneeId: "TM-12", acknowledgedById: "TM-05",
    },
    {
      id: "AL-408", severity: "info", status: "open", category: "logistics",
      title: { key: "alert.shipDelayed.title", params: { id: "SH-9041" } },
      detail: { key: "alert.shipDelayed.detail", params: { id: "SH-9041", party: "Apex Sealing Technologies", po: "PO-7810" } },
      entity: { type: "po", id: "PO-7810" }, createdAt: DEMO_EPOCH - 3 * HOUR,
    },
    {
      id: "AL-409", severity: "info", status: "open", category: "maintenance",
      title: { key: "alert.pmApproaching.title", params: { machine: m("MX-0102").name } },
      detail: { key: "alert.pmApproaching.detail", params: { machine: "MX-0102", days: 4 } },
      entity: { type: "machine", id: "MX-0102" }, createdAt: DEMO_EPOCH - 8 * HOUR,
    },
    {
      id: "AL-410", severity: "warning", status: "resolved", category: "quality",
      title: { key: "alert.qualityFail.title", params: { id: failedQi.id } },
      detail: { key: "alert.qualityFail.detail", params: { id: failedQi.id } },
      entity: { type: "inspection", id: failedQi.id }, createdAt: DEMO_EPOCH - 4 * DAY, assigneeId: "TM-08", acknowledgedById: "TM-08", resolvedAt: DEMO_EPOCH - 2 * DAY,
    },
  ];

  /* Activity feed + notifications --------------------------------- */
  const lineName = (id: string) => lines.find((x) => x.id === id)!.name;
  const lastDone = workOrders.filter((w) => w.status === "completed").sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const lastQi = inspections.find((q) => q.workOrderId === lastDone[0].id) ?? inspections[0];
  const activity: ActivityEvent[] = (
    [
      [6, "production", "success", { key: "evt.targetPace", params: { line: lineName("L-05"), pct: 102 } }, { type: "line", id: "L-05" }, "TM-05"],
      [14, "system", "info", { key: "evt.alertAck", params: { id: "AL-403" } }, { type: "machine", id: "MX-0403" }, "TM-04"],
      [26, "maintenance", "critical", { key: "evt.machineStatus", params: { machine: "MX-0302", status: "@mstatus.warning" } }, { type: "machine", id: "MX-0302" }, undefined],
      [33, "quality", "success", { key: "evt.inspPassed", params: { id: lastQi.id, wo: lastDone[0].id } }, { type: "inspection", id: lastQi.id }, "TM-08"],
      [48, "logistics", "success", { key: "evt.shipReceived", params: { id: "SH-9044", party: "Castellan Foundry Group" } }, { type: "po", id: "PO-7808" }, "TM-07"],
      [71, "production", "warning", { key: "evt.lineStatus", params: { line: lineName("L-06"), status: "@lstatus.changeover" } }, { type: "line", id: "L-06" }, "TM-05"],
      [88, "maintenance", "info", { key: "evt.maintStarted", params: { id: "MO-6113", machine: "MX-0403" } }, { type: "maintenance", id: "MO-6113" }, "TM-10"],
      [92, "production", "warning", { key: "evt.woPaused", params: { id: "WO-5137" } }, { type: "workOrder", id: "WO-5137" }, "TM-04"],
      [126, "procurement", "info", { key: "evt.poSubmitted", params: { id: "PO-7815" } }, { type: "po", id: "PO-7815" }, "TM-13"],
      [144, "logistics", "info", { key: "evt.shipDispatched", params: { id: "SH-9048", party: "Solveig Wind Systems" } }, { type: "warehouse", id: "WH-H2" }, "TM-06"],
      [180, "inventory", "critical", { key: "evt.stockOut", params: { item: I("CMP-1007").name } }, { type: "item", id: "CMP-1007" }, undefined],
      [222, "production", "info", { key: "evt.lineStarted", params: { line: lineName("L-01") } }, { type: "line", id: "L-01" }, "TM-03"],
      [300, "inventory", "warning", { key: "evt.stockCritical", params: { item: I("CMP-1002").name } }, { type: "item", id: "CMP-1002" }, undefined],
      [480, "maintenance", "info", { key: "evt.maintDue", params: { machine: "MX-0102", days: 4 } }, { type: "machine", id: "MX-0102" }, undefined],
      [690, "production", "success", { key: "evt.woCompleted", params: { id: lastDone[0].id, qty: lastDone[0].completedQty } }, { type: "workOrder", id: lastDone[0].id }, "TM-04"],
      [1140, "logistics", "info", { key: "evt.shipDispatched", params: { id: "SH-9051", party: "Dunmore Agricultural" } }, { type: "warehouse", id: "WH-H2" }, "TM-06"],
      [1320, "procurement", "success", { key: "evt.poApproved", params: { id: "PO-7812" } }, { type: "po", id: "PO-7812" }, "TM-01"],
      [1500, "production", "success", { key: "evt.woCompleted", params: { id: lastDone[1].id, qty: lastDone[1].completedQty } }, { type: "workOrder", id: lastDone[1].id }, "TM-03"],
    ] as const
  ).map(([minsAgo, category, severity, msg, entity, actorId], i) => ({
    id: `EV-${String(900 - i).padStart(4, "0")}`,
    at: DEMO_EPOCH - minsAgo * MIN,
    category,
    severity,
    msg: msg as ActivityEvent["msg"],
    entity: entity as ActivityEvent["entity"],
    actorId,
  }));

  const notifications: Notification[] = (
    [
      [6, "production", "success", { key: "evt.targetPace", params: { line: lineName("L-05"), pct: 102 } }, { type: "line", id: "L-05" }, false],
      [26, "maintenance", "critical", { key: "alert.tempHigh.title", params: { machine: m("MX-0302").name } }, { type: "machine", id: "MX-0302" }, false],
      [48, "logistics", "success", { key: "evt.shipReceived", params: { id: "SH-9044", party: "Castellan Foundry Group" } }, { type: "po", id: "PO-7808" }, false],
      [88, "maintenance", "info", { key: "evt.machineStatus", params: { machine: "MX-0403", status: "@mstatus.maintenance" } }, { type: "machine", id: "MX-0403" }, false],
      [126, "procurement", "info", { key: "evt.poSubmitted", params: { id: "PO-7815" } }, { type: "po", id: "PO-7815" }, false],
      [180, "inventory", "critical", { key: "evt.stockOut", params: { item: I("CMP-1007").name } }, { type: "item", id: "CMP-1007" }, true],
      [300, "inventory", "warning", { key: "evt.stockCritical", params: { item: I("CMP-1002").name } }, { type: "item", id: "CMP-1002" }, true],
      [690, "production", "success", { key: "evt.woCompleted", params: { id: lastDone[0].id, qty: lastDone[0].completedQty } }, { type: "workOrder", id: lastDone[0].id }, true],
      [1320, "procurement", "success", { key: "evt.poApproved", params: { id: "PO-7812" } }, { type: "po", id: "PO-7812" }, true],
      [2900, "quality", "warning", { key: "alert.qualityFail.title", params: { id: failedQi.id } }, { type: "inspection", id: failedQi.id }, true],
    ] as const
  ).map(([minsAgo, category, severity, msg, entity, read], i) => ({
    id: `NT-${String(500 - i).padStart(4, "0")}`,
    category,
    severity,
    msg: msg as Notification["msg"],
    entity: entity as Notification["entity"],
    at: DEMO_EPOCH - minsAgo * MIN,
    read,
  }));

  return {
    factories,
    products,
    shifts,
    lines: lines.map((x) => ({ ...x })),
    machines,
    workOrders,
    downtimeEvents,
    dailyStats,
    items,
    movements,
    warehouses,
    zones,
    shipments,
    suppliers,
    purchaseOrders,
    inspections,
    maintenanceOrders,
    team,
    alerts,
    notifications,
    activity,
  };
}
