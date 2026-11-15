"use client";
/**
 * Smart Factory Digital Twin (/factory).
 *
 * The plan is generated from the dataset (layout.ts) and drawn either by the
 * WebGL scene (FactoryScene, lazy-loaded) or by the isometric SVG map
 * (FactoryMap2D). Both read the same props, so selection, view modes and live
 * machine states behave identically. All figures are simulated.
 */
import dynamic from "next/dynamic";
import { Component, useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Box, Info, Map as MapIcon, Minus, Plus, RotateCcw, X } from "lucide-react";
import type { ID, MachineStatus } from "@/domain/types";
import { Drawer, Modal } from "@/components/ui/overlay";
import { Page, PageHeader } from "@/components/ui/page";
import { Button, Code, IconButton, Panel, Segmented, SimBadge, cn } from "@/components/ui/primitives";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { usePrefs, useReducedMotion } from "@/store/prefs";
import { zoneUsage, type ZoneUsage } from "@/store/selectors";
import { useForge } from "@/store/store";
import { FactoryMap2D } from "./FactoryMap2D";
import { buildLayout, type LayoutSpec } from "./layout";
import { STATUS_ORDER, StatusGlyph, useMedia, useMounted, useWebGL, type Selection, type TwinViewProps, type ViewMode } from "./shared";
import { MachineDetail, PlantSummary, ZoneDetail } from "./TwinPanels";

function StageLoading() {
  const { t } = useT();
  return (
    <div role="status" className="grid-bg absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="ticks relative flex size-16 items-center justify-center border border-line">
        <Box aria-hidden className="size-6 text-ink-3" strokeWidth={1.5} />
      </span>
      <div>
        <p className="label">{t("factory.loading.title")}</p>
        <p className="mt-1.5 text-[12px] text-ink-3">{t("factory.loading.body")}</p>
      </div>
      <div aria-hidden className="relative h-px w-44 overflow-hidden bg-line">
        <div className="absolute inset-0 animate-sweep bg-forge" />
      </div>
    </div>
  );
}

const FactoryScene = dynamic(() => import("./FactoryScene"), { ssr: false, loading: () => <StageLoading /> });

/** If WebGL fails at any point (context creation, a render error), fall back to the 2D map. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const ZOOM_STEPS = [1, 1.5, 2, 2.75];

export function FactoryView() {
  const { t, td, tl } = useT();
  const fmt = useFmt();

  const factories = useForge((s) => s.factories);
  const lines = useForge((s) => s.lines);
  const machines = useForge((s) => s.machines);
  const warehouses = useForge((s) => s.warehouses);
  const zones = useForge((s) => s.zones);
  const items = useForge((s) => s.items);
  const shipments = useForge((s) => s.shipments);

  const theme = usePrefs((s) => s.theme);
  const pref2d = usePrefs((s) => s.factory2d);
  const setFactory2d = usePrefs((s) => s.setFactory2d);
  const reducedMotion = useReducedMotion();
  const mounted = useMounted();
  const webgl = useWebGL();
  const small = useMedia("(max-width: 767px)");
  const phone = useMedia("(max-width: 639px)");
  const desktop = useMedia("(min-width: 1024px)");

  const [factoryId, setFactoryId] = useState<ID | null>(null);
  const [mode, setMode] = useState<ViewMode>("overview");
  const [picked, setPicked] = useState<Selection>(null);
  const [resetKey, setResetKey] = useState(0);
  const [override, setOverride] = useState<"2d" | "3d" | null>(null);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [zoomStep, setZoomStep] = useState(0);

  const factory = factories.find((f) => f.id === factoryId) ?? factories[0];

  /* ---- Data for this factory ---- */
  const fLines = useMemo(() => lines.filter((l) => l.factoryId === factory.id), [lines, factory.id]);
  const fMachines = useMemo(() => machines.filter((m) => m.factoryId === factory.id).sort((a, b) => a.lineId.localeCompare(b.lineId) || a.station - b.station), [machines, factory.id]);

  // The plan depends only on structure, never on live counters. A serialised
  // spec keeps the layout object stable across simulation ticks.
  const spec = useMemo(() => {
    const fWarehouses = warehouses.filter((w) => w.factoryId === factory.id);
    const ids = new Set(fWarehouses.map((w) => w.id));
    const trucksOnSite: Record<ID, number> = {};
    for (const sh of shipments) {
      if (ids.has(sh.warehouseId) && (sh.status === "arrived" || sh.status === "loading")) trucksOnSite[sh.warehouseId] = (trucksOnSite[sh.warehouseId] ?? 0) + 1;
    }
    const value: LayoutSpec = {
      lines: fLines.map((l) => ({ id: l.id, code: l.code })),
      machines: fMachines.map((m) => ({ id: m.id, lineId: m.lineId, station: m.station, kind: m.kind })),
      warehouses: fWarehouses,
      zones: zones.filter((z) => ids.has(z.warehouseId)),
      trucksOnSite,
    };
    return JSON.stringify(value);
  }, [fLines, fMachines, warehouses, zones, shipments, factory.id]);
  const layout = useMemo(() => buildLayout(JSON.parse(spec) as LayoutSpec), [spec]);

  const statusOf = useMemo(() => new Map<ID, MachineStatus>(fMachines.map((m) => [m.id, m.status])), [fMachines]);
  const runningKey = fLines.filter((l) => l.status === "running").map((l) => l.id).join("|");
  const runningLines = useMemo(() => new Set<ID>(runningKey ? runningKey.split("|") : []), [runningKey]);
  const usage = useMemo(() => {
    const map = new Map<ID, ZoneUsage>();
    for (const wh of layout.warehouses) for (const slot of wh.zones) map.set(slot.zone.id, zoneUsage(slot.zone, items, shipments));
    return map;
  }, [layout, items, shipments]);
  const counts = useMemo(() => {
    const c: Record<MachineStatus, number> = { running: 0, idle: 0, maintenance: 0, warning: 0, offline: 0 };
    for (const m of fMachines) c[m.status]++;
    return c;
  }, [fMachines]);
  const labels = useMemo(() => ({ maintenance: t("factory.area.maintenance"), loading: t("factory.area.loading") }), [t]);

  /* ---- Selection (derived: a stale id simply resolves to nothing) ---- */
  const selectedMachine = picked?.type === "machine" ? fMachines.find((m) => m.id === picked.id) : undefined;
  const selectedLine = picked?.type === "zone" ? fLines.find((l) => l.id === picked.id) : undefined;
  const selection: Selection = selectedMachine || selectedLine ? picked : null;
  const onSelect = useCallback((s: Selection) => setPicked(s), []);

  /* ---- Renderer: 3D where it is a good idea, 2D everywhere else ---- */
  const can3d = webgl && !sceneFailed;
  const automatic: "2d" | "3d" = small || reducedMotion || pref2d ? "2d" : "3d";
  const renderer: "2d" | "3d" = !can3d ? "2d" : (override ?? automatic);
  const chooseRenderer = (next: "2d" | "3d") => {
    if (next === "3d" && !can3d) return;
    setOverride(next);
    setFactory2d(next === "2d");
  };
  const rendererNote = !mounted
    ? null
    : !webgl
      ? t("factory.fallback.noWebgl")
      : sceneFailed
        ? t("factory.fallback.error")
        : override === null && renderer === "2d" && small
          ? t("factory.fallback.small")
          : override === null && renderer === "2d" && reducedMotion
            ? t("factory.fallback.motion")
            : null;

  const zoom = ZOOM_STEPS[zoomStep];
  const view: TwinViewProps = { layout, statusOf, runningLines, usage, mode, selection, onSelect, labels };

  const detailTitle = selectedMachine ? tl(selectedMachine.name) : selectedLine ? tl(selectedLine.name) : "";
  const detailEyebrow = selectedMachine ? t("factory.panel.machine") : selectedLine ? t("factory.panel.zone") : t("factory.panel.summary");
  const detail = selectedMachine ? <MachineDetail machine={selectedMachine} onSelect={onSelect} /> : selectedLine ? <ZoneDetail line={selectedLine} onSelect={onSelect} /> : null;
  const summary = <PlantSummary factory={factory} lines={fLines} machines={fMachines} layout={layout} usage={usage} mode={mode} onSelect={onSelect} />;

  return (
    <Page>
      <PageHeader
        eyebrow={
          <>
            {t("factory.eyebrow")}
            <span aria-hidden className="text-line-2">
              /
            </span>
            <Code className="text-[10.5px]">{factory.code}</Code>
          </>
        }
        title={t("factory.title")}
        subtitle={t("factory.subtitle")}
        meta={<SimBadge />}
        actions={
          <Segmented
            label={t("factory.select")}
            value={factory.id}
            onChange={(id) => {
              setFactoryId(id);
              setPicked(null);
            }}
            options={factories.map((f) => ({
              value: f.id,
              label: (
                <>
                  <bdi className="font-mono text-[11px] text-ink-3">{f.code}</bdi>
                  {tl(f.name)}
                </>
              ),
            }))}
          />
        }
      />

      {/* Honest framing: this is a simulation, say so before anything else. */}
      <div role="note" className="flex items-start gap-2.5 rounded-md border border-dashed border-line-2 bg-base px-3.5 py-2.5">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          <strong className="font-semibold text-ink">{t("factory.notice")}.</strong> {t("factory.noticeBody")}
        </p>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_376px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Stage */}
          <section className="panel min-w-0 overflow-hidden" aria-label={t("factory.title")}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
              <Segmented
                label={t("factory.mode.label")}
                value={mode}
                onChange={setMode}
                options={[
                  { value: "overview", label: t("factory.mode.overview") },
                  { value: "production", label: t("factory.mode.production") },
                  { value: "warehouse", label: t("factory.mode.warehouse") },
                  { value: "equipment", label: t("factory.mode.equipment") },
                ]}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {renderer === "3d" ? (
                  <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setResetKey((k) => k + 1)}>
                    {t("factory.resetCamera")}
                  </Button>
                ) : (
                  <div className="flex items-center">
                    <IconButton size="sm" icon={Minus} label={t("factory.zoomOut")} disabled={zoomStep === 0} onClick={() => setZoomStep((z) => Math.max(0, z - 1))} />
                    <span className="num w-10 text-center text-[11.5px] text-ink-3">{fmt.pct(zoom, 0)}</span>
                    <IconButton size="sm" icon={Plus} label={t("factory.zoomIn")} disabled={zoomStep === ZOOM_STEPS.length - 1} onClick={() => setZoomStep((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))} />
                  </div>
                )}
                <Segmented
                  size="sm"
                  label={t("factory.render.label")}
                  value={renderer}
                  onChange={chooseRenderer}
                  options={[
                    { value: "3d", label: t("factory.render.3d"), icon: Box },
                    { value: "2d", label: t("factory.render.2d"), icon: MapIcon },
                  ]}
                />
              </div>
            </div>

            <div className="relative isolate h-[clamp(340px,58dvh,480px)] bg-canvas md:h-[clamp(440px,64dvh,720px)]">
              {!mounted ? (
                <StageLoading />
              ) : renderer === "3d" ? (
                <SceneBoundary onError={() => setSceneFailed(true)}>
                  <div dir="ltr" role="img" aria-label={t("factory.scene.aria", { factory: factory.name })} className="grid-bg absolute inset-0 touch-none">
                    <FactoryScene {...view} theme={theme} reducedMotion={reducedMotion} resetKey={resetKey} />
                  </div>
                </SceneBoundary>
              ) : (
                <div className="absolute inset-0">
                  <FactoryMap2D {...view} zoom={zoom} />
                </div>
              )}

              {/* Stage furniture — never intercepts pointer input. */}
              <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 border border-line bg-base/90 px-2 py-1">
                  <Code className="text-[11px] text-ink">{factory.code}</Code>
                  <span className="hidden text-[11.5px] text-ink-2 sm:inline">{tl(factory.name)}</span>
                  <span aria-hidden className="h-3 w-px bg-line-2" />
                  <span className="label">{td(`factory.mode.${mode}`)}</span>
                </div>
                <SimBadge label={t("factory.notice")} className="max-w-[55%] bg-base/90 text-end sm:max-w-none" />
              </div>
              <p className="pointer-events-none absolute bottom-2.5 start-3 z-10 hidden bg-base/85 px-1.5 py-0.5 text-[11px] text-ink-3 md:block">{renderer === "3d" ? t("factory.hint.3d") : t("factory.hint.2d")}</p>
            </div>

            {/* Legend with live counts */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-3 py-2.5">
              <span className="label">{t("factory.legend.title")}</span>
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {STATUS_ORDER.map((status) => (
                  <li key={status} className="inline-flex items-center gap-1.5">
                    <StatusGlyph status={status} />
                    <span className="text-[11.5px] text-ink-2">{td(`mstatus.${status}`)}</span>
                    <span className="num text-[11.5px] font-semibold text-ink">{fmt.num(counts[status])}</span>
                  </li>
                ))}
              </ul>
            </div>
            {rendererNote && (
              <p role="status" className="border-t border-line px-3 py-2 text-[11.5px] text-ink-3">
                {rendererNote}
              </p>
            )}
          </section>

          {/* Machine list: the keyboard / touch route to every machine */}
          <Panel title={t("factory.list.title")} subtitle={t("factory.list.subtitle")} flush>
            <div className="flex snap-x gap-px overflow-x-auto bg-line">
              {layout.lines.map((slot) => {
                const line = fLines.find((l) => l.id === slot.lineId);
                const zoneSelected = selection?.type === "zone" && selection.id === slot.lineId;
                return (
                  <div key={slot.lineId} className="flex shrink-0 snap-start flex-col bg-base">
                    <button
                      type="button"
                      aria-pressed={zoneSelected}
                      onClick={() => onSelect({ type: "zone", id: slot.lineId })}
                      className={cn("flex h-9 items-center gap-2 border-b border-line px-3 text-start transition-colors hover:bg-raised", zoneSelected && "shadow-[inset_0_-2px_0_var(--forge)]")}
                    >
                      <Code className="text-[11px] text-ink">{slot.code}</Code>
                      {line && <span className="max-w-[220px] truncate text-[11.5px] text-ink-3">{tl(line.name)}</span>}
                    </button>
                    <div className="flex gap-px bg-line">
                      {slot.machines.map((ms) => {
                        const m = fMachines.find((x) => x.id === ms.id);
                        if (!m) return null;
                        const active = selection?.type === "machine" && selection.id === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onSelect({ type: "machine", id: m.id })}
                            className={cn("flex w-[148px] shrink-0 flex-col gap-1 bg-base px-3 py-2.5 text-start transition-colors hover:bg-raised", active && "bg-raised shadow-[inset_0_2px_0_var(--forge)]")}
                          >
                            <span className="flex items-center gap-1.5">
                              <StatusGlyph status={m.status} />
                              <Code className="text-[11.5px] text-ink">{m.id}</Code>
                            </span>
                            <span className="truncate text-[11.5px] text-ink-2">{tl(m.kind)}</span>
                            <span className="text-[11px] font-medium text-ink-3">{td(`mstatus.${m.status}`)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {!desktop && mounted && (
            <Panel title={t("factory.panel.summary")} eyebrow={<Code className="text-[10.5px]">{factory.code}</Code>}>
              {summary}
            </Panel>
          )}
        </div>

        {/* Contextual panel (desktop: docked; smaller screens: sheet / drawer below) */}
        {desktop && (
          <aside className="panel sticky top-4 flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col" aria-label={detailEyebrow}>
            <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <div className="label mb-1">{detailEyebrow}</div>
                <h2 className="truncate text-[15px] font-semibold text-ink">{detail ? detailTitle : tl(factory.name)}</h2>
              </div>
              {detail && <IconButton size="sm" icon={X} label={t("factory.panel.deselect")} onClick={() => setPicked(null)} />}
            </header>
            <div key={selection ? `${selection.type}:${selection.id}` : "summary"} className="min-h-0 flex-1 animate-fade overflow-y-auto p-4">
              {detail ?? summary}
            </div>
          </aside>
        )}
      </div>

      {mounted && !desktop && phone && (
        <Modal open={detail !== null} onClose={() => setPicked(null)} title={detailTitle} description={detailEyebrow}>
          {detail}
        </Modal>
      )}
      {mounted && !desktop && !phone && (
        <Drawer open={detail !== null} onClose={() => setPicked(null)} title={detailTitle} eyebrow={detailEyebrow}>
          {detail}
        </Drawer>
      )}
    </Page>
  );
}
