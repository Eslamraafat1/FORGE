"use client";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Building2,
  ClipboardList,
  Clock,
  Cog,
  CornerDownLeft,
  FileText,
  Languages,
  Pause,
  Plus,
  Rows3,
  Search,
  ShieldCheck,
  ShoppingCart,
  SunMoon,
  Wrench,
} from "lucide-react";
import { useT, type TKey } from "@/i18n";
import { entityHref } from "@/lib/routes";
import { usePrefs } from "@/store/prefs";
import { useForge } from "@/store/store";
import { cn } from "@/components/ui/primitives";
import { NAV_ITEMS, REPORT_IDS } from "./nav";

interface Entry {
  id: string;
  group: TKey;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Text matched against the query (lower-cased). */
  haystack: string;
  run: () => void;
  code?: boolean;
}

const PER_GROUP = 5;

function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[1px] bg-forge/30 text-ink">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  // The body mounts fresh on every open, so query and cursor always start clean.
  return <AnimatePresence>{open && <PaletteBody onClose={onClose} />}</AnimatePresence>;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const open = true;
  const { t, td, tl, lang } = useT();
  const router = useRouter();
  const [query, setQueryRaw] = useState("");
  const [cursor, setCursor] = useState(0);
  const setQuery = (v: string) => {
    setQueryRaw(v);
    setCursor(0);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const recent = usePrefs((s) => s.recentSearches);
  const addRecent = usePrefs((s) => s.addRecentSearch);
  const clearRecent = usePrefs((s) => s.clearRecentSearches);
  const toggleTheme = usePrefs((s) => s.toggleTheme);
  const setLang = usePrefs((s) => s.setLang);

  const machines = useForge((s) => s.machines);
  const workOrders = useForge((s) => s.workOrders);
  const items = useForge((s) => s.items);
  const suppliers = useForge((s) => s.suppliers);
  const lines = useForge((s) => s.lines);
  const inspections = useForge((s) => s.inspections);
  const maintenance = useForge((s) => s.maintenanceOrders);
  const purchaseOrders = useForge((s) => s.purchaseOrders);
  const products = useForge((s) => s.products);

  const go = (href: string) => () => router.push(href);

  /** Search index, rebuilt only while the palette is open. */
  const index = useMemo<Entry[]>(() => {
    if (!open) return [];
    const productName = (id: string) => {
      const p = products.find((x) => x.id === id);
      return p ? tl(p.name) : "";
    };
    const both = (n: { en: string; ar: string }) => `${n.en} ${n.ar}`;
    const e: Entry[] = [];
    for (const m of machines)
      e.push({ id: `m-${m.id}`, group: "cmd.group.machine", icon: Cog, title: m.id, code: true, subtitle: `${tl(m.name)} · ${td(`mstatus.${m.status}`)}`, haystack: `${m.id} ${both(m.name)} ${m.manufacturer} ${m.model} ${m.serial}`, run: go(entityHref({ type: "machine", id: m.id })) });
    for (const w of workOrders)
      e.push({ id: `w-${w.id}`, group: "cmd.group.workOrder", icon: ClipboardList, title: w.id, code: true, subtitle: `${productName(w.productId)} · ${td(`wostatus.${w.status}`)}`, haystack: `${w.id} ${productName(w.productId)} ${w.lineId ?? ""}`, run: go(entityHref({ type: "workOrder", id: w.id })) });
    for (const i of items)
      e.push({ id: `i-${i.id}`, group: "cmd.group.item", icon: Boxes, title: i.sku, code: true, subtitle: `${tl(i.name)} · ${td(`invcat.${i.category}`)}`, haystack: `${i.sku} ${both(i.name)}`, run: go(entityHref({ type: "item", id: i.id })) });
    for (const s of suppliers)
      e.push({ id: `s-${s.id}`, group: "cmd.group.supplier", icon: Building2, title: s.name, subtitle: `${s.id} · ${tl(s.country)}`, haystack: `${s.id} ${s.name} ${both(s.country)} ${s.contactName}`, run: go(entityHref({ type: "supplier", id: s.id })) });
    for (const l of lines)
      e.push({ id: `l-${l.id}`, group: "cmd.group.line", icon: Rows3, title: l.code, code: true, subtitle: `${tl(l.name)} · ${td(`lstatus.${l.status}`)}`, haystack: `${l.code} ${both(l.name)}`, run: go(entityHref({ type: "line", id: l.id })) });
    for (const q of inspections)
      e.push({ id: `q-${q.id}`, group: "cmd.group.inspection", icon: ShieldCheck, title: q.id, code: true, subtitle: `${q.workOrderId} · ${td(`qstatus.${q.status}`)}`, haystack: `${q.id} ${q.workOrderId} ${productName(q.productId)}`, run: go(entityHref({ type: "inspection", id: q.id })) });
    for (const mo of maintenance)
      e.push({ id: `mo-${mo.id}`, group: "cmd.group.maintenance", icon: Wrench, title: mo.id, code: true, subtitle: `${mo.machineId} · ${td(`mntstatus.${mo.status}`)}`, haystack: `${mo.id} ${mo.machineId} ${both(mo.description)}`, run: go(entityHref({ type: "maintenance", id: mo.id })) });
    for (const po of purchaseOrders) {
      const sup = suppliers.find((s) => s.id === po.supplierId)?.name ?? "";
      e.push({ id: `po-${po.id}`, group: "cmd.group.po", icon: ShoppingCart, title: po.id, code: true, subtitle: `${sup} · ${td(`postatus.${po.status}`)}`, haystack: `${po.id} ${sup}`, run: go(entityHref({ type: "po", id: po.id })) });
    }
    for (const r of REPORT_IDS) {
      const title = td(`reports.type.${r}`);
      e.push({ id: `r-${r}`, group: "cmd.group.report", icon: FileText, title, haystack: `${title} ${r} report`, run: go(entityHref({ type: "report", id: r })) });
    }
    for (const n of NAV_ITEMS) {
      const title = t(n.label);
      e.push({ id: `p-${n.href}`, group: "cmd.group.page", icon: n.icon, title, haystack: `${title} ${n.href}`, run: go(n.href) });
    }
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, machines, workOrders, items, suppliers, lines, inspections, maintenance, purchaseOrders, products, lang]);

  const actions = useMemo<Entry[]>(
    () => [
      { id: "a-wo", group: "cmd.actions", icon: Plus, title: t("cmd.act.newWo"), haystack: "", run: go("/work-orders?new=1") },
      { id: "a-mo", group: "cmd.actions", icon: Plus, title: t("cmd.act.newMaint"), haystack: "", run: go("/maintenance?new=1") },
      { id: "a-po", group: "cmd.actions", icon: Plus, title: t("cmd.act.newPo"), haystack: "", run: go("/procurement?new=1") },
      { id: "a-qi", group: "cmd.actions", icon: Plus, title: t("cmd.act.newInsp"), haystack: "", run: go("/quality?new=1") },
      { id: "a-theme", group: "cmd.actions", icon: SunMoon, title: t("cmd.act.toggleTheme"), haystack: "", run: toggleTheme },
      { id: "a-lang", group: "cmd.actions", icon: Languages, title: t("cmd.act.toggleLang"), haystack: "", run: () => setLang(lang === "ar" ? "en" : "ar") },
      { id: "a-sim", group: "cmd.actions", icon: Pause, title: t("cmd.act.toggleSim"), haystack: "", run: () => useForge.getState().setSimRunning(!useForge.getState().simRunning) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  );

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const out: { label: TKey; entries: Entry[] }[] = [];
    if (!q) {
      out.push({ label: "cmd.actions", entries: actions });
      out.push({ label: "cmd.goto", entries: index.filter((e) => e.group === "cmd.group.page").slice(0, 6) });
      return out;
    }
    const matchedActions = actions.filter((a) => a.title.toLowerCase().includes(q));
    if (matchedActions.length) out.push({ label: "cmd.actions", entries: matchedActions });
    const byGroup = new Map<TKey, Entry[]>();
    for (const e of index) {
      if (!e.haystack.toLowerCase().includes(q)) continue;
      const list = byGroup.get(e.group) ?? [];
      if (list.length < PER_GROUP) list.push(e);
      byGroup.set(e.group, list);
    }
    for (const [label, entries] of byGroup) out.push({ label, entries });
    return out;
  }, [q, index, actions]);

  const flat = useMemo(() => groups.flatMap((g) => g.entries), [groups]);

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const select = (entry: Entry | undefined) => {
    if (!entry) return;
    if (query.trim()) addRecent(query);
    onClose();
    entry.run();
  };

  const indexOf = new Map(flat.map((e, i) => [e.id, i]));
  return (
        <div className="no-print fixed inset-0 z-[95] flex items-start justify-center px-3 pt-[8dvh] sm:pt-[12dvh]">
          <motion.div className="absolute inset-0 bg-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("cmd.title")}
            initial={{ opacity: 0, y: -10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.15, ease: [0.2, 0.7, 0.2, 1] }}
            className="ticks relative flex max-h-[70dvh] w-full max-w-[640px] flex-col border border-line-2 bg-base shadow-pop"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => (flat.length ? (c + 1) % flat.length : 0));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => (flat.length ? (c - 1 + flat.length) % flat.length : 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                select(flat[cursor]);
              } else if (e.key === "Tab") {
                e.preventDefault(); // keep focus in the input; arrows navigate
              }
            }}
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search aria-hidden className="size-4 shrink-0 text-ink-3" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("cmd.placeholder")}
                aria-label={t("cmd.placeholder")}
                role="combobox"
                aria-expanded="true"
                aria-controls="cmd-list"
                aria-activedescendant={flat[cursor] ? `cmd-${flat[cursor].id}` : undefined}
                autoComplete="off"
                spellCheck={false}
                className="h-12 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
              />
              <kbd className="code rounded-sm border border-line px-1.5 py-0.5 text-[10.5px] text-ink-3">ESC</kbd>
            </div>

            <div ref={listRef} id="cmd-list" role="listbox" aria-label={t("cmd.title")} className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {!q && recent.length > 0 && (
                <div className="mb-1">
                  <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
                    <span className="label">{t("cmd.recent")}</span>
                    <button type="button" onClick={clearRecent} className="text-[11px] text-ink-3 hover:text-ink">
                      {t("cmd.clearRecent")}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-2.5 pb-1.5">
                    {recent.map((r) => (
                      <button key={r} type="button" onClick={() => setQuery(r)} className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2 py-1 text-[12px] text-ink-2 hover:border-line-2 hover:text-ink">
                        <Clock aria-hidden className="size-3 text-ink-3" />
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {flat.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-[13px] font-semibold text-ink">{t("cmd.empty", { q: query.trim() })}</p>
                  <p className="mt-1 text-[12px] text-ink-3">{t("cmd.emptyHint")}</p>
                </div>
              ) : (
                groups.map((g) => (
                  <div key={g.label} role="group" aria-label={t(g.label)} className="mb-1">
                    <p className="label px-2.5 pb-1 pt-2">{t(g.label)}</p>
                    {g.entries.map((entry) => {
                      const i = indexOf.get(entry.id) ?? 0;
                      const active = i === cursor;
                      return (
                        <div
                          key={entry.id}
                          id={`cmd-${entry.id}`}
                          data-index={i}
                          role="option"
                          aria-selected={active}
                          onMouseMove={() => setCursor(i)}
                          onClick={() => select(entry)}
                          className={cn("relative flex cursor-pointer items-center gap-3 rounded-sm px-2.5 py-2", active && "bg-raised")}
                        >
                          {active && <span aria-hidden className="absolute inset-y-1.5 start-0 w-0.5 bg-forge" />}
                          <entry.icon aria-hidden className={cn("size-4 shrink-0", active ? "text-forge-text" : "text-ink-3")} />
                          <span className={cn("shrink-0 text-[13px] font-medium text-ink", entry.code && "code text-[12.5px]")}>
                            <Highlight text={entry.title} query={query} />
                          </span>
                          {entry.subtitle && (
                            <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
                              <Highlight text={entry.subtitle} query={query} />
                            </span>
                          )}
                          {active && <CornerDownLeft aria-hidden className="ms-auto size-3.5 shrink-0 text-ink-3 rtl:-scale-x-100" />}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11px] text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <kbd className="code rounded-sm border border-line px-1">↑↓</kbd>
                {t("cmd.hint.navigate")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <kbd className="code rounded-sm border border-line px-1">↵</kbd>
                {t("cmd.hint.select")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <kbd className="code rounded-sm border border-line px-1">esc</kbd>
                {t("cmd.hint.close")}
              </span>
              <span className="ms-auto hidden sm:inline">{t("brand.demo")}</span>
            </div>
          </motion.div>
        </div>
  );
}
