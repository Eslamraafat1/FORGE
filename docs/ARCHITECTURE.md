# FORGE — architecture & conventions

FORGE is a demo industrial operations platform. **All data is fictional and simulated**; nothing connects to real equipment or external systems. The UI must say so wherever it shows "live" or sensor-like values.

Stack: Next.js 16 (App Router) · React 19 · TypeScript 6 (strict) · Tailwind CSS 4 · Zustand 5 · Recharts 3 · motion 14 · three / @react-three/fiber / drei · lucide-react · zod.

## Layout

```
src/
  app/                 routes. (app)/ group = everything inside the shell
    (app)/<route>/page.tsx   server file: exports metadata, renders a client View
  views/<area>/        client views ("use client"), one per route + area components
  components/ui/       primitives.tsx · overlay.tsx · toast.tsx · status.tsx · page.tsx
  components/table/    DataTable.tsx (reusable advanced table)
  components/charts/   kit.tsx (ChartPanel, ChartTooltip, useChartProps, Sparkline, RankBars)
  components/shell/    AppShell, Sidebar, Topbar, MobileNav, CommandPalette, NotificationCenter, nav.ts
  domain/types.ts      every entity interface (ForgeData = whole dataset)
  domain/rules.ts      pure business rules (stock status, WO transitions, OEE, telemetry…)
  data/seed.ts         deterministic seed (createSeed), anchored to DEMO_EPOCH
  store/store.ts       useForge — single source of truth + all mutating actions
  store/selectors.ts   pure derived metrics (live shift figures, history aggregation…)
  store/prefs.ts       usePrefs — theme, language, numerals, motion, sidebar
  i18n/                useT() + dictionaries (dict/*.ts, EN + AR, type-checked)
  lib/                 format.ts (useFmt) · time.ts · rng.ts · csv.ts · permissions.ts · routes.ts
scripts/check-data.mts dataset consistency check (npx tsx scripts/check-data.mts)
```

## Data rules

- **One source of truth**: `useForge`. Never keep a private copy of entity data in a view. Never mutate; call store actions. Read the action list in `ForgeState` (store.ts) — they already implement the cascades (stock alerts, line/machine status, backflush on WO completion, activity log, notifications).
- Actions return `Result` (`{ok:true,id?}` | `{ok:false,error:Msg}`). Run them through `useAction()` from `components/ui/toast` so failures surface as toasts:
  `const run = useAction(); if (run(completeX(id), t("x.done"))) close();`
- **Zustand selectors must return stable references.** Select raw slices (`useForge(s => s.workOrders)`) or primitives, then derive with `useMemo`. Never `useForge(s => s.x.filter(...))` (new array each time → infinite loop).
- Time: all timestamps are epoch ms on the **simulated clock** `useForge(s => s.now)` (starts at `DEMO_EPOCH`, 2026-11-12 09:42, advances 1 simulated minute every 3 s while the simulation runs). Never use `Date.now()` / `new Date()` for business logic, never `Math.random()`. "Today"/"overdue"/"in 3 days" are relative to `now`.
- Telemetry (temperature, speed, load) = `machineTelemetry(machine, tick)` from domain/rules — pure function of `useForge(s => s.tick)`. Always label it simulated (`<SimBadge />`).
- History: `dailyStats` (one row per line per day, 60 days, Sundays closed) + `downtimeEvents`. Aggregate with `filterStats / aggregateByDay / aggregateByLine / aggregateTotal / historyWindow / downtimeInRange` in selectors.ts. Live current-shift numbers: `lineLive(line, now)`, `networkLive(lines, now)`.
- OEE = Availability × Performance × Quality, as defined in `computeOee` (domain/rules.ts). Do not invent other formulas.
- Role gating (demo only, not security): `useCan("wo.manage")` or wrap controls in `<Guard cap="…">` (components/ui/page). Capabilities are listed in lib/permissions.ts.
- Records link to each other via `entityHref({type,id})` (lib/routes.ts) / `<EntityLink entity={…} />`.

## UI conventions

- Views are client components. Start pages with `<Page>` + `<PageHeader>` (components/ui/page).
- Use the kit: `Button, IconButton, Badge, Code, Panel, Kpi, KpiStrip, Progress, SegmentBar, Gauge, Segmented, Tabs, Field, Input, Select, Textarea, Checkbox, EmptyState, Skeleton, DataList, LegendItem, SimBadge, CountUp, Delta, Tooltip` · `Modal, Drawer, ConfirmDialog, Menu, Popover` · `StatusBadge kind=…` · `DataTable` · `Member, Avatar, EntityLink, Guard, useLookup, useCan`.
- Tailwind colour tokens only (no hex in views): surfaces `bg-canvas < bg-base < bg-raised < bg-panel`; text `text-ink / text-ink-2 / text-ink-3`; borders `border-line / border-line-2`; accent `forge` (`bg-forge text-forge-ink`, text on dark = `text-forge-text`); status `ok / amber / info / danger`. Inline styles/SVG use the CSS variables (`var(--forge)`, `var(--ok)`, `var(--c1..c6)`, `var(--line)`, `var(--ink-3)` …). Both themes come for free this way.
- Shape language: sharp, 2–4 px radii (`rounded-sm|md|lg`), hairline borders, no drop shadows on resting surfaces, no gradients, no glassmorphism. Not every metric is a card: prefer `KpiStrip` bands, tables, inline figures. Orange is reserved for the active/primary thing.
- Typography helpers: `.label` (mono uppercase micro-label), `.code` / `<Code>` (identifiers: mono + always LTR), `.num` (tabular numerals — use on every numeric cell), `.display` (condensed headline numbers/titles).
- **RTL**: use logical utilities only — `ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e/rounded-s/rounded-e`. Never `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right`. Directional icons (arrows, chevrons) get `rtl:-scale-x-100`. Do not use `tracking-*` on translatable text (use `.label`).
- **i18n**: no hard-coded user-visible strings. `const { t, td, tm, tl, lang, rtl } = useT()`: `t("key", params)` typed keys · `td(\`wostatus.${x}\`)` dynamic enum keys · `tm(msg)` stored messages · `tl(l10n)` bilingual entity names. Each area owns one dictionary file in `src/i18n/dict/` with `en` and `ar` objects (Arabic is type-checked against English keys — every key needs a real Arabic translation, natural professional MSA). Shared words already exist in `core.en.ts` (`common.*`, enum labels like `wostatus.*`, `priority.*`, `invcat.*`…) — reuse them first.
- Formatting: `const fmt = useFmt()` → `num, pct (ratio in), signedPct, money, compact, compactMoney, date, dateShort, time, dateTime, relative(ts, now), duration(minutes)`. Never `toLocaleString`/`toFixed` in JSX.
- Charts: read the header comment of components/charts/kit.tsx. `ChartPanel` + `useChartProps()` + `ChartTooltip`; series colours from `SERIES`/`lineColor(lineId)` in fixed order; status colours only for states; **no dual y-axes**; legend (`LegendItem`) whenever ≥ 2 series; pass a `table` to `ChartPanel` (accessible data view); `empty` when there is no data.
- Tables: `DataTable` everywhere there is a list. Give columns `mobile` roles (title/subtitle/badge/meta/hidden) so the phone layout is a card list. Numeric columns `align: "end"`.
- Responsive: must work from 360 px to 1920 px with no horizontal page overflow. Grids collapse to one column; wide visuals get their own `overflow-x-auto` container. Touch targets ≥ 34 px.
- Accessibility: semantic elements, labelled controls (`Field` wires label/aria), visible focus, dialogs via `Modal/Drawer`, status never by colour alone.
- Motion: short and precise (≤ 250 ms). `animate-rise`, `animate-fade` utilities, `motion` for presence. Reduced motion is handled globally; for JS-driven animation check `useReducedMotion()` from store/prefs.
- React 19 lint rules are strict: **no `setState` synchronously inside `useEffect`** (derive during render, set in event handlers, or key the component); no refs read during render; hooks deps complete.
- Deep links used by the command palette — honour them: `/work-orders?new=1`, `/maintenance?new=1`, `/procurement?new=1`, `/quality?new=1` open the create dialog; `/maintenance?order=<id>` and `/procurement?po=<id>` open that record; `/reports?report=<id>` selects a report. Read them with `useSearchParams()` (the View must then be wrapped in `<Suspense>` by its page.tsx).

## Route file pattern

```tsx
// src/app/(app)/work-orders/[id]/page.tsx
import type { Metadata } from "next";
import { WorkOrderDetailView } from "@/views/production/WorkOrderDetailView";
export const metadata: Metadata = { title: "Work Order" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkOrderDetailView id={decodeURIComponent(id)} />;
}
```
Detail views render `<EntityNotFound backHref backLabel />` when the id is unknown.
