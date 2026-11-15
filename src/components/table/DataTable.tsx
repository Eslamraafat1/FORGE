"use client";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Columns3, FilterX, Search, SearchX, X } from "lucide-react";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { Button, Checkbox, EmptyState, IconButton, Select, Skeleton, cn } from "@/components/ui/primitives";
import { Popover } from "@/components/ui/overlay";

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (row: T) => string | number;
  align?: "start" | "end" | "center";
  /** CSS width, e.g. "120px" or "18%". */
  width?: string;
  /** Column can be toggled in the column menu (default true). */
  hideable?: boolean;
  defaultHidden?: boolean;
  /**
   * Role in the mobile card layout:
   *  title — primary line · subtitle — secondary line · badge — top-right chip
   *  meta — labelled value in the detail grid (default) · hidden — desktop only
   */
  mobile?: "title" | "subtitle" | "badge" | "meta" | "hidden";
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  /** Accessible table name. */
  caption: string;
  /** Text used by the search box. Omit to hide search. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** Filter controls rendered in the toolbar (Select elements etc.). */
  filters?: ReactNode;
  /** Number of active filters, shows the "clear filters" button. */
  activeFilters?: number;
  onClearFilters?: () => void;
  /** Extra toolbar content at the inline end (e.g. a Create button). */
  toolbarEnd?: ReactNode;
  initialSort?: { id: string; dir: "asc" | "desc" };
  pageSize?: number;
  selectable?: boolean;
  bulkActions?: (selected: T[], clear: () => void) => ReactNode;
  /** Makes rows navigable. */
  rowHref?: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Trailing actions cell (menus, buttons). */
  rowActions?: (row: T) => ReactNode;
  empty?: { title: string; hint?: string; action?: ReactNode };
  loading?: boolean;
  /** Highlight a row (e.g. the one open in a drawer). */
  activeRowId?: string | null;
  className?: string;
}

const PAGE_SIZES = [10, 20, 50];
const alignClass = { start: "text-start", end: "text-end", center: "text-center" } as const;

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest("a,button,input,select,textarea,label,[role='menu'],[role='dialog']");
}

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  caption,
  searchText,
  searchPlaceholder,
  filters,
  activeFilters = 0,
  onClearFilters,
  toolbarEnd,
  initialSort,
  pageSize: initialPageSize = 10,
  selectable,
  bulkActions,
  rowHref,
  onRowClick,
  rowActions,
  empty,
  loading,
  activeRowId,
  className,
}: DataTableProps<T>) {
  const { t, lang } = useT();
  const fmt = useFmt();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(initialSort ?? null);
  const [pageSize, setPageSize] = useState(initialPageSize);
  // The page is tied to the shape of the result set: any change returns to page 1.
  const resetKey = `${activeFilters}|${pageSize}|${rows.length}`;
  const [pageState, setPageState] = useState({ key: resetKey, query: "", page: 0 });
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id)));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchText) return rows;
    return rows.filter((r) => searchText(r).toLowerCase().includes(q));
  }, [rows, query, searchText]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return filtered;
    const get = col.sortValue;
    const collator = new Intl.Collator(lang, { numeric: true, sensitivity: "base" });
    const out = [...filtered].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      return typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y));
    });
    return sort.dir === "desc" ? out.reverse() : out;
  }, [filtered, sort, columns, lang]);

  const page = pageState.key === resetKey && pageState.query === query ? pageState.page : 0;
  const setPage = (p: number) => setPageState({ key: resetKey, query, page: p });
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(() => sorted.slice(safePage * pageSize, safePage * pageSize + pageSize), [sorted, safePage, pageSize]);

  // Drop selections that no longer exist.
  const liveSelected = useMemo(() => rows.filter((r) => selected.has(getRowId(r))), [rows, selected, getRowId]);
  const clearSelection = () => setSelected(new Set());

  const visible = columns.filter((c) => !hidden.has(c.id));
  const pageIds = pageRows.map(getRowId);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));

  const toggleSort = (id: string) =>
    setSort((s) => (s?.id !== id ? { id, dir: "asc" } : s.dir === "asc" ? { id, dir: "desc" } : null));

  const open = (row: T) => {
    if (onRowClick) onRowClick(row);
    else if (rowHref) router.push(rowHref(row));
  };
  const clickable = !!(onRowClick || rowHref);

  const titleCol = columns.find((c) => c.mobile === "title") ?? columns[0];
  const subtitleCol = columns.find((c) => c.mobile === "subtitle");
  const badgeCols = columns.filter((c) => c.mobile === "badge");
  const metaCols = columns.filter((c) => c !== titleCol && c !== subtitleCol && !badgeCols.includes(c) && c.mobile !== "hidden");

  const hasFiltersOrQuery = activeFilters > 0 || query.trim().length > 0;
  const emptyNode = (
    <EmptyState
      icon={hasFiltersOrQuery ? SearchX : undefined}
      title={hasFiltersOrQuery ? t("common.noResults") : (empty?.title ?? t("common.noResults"))}
      hint={hasFiltersOrQuery ? t("common.noResultsHint") : empty?.hint}
      action={
        hasFiltersOrQuery ? (
          <Button
            size="sm"
            icon={FilterX}
            onClick={() => {
              setQuery("");
              onClearFilters?.();
            }}
          >
            {t("common.clearFilters")}
          </Button>
        ) : (
          empty?.action
        )
      }
    />
  );

  return (
    <div className={cn("panel flex min-w-0 flex-col", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
        {searchText && (
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder ?? t("common.search")}
              aria-label={searchPlaceholder ?? t("common.search")}
              className="field ps-8 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label={t("common.clearFilters")} className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1 text-ink-3 hover:text-ink">
                <X aria-hidden className="size-3.5" />
              </button>
            )}
          </div>
        )}
        {filters && <div className="flex flex-wrap items-center gap-2 [&_.field]:h-[34px] [&_.field]:w-auto [&_.field]:min-w-[132px]">{filters}</div>}
        {activeFilters > 0 && onClearFilters && (
          <Button variant="ghost" size="sm" icon={FilterX} onClick={onClearFilters}>
            {t("common.clearFilters")}
          </Button>
        )}
        <div className="ms-auto flex items-center gap-2">
          <Popover
            label={t("common.columns")}
            width={220}
            trigger={(p) => <IconButton icon={Columns3} label={t("common.columns")} className="hidden md:inline-flex" {...p} />}
          >
            {() => (
              <div className="p-2">
                <p className="label px-1.5 pb-1.5">{t("common.columns")}</p>
                {columns.map((c) => {
                  const locked = c.hideable === false;
                  return (
                    <label key={c.id} className={cn("flex items-center gap-2.5 rounded-sm px-1.5 py-1.5 text-[12.5px] hover:bg-panel", locked && "opacity-50")}>
                      <input
                        type="checkbox"
                        className="size-3.5 accent-[var(--forge)]"
                        checked={!hidden.has(c.id)}
                        disabled={locked}
                        onChange={(e) =>
                          setHidden((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          })
                        }
                      />
                      {c.header}
                    </label>
                  );
                })}
              </div>
            )}
          </Popover>
          {toolbarEnd}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectable && liveSelected.length > 0 && (
        <div className="flex animate-fade flex-wrap items-center gap-3 border-b border-forge/40 bg-forge/10 px-3 py-2">
          <span className="text-[12.5px] font-semibold text-ink">{t("common.selected", { n: liveSelected.length })}</span>
          <div className="flex flex-wrap items-center gap-2">{bulkActions?.(liveSelected, clearSelection)}</div>
          <Button variant="ghost" size="sm" className="ms-auto" onClick={clearSelection}>
            {t("common.clearSelection")}
          </Button>
        </div>
      )}

      {/* Desktop table */}
      <div className="relative hidden min-w-0 overflow-x-auto md:block">
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-canvas/50">
              {selectable && (
                <th scope="col" className="w-9 ps-3">
                  <Checkbox
                    label={t("common.selectAll")}
                    checked={allOnPage}
                    indeterminate={someOnPage}
                    onChange={(v) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const id of pageIds) {
                          if (v) next.add(id);
                          else next.delete(id);
                        }
                        return next;
                      })
                    }
                  />
                </th>
              )}
              {visible.map((c) => {
                const active = sort?.id === c.id;
                const SortIcon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    style={{ width: c.width }}
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn("h-9 whitespace-nowrap px-3 font-normal", alignClass[c.align ?? "start"])}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.id)}
                        className={cn("label inline-flex items-center gap-1 hover:text-ink", active && "text-ink", c.align === "end" && "flex-row-reverse")}
                      >
                        {c.header}
                        <SortIcon aria-hidden className={cn("size-3", !active && "opacity-50")} />
                      </button>
                    ) : (
                      <span className="label">{c.header}</span>
                    )}
                  </th>
                );
              })}
              {rowActions && (
                <th scope="col" className="w-10 px-2">
                  <span className="sr-only">{t("common.actions")}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="border-b border-line/60">
                    <td colSpan={visible.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)} className="px-3 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))
              : pageRows.map((row) => {
                  const id = getRowId(row);
                  const isSelected = selected.has(id);
                  return (
                    <tr
                      key={id}
                      onClick={clickable ? (e) => !isInteractive(e.target) && open(row) : undefined}
                      className={cn(
                        "group border-b border-line/60 transition-colors duration-75 last:border-b-0",
                        clickable && "cursor-pointer",
                        isSelected ? "bg-forge/[0.07]" : activeRowId === id ? "bg-raised" : "hover:bg-raised/70",
                      )}
                    >
                      {selectable && (
                        <td className="w-9 ps-3">
                          <Checkbox
                            label={t("common.selectRow")}
                            checked={isSelected}
                            onChange={(v) =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(id);
                                else next.delete(id);
                                return next;
                              })
                            }
                          />
                        </td>
                      )}
                      {visible.map((c, ci) => (
                        <td key={c.id} className={cn("relative h-11 px-3 py-2 align-middle", alignClass[c.align ?? "start"], c.align === "end" && "num")}>
                          {ci === 0 && !selectable && (
                            <span aria-hidden className={cn("absolute inset-y-0 start-0 w-0.5 bg-forge opacity-0 transition-opacity", clickable && "group-hover:opacity-100", activeRowId === id && "opacity-100")} />
                          )}
                          {c.cell(row)}
                        </td>
                      ))}
                      {rowActions && <td className="px-2 text-end">{rowActions(row)}</td>}
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!loading && sorted.length === 0 && emptyNode}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          emptyNode
        ) : (
          <ul className="divide-y divide-line/70">
            {pageRows.map((row) => {
              const id = getRowId(row);
              return (
                <li key={id} onClick={clickable ? (e) => !isInteractive(e.target) && open(row) : undefined} className={cn("px-3 py-3", clickable && "cursor-pointer active:bg-raised", selected.has(id) && "bg-forge/[0.07]")}>
                  <div className="flex items-start gap-2.5">
                    {selectable && (
                      <Checkbox
                        label={t("common.selectRow")}
                        className="mt-1"
                        checked={selected.has(id)}
                        onChange={(v) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(id);
                            else next.delete(id);
                            return next;
                          })
                        }
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 text-[13.5px] font-semibold text-ink">{titleCol.cell(row)}</div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">{badgeCols.map((c) => <span key={c.id}>{c.cell(row)}</span>)}</div>
                      </div>
                      {subtitleCol && <div className="mt-0.5 text-[12.5px] text-ink-2">{subtitleCol.cell(row)}</div>}
                      {metaCols.length > 0 && (
                        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
                          {metaCols.map((c) => (
                            <div key={c.id} className="min-w-0">
                              <dt className="label">{c.header}</dt>
                              <dd className="num mt-0.5 text-[12.5px] text-ink">{c.cell(row)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                    {rowActions && <div className="shrink-0">{rowActions(row)}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Pagination */}
      {!loading && sorted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-3 py-2">
          <p className="num text-[12px] text-ink-3" aria-live="polite">
            {t("common.showing", { from: fmt.num(safePage * pageSize + 1), to: fmt.num(Math.min(sorted.length, (safePage + 1) * pageSize)), total: fmt.num(sorted.length) })}
          </p>
          <div className="flex items-center gap-2">
            <label className="hidden items-center gap-2 text-[12px] text-ink-3 sm:flex">
              {t("common.rowsPerPage")}
              <Select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="!h-7 !w-[68px] !text-[12px]">
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {fmt.num(n)}
                  </option>
                ))}
              </Select>
            </label>
            <span className="num text-[12px] text-ink-2">{t("common.page", { n: fmt.num(safePage + 1), total: fmt.num(pageCount) })}</span>
            <IconButton icon={ChevronLeft} label={t("common.previous")} size="sm" tooltipSide="top" className="rtl:-scale-x-100" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} />
            <IconButton icon={ChevronRight} label={t("common.next")} size="sm" tooltipSide="top" className="rtl:-scale-x-100" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} />
          </div>
        </div>
      )}
    </div>
  );
}
