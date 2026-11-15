"use client";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Check, Database, HardDrive, Moon, Pause, Play, RotateCcw, Sun } from "lucide-react";
import type { ForgeData } from "@/domain/types";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Avatar, Guard, Page, PageHeader } from "@/components/ui/page";
import { Badge, Button, Code, DataList, Panel, Segmented, SimBadge, cn } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { SIM_INTERVAL_MS, SIM_MINUTES_PER_TICK, shiftAt } from "@/lib/time";
import { PREFS_KEY, usePrefs, type Lang, type MotionPref, type Numerals, type Theme } from "@/store/prefs";
import { useCurrentUser, useForge } from "@/store/store";
import { APP_NAME, APP_VERSION, DATASET_KEYS, STORAGE_KEY_DATA, TECH_STACK, THEME_PREVIEW_VARS } from "./about";

/* ------------------------------------------------------------------ */
/* Small local controls                                                */
/* ------------------------------------------------------------------ */

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full border transition-colors duration-150",
        checked ? "border-forge bg-forge" : "border-line-2 bg-canvas",
      )}
    >
      <span aria-hidden className={cn("absolute size-4 rounded-full transition-[inset-inline-start] duration-150", checked ? "start-[20px] bg-forge-ink" : "start-[2px] bg-ink-3")} />
    </button>
  );
}

/** One setting: label + explanation on the start side, control on the end side. */
function Row({ label, hint, children, stack }: { label: string; hint?: ReactNode; children: ReactNode; stack?: boolean }) {
  return (
    <div className={cn("flex gap-x-6 gap-y-2.5 border-b border-line/70 py-3.5 first:pt-0 last:border-b-0 last:pb-0", stack ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between")}>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{label}</p>
        {hint && <p className="mt-0.5 max-w-xl text-[12px] leading-snug text-ink-3">{hint}</p>}
      </div>
      <div className={cn("min-w-0", !stack && "shrink-0")}>{children}</div>
    </div>
  );
}

/** Miniature of the app shell drawn with one theme's tokens. */
function ThemePreview({ theme }: { theme: Theme }) {
  return (
    <span aria-hidden style={THEME_PREVIEW_VARS[theme]} className="flex h-[84px] w-full overflow-hidden rounded-sm border border-line bg-canvas" dir="ltr">
      <span className="flex w-[22%] flex-col gap-1 border-e border-line bg-base p-1.5">
        <span className="h-1.5 w-3/4 rounded-[1px] bg-forge" />
        <span className="mt-1 h-1 w-full rounded-[1px] bg-ink-3/60" />
        <span className="h-1 w-4/5 rounded-[1px] bg-ink-3/60" />
        <span className="h-1 w-full rounded-[1px] bg-ink-3/60" />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 p-1.5">
        <span className="h-1.5 w-1/3 rounded-[1px] bg-ink" />
        <span className="grid grid-cols-3 gap-1">
          <span className="h-5 rounded-[1px] border border-line bg-base" />
          <span className="h-5 rounded-[1px] border border-line bg-base" />
          <span className="h-5 rounded-[1px] border border-line bg-base" />
        </span>
        <span className="flex flex-1 items-end gap-1 rounded-[1px] border border-line bg-raised p-1">
          <span className="h-[40%] flex-1 bg-forge" />
          <span className="h-[70%] flex-1 bg-forge" />
          <span className="h-[55%] flex-1 bg-forge" />
          <span className="h-[90%] flex-1 bg-ok" />
          <span className="h-[62%] flex-1 bg-forge" />
        </span>
      </span>
    </span>
  );
}

function DatasetCount({ k }: { k: keyof ForgeData }) {
  const { td } = useT();
  const fmt = useFmt();
  const n = useForge((s) => s[k].length);
  return (
    <div className="min-w-0 border-b border-e border-line px-3 py-2">
      <dt className="truncate text-[11.5px] text-ink-3">{td(`settings.data.count.${k}`)}</dt>
      <dd className="num mt-0.5 text-[15px] font-semibold text-ink">{fmt.num(n)}</dd>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="code rounded-sm border border-line-2 bg-canvas px-1.5 py-0.5 text-[11px] text-ink-2">{children}</kbd>;
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export function SettingsView() {
  const { t, td, tl, lang } = useT();
  const fmt = useFmt();

  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const motion = usePrefs((s) => s.motion);
  const setMotion = usePrefs((s) => s.setMotion);
  const sidebarCollapsed = usePrefs((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = usePrefs((s) => s.setSidebarCollapsed);
  const setLang = usePrefs((s) => s.setLang);
  const numerals = usePrefs((s) => s.numerals);
  const setNumerals = usePrefs((s) => s.setNumerals);

  const now = useForge((s) => s.now);
  const tick = useForge((s) => s.tick);
  const running = useForge((s) => s.simRunning);
  const setRunning = useForge((s) => s.setSimRunning);
  const resetDemo = useForge((s) => s.resetDemo);
  const role = useForge((s) => s.role);
  const factories = useForge((s) => s.factories);
  const me = useCurrentUser();

  const [confirmReset, setConfirmReset] = useState(false);
  const shift = shiftAt(now);
  const myFactory = factories.find((f) => f.id === me.factoryId);
  const themes: { value: Theme; icon: typeof Moon; label: string; hint: string }[] = [
    { value: "dark", icon: Moon, label: t("settings.theme.dark"), hint: t("settings.theme.darkHint") },
    { value: "light", icon: Sun, label: t("settings.theme.light"), hint: t("settings.theme.lightHint") },
  ];

  return (
    <Page>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2 xl:gap-5">
        {/* ---------------- Appearance ---------------- */}
        <Panel title={t("settings.appearance.title")} subtitle={t("settings.appearance.subtitle")}>
          <Row label={t("settings.theme")} hint={t("settings.theme.hint")} stack>
            <div role="radiogroup" aria-label={t("settings.theme")} className="grid grid-cols-2 gap-3">
              {themes.map((o) => {
                const active = theme === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTheme(o.value)}
                    className={cn("flex min-w-0 flex-col gap-2 rounded-md border p-2 text-start transition-colors", active ? "border-forge bg-forge/[0.07]" : "border-line hover:border-line-2")}
                  >
                    <ThemePreview theme={o.value} />
                    <span className="flex items-center justify-between gap-2 px-0.5">
                      <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                        <o.icon aria-hidden className="size-3.5 shrink-0 text-ink-3" />
                        <span className="truncate">{o.label}</span>
                      </span>
                      {active && <Check aria-hidden className="size-3.5 shrink-0 text-forge-text" strokeWidth={2.6} />}
                    </span>
                    <span className="px-0.5 text-[11.5px] leading-snug text-ink-3">{o.hint}</span>
                  </button>
                );
              })}
            </div>
          </Row>
          <Row label={t("settings.motion")} hint={motion === "reduced" ? t("settings.motion.reducedHint") : t("settings.motion.systemHint")}>
            <Segmented<MotionPref>
              label={t("settings.motion")}
              value={motion}
              onChange={setMotion}
              options={[
                { value: "system", label: t("settings.motion.system") },
                { value: "reduced", label: t("settings.motion.reduced") },
              ]}
            />
          </Row>
          <Row label={t("settings.sidebar")} hint={t("settings.sidebar.hint")}>
            <Switch checked={sidebarCollapsed} onChange={setSidebarCollapsed} label={t("settings.sidebar")} />
          </Row>
          <p className="mt-3.5 flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <HardDrive aria-hidden className="size-3.5 shrink-0" />
            {t("settings.prefsSaved")}
          </p>
        </Panel>

        {/* ---------------- Language & region ---------------- */}
        <Panel title={t("settings.lang.title")} subtitle={t("settings.lang.subtitle")}>
          <Row label={t("shell.lang")} hint={t("settings.lang.hint")}>
            <Segmented<Lang>
              label={t("shell.lang")}
              value={lang}
              onChange={setLang}
              options={[
                { value: "en", label: t("shell.lang.en") },
                { value: "ar", label: t("shell.lang.ar") },
              ]}
            />
          </Row>
          <Row label={t("settings.numerals")} hint={lang === "ar" ? t("settings.numerals.hintAr") : t("settings.numerals.hintEn")}>
            <div inert={lang !== "ar"} className={cn(lang !== "ar" && "opacity-45")}>
              <Segmented<Numerals>
                label={t("settings.numerals")}
                value={numerals}
                onChange={setNumerals}
                options={[
                  { value: "latn", label: <span dir="ltr">{t("settings.numerals.latn")}</span> },
                  { value: "arab", label: <span dir="rtl">{t("settings.numerals.arab")}</span> },
                ]}
              />
            </div>
          </Row>
          <Row label={t("settings.sample.title")} hint={t("settings.sample.hint")} stack>
            <div className="rounded-md border border-line bg-canvas p-3.5" aria-live="polite">
              <DataList
                columns={3}
                items={[
                  { label: t("settings.sample.number"), value: <span className="num">{fmt.num(1284650.75, 2)}</span> },
                  { label: t("settings.sample.percent"), value: <span className="num">{fmt.pct(0.934)}</span> },
                  { label: t("settings.sample.currency"), value: <span className="num">{fmt.money(48250.5, 2)}</span> },
                  { label: t("common.date"), value: <span className="num">{fmt.date(now)}</span> },
                  { label: t("common.time"), value: <span className="num">{fmt.time(now)}</span> },
                  { label: t("settings.sample.duration"), value: <span className="num">{fmt.duration(92)}</span> },
                ]}
              />
            </div>
          </Row>
        </Panel>

        {/* ---------------- Simulation ---------------- */}
        <Panel
          title={t("settings.sim.title")}
          subtitle={t("settings.sim.subtitle")}
          actions={
            <Badge tone={running ? "ok" : "warn"} dot pulse={running}>
              {running ? t("shell.simRunning") : t("shell.simPaused")}
            </Badge>
          }
        >
          <Row label={t("settings.sim.state")} hint={t("settings.sim.stateHint")}>
            <div className="flex items-center gap-3">
              <Switch checked={running} onChange={setRunning} label={t("settings.sim.state")} />
              <Button size="sm" icon={running ? Pause : Play} onClick={() => setRunning(!running)}>
                {running ? t("shell.simPause") : t("shell.simResume")}
              </Button>
            </div>
          </Row>
          <Row label={t("settings.sim.readout")} stack>
            <div className="rounded-md border border-line bg-canvas p-3.5">
              <DataList
                columns={2}
                items={[
                  {
                    label: t("shell.simClock"),
                    value: (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="num font-semibold">{`${fmt.date(now)} · ${fmt.time(now)}`}</span>
                        <SimBadge label={t("common.simulated")} />
                      </span>
                    ),
                  },
                  { label: t("settings.sim.shift"), value: td(`shift.${shift.id}`) },
                  { label: t("settings.sim.tick"), value: <span className="num font-semibold">{fmt.num(tick)}</span> },
                  { label: t("settings.sim.interval"), value: t("settings.sim.intervalValue", { sec: SIM_INTERVAL_MS / 1000, min: SIM_MINUTES_PER_TICK }) },
                ]}
              />
            </div>
          </Row>
          <Row label={t("settings.sim.what")} stack>
            <ul className="list-disc space-y-1 ps-4 text-[12.5px] leading-relaxed text-ink-2">
              <li>{t("settings.sim.point1")}</li>
              <li>{t("settings.sim.point2")}</li>
              <li>{t("settings.sim.point3")}</li>
              <li>{t("shell.simNote")}</li>
            </ul>
          </Row>
        </Panel>

        {/* ---------------- Demo data ---------------- */}
        <Panel title={t("settings.data.title")} subtitle={t("settings.data.subtitle")} actions={<SimBadge />}>
          <Row label={t("settings.data.stats")} hint={t("settings.data.statsHint")} stack>
            <dl className="grid grid-cols-2 border-s border-t border-line sm:grid-cols-4">
              {DATASET_KEYS.map((k) => (
                <DatasetCount key={k} k={k} />
              ))}
            </dl>
          </Row>
          <Row label={t("settings.data.persist")} stack>
            <div className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-ink-2">
              <Database aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
              <div className="min-w-0">
                <p>{t("settings.data.persistBody")}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
                  {t("settings.data.keys")}
                  <Code className="text-ink-2">{STORAGE_KEY_DATA}</Code>
                  <Code className="text-ink-2">{PREFS_KEY}</Code>
                </p>
              </div>
            </div>
          </Row>
          <Row label={t("settings.reset")} hint={t("settings.reset.hint")}>
            <Guard cap="settings.reset">
              <Button variant="danger" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
                {t("settings.reset")}
              </Button>
            </Guard>
          </Row>
        </Panel>

        {/* ---------------- Profile ---------------- */}
        <Panel title={t("settings.profile.title")} subtitle={t("settings.profile.subtitle")}>
          <div className="flex items-center gap-3.5">
            <Avatar member={me} size={48} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-ink">{tl(me.name)}</p>
              <Code className="block truncate text-ink-3">{me.email}</Code>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <DataList
              items={[
                { label: t("common.id"), value: <Code>{me.id}</Code> },
                { label: t("settings.profile.activeRole"), value: <Badge tone="accent">{td(`role.${role}`)}</Badge> },
                { label: t("settings.profile.department"), value: td(`dept.${me.department}`) },
                { label: t("common.location"), value: myFactory ? tl(myFactory.name) : t("common.notAvailable") },
              ]}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
            <p className="min-w-0 flex-1 basis-[220px] text-[12px] leading-snug text-ink-3">{t("settings.profile.note")}</p>
            <Link href="/team" className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-md border border-line-2 bg-raised px-3 text-[13px] font-medium text-ink hover:bg-panel">
              {t("settings.profile.switchRole")}
              <ArrowRight aria-hidden className="size-3.5 rtl:-scale-x-100" />
            </Link>
          </div>
        </Panel>

        {/* ---------------- About ---------------- */}
        <Panel title={t("settings.about.title")}>
          <DataList
            items={[
              {
                label: t("settings.about.product"),
                value: (
                  <span>
                    <span className="font-semibold">{APP_NAME}</span> — {t("brand.product")}
                  </span>
                ),
              },
              { label: t("settings.about.version"), value: <Code>{`v${APP_VERSION}`}</Code> },
            ]}
          />
          <div className="mt-4 border-t border-line pt-3.5">
            <p className="label mb-2">{t("settings.about.stack")}</p>
            <ul className="flex flex-wrap gap-1.5" dir="ltr">
              {TECH_STACK.map((s) => (
                <li key={s} className="rounded-sm border border-line px-1.5 py-0.5 text-[11.5px] text-ink-2">
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4 rounded-md border border-dashed border-line-2 px-3.5 py-3">
            <p className="text-[12.5px] font-semibold text-ink">{t("settings.about.fictional")}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{t("settings.about.fictionalBody")}</p>
          </div>
          <div className="mt-4 border-t border-line pt-3.5">
            <p className="label mb-2">{t("settings.about.shortcuts")}</p>
            <dl className="flex flex-col gap-2 text-[12.5px]">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-2">{t("settings.about.shortcut.palette")}</dt>
                <dd className="flex shrink-0 items-center gap-1" dir="ltr">
                  <Kbd>Ctrl</Kbd>
                  <span className="text-ink-3">/</span>
                  <Kbd>⌘</Kbd>
                  <span className="text-ink-3">+</span>
                  <Kbd>K</Kbd>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-2">{t("settings.about.shortcut.navigate")}</dt>
                <dd className="flex shrink-0 items-center gap-1" dir="ltr">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  <Kbd>↵</Kbd>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-2">{t("settings.about.shortcut.close")}</dt>
                <dd className="shrink-0" dir="ltr">
                  <Kbd>Esc</Kbd>
                </dd>
              </div>
            </dl>
          </div>
        </Panel>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemo();
          toast("success", t("settings.reset.done"), t("settings.reset.doneBody"));
        }}
        title={t("settings.reset.confirmTitle")}
        body={t("settings.reset.confirmBody")}
        confirmLabel={t("settings.reset")}
        danger
      />
    </Page>
  );
}
