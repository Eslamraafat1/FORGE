"use client";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { FileSearch } from "lucide-react";
import { Logo } from "@/components/shell/Sidebar";
import { Button, Code, EmptyState, SimBadge, cn } from "@/components/ui/primitives";
import { useT } from "@/i18n";
import { useFmt } from "@/lib/format";
import { formatCell, type Report, type ReportColumn, type ReportRow } from "./build";

/** Rows rendered on screen before the reader asks for more. Printing always renders every row. */
const PAGE = 50;

function Cell({ row, column, strong }: { row: ReportRow; column: ReportColumn; strong?: boolean }) {
  const fmt = useFmt();
  const { t } = useT();
  const value = row.cells[column.key] ?? null;
  const text = formatCell(value, column.kind, fmt, t("common.notAvailable"));
  return (
    <td
      className={cn(
        "px-2.5 py-1.5 align-top print:px-1 print:py-1",
        column.align === "end" ? "num whitespace-nowrap text-end" : "text-start print:break-words",
        strong ? "font-semibold text-ink" : column.align === "end" ? "text-ink" : "text-ink-2",
      )}
    >
      {column.kind === "code" && typeof value === "string" && !strong ? <Code className="text-[11.5px] text-ink print:text-[9px]">{text}</Code> : text}
    </td>
  );
}

/**
 * Document-style rendering of a Report. This is also exactly what gets
 * printed: everything around it carries `no-print`.
 */
export function ReportSheet({ report }: { report: Report }) {
  const { t } = useT();
  const fmt = useFmt();
  const [limit, setLimit] = useState(PAGE);
  const [printing, setPrinting] = useState(false);

  // The printed document must contain every row, not just the on-screen page.
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const total = report.rows.length;
  const rows = printing ? report.rows : report.rows.slice(0, limit);
  const truncated = rows.length < total;

  return (
    <article
      aria-label={report.title}
      className="min-w-0 rounded-md border border-line-2 bg-base print:rounded-none print:border-0"
    >
      {/* Letterhead */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b-2 border-forge px-5 py-4 print:px-0 print:pt-0">
        <div>
          <Logo />
          <p className="label mt-1.5">{t("brand.product")}</p>
        </div>
        <dl className="text-[11.5px] text-ink-3 sm:text-end">
          <div className="flex gap-1.5 sm:justify-end">
            <dt>{t("reports.sheet.document")}</dt>
            <dd>
              <Code className="text-[11px] text-ink-2">{`RPT-${report.id.toUpperCase()}`}</Code>
            </dd>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            <dt>{t("reports.sheet.generated")}</dt>
            <dd className="num text-ink-2">{`${fmt.date(report.generatedAt)} · ${fmt.time(report.generatedAt)}`}</dd>
          </div>
          <div className="sm:text-end">{t("reports.sheet.simClock")}</div>
        </dl>
      </header>

      <div className="flex flex-col gap-5 px-5 py-5 print:gap-4 print:px-0">
        {/* Title */}
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="display text-[26px] text-ink print:text-[20px]">{report.title}</h2>
            <SimBadge label={report.snapshot ? t("reports.badge.liveSnapshot") : undefined} />
          </div>
          <p className="mt-1.5 text-[13px] text-ink-2 print:text-[11px]">{report.subtitle}</p>
        </div>

        {/* Filters applied */}
        <section aria-label={t("reports.sheet.filters")}>
          <h3 className="label mb-1.5">{t("reports.sheet.filters")}</h3>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] print:text-[10px]">
            {report.filters.map((f) => (
              <div key={f.label} className="flex gap-1.5">
                <dt className="text-ink-3">{f.label}:</dt>
                <dd className="num font-medium text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Summary */}
        <section aria-label={t("common.summary")}>
          <h3 className="label mb-1.5">{t("common.summary")}</h3>
          <dl className="grid grid-cols-2 border-s border-t border-line sm:grid-cols-3 xl:grid-cols-6 print:grid-cols-6">
            {report.summary.map((s) => (
              <div key={s.label} className="min-w-0 break-inside-avoid border-b border-e border-line px-3 py-2.5 print:px-1.5 print:py-1.5">
                <dt className="text-[11.5px] text-ink-3 print:text-[8.5px]">{s.label}</dt>
                <dd className="num mt-0.5 break-words text-[15px] font-semibold text-ink print:text-[10.5px]">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Data */}
        <section aria-label={t("reports.sheet.data")} className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="label">{t("reports.sheet.data")}</h3>
            <p className="num text-[11.5px] text-ink-3">{t("reports.sheet.rows", { n: total })}</p>
          </div>
          {total === 0 ? (
            <div className="border border-dashed border-line">
              <EmptyState icon={FileSearch} title={t("reports.sheet.empty")} hint={t("reports.sheet.emptyHint")} />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto border border-line print:overflow-visible print:border-0">
                <table className="w-full border-collapse text-[12.5px] print:text-[9px]">
                  <caption className="sr-only">{report.title}</caption>
                  <thead className="print:table-header-group">
                    <tr className="border-b border-line-2 bg-canvas/60 print:bg-transparent">
                      {report.columns.map((c) => (
                        <th
                          key={c.key}
                          scope="col"
                          className={cn(
                            "whitespace-nowrap px-2.5 py-2 align-bottom text-[11px] font-semibold text-ink-2 print:whitespace-normal print:px-1 print:py-1 print:text-[8.5px]",
                            c.align === "end" ? "text-end" : "text-start",
                          )}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="break-inside-avoid border-b border-line/60">
                        {report.columns.map((c) => (
                          <Cell key={c.key} row={r} column={c} />
                        ))}
                      </tr>
                    ))}
                    {report.totals && !truncated && (
                      <tr className="break-inside-avoid border-t-2 border-line-2 bg-canvas/60 print:bg-transparent">
                        {report.columns.map((c) => (
                          <Cell key={c.key} row={report.totals!} column={c} strong />
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {truncated && (
                <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="num text-[12px] text-ink-2" aria-live="polite">
                    {t("reports.sheet.showing", { shown: rows.length, total })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setLimit((n) => n + PAGE * 2)}>
                      {t("reports.sheet.showMore", { n: Math.min(PAGE * 2, total - rows.length) })}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setLimit(total)}>
                      {t("reports.sheet.showAll")}
                    </Button>
                  </div>
                </div>
              )}
              {truncated && report.totals && (
                <dl className="no-print mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-2 text-[12.5px]">
                  <dt className="font-semibold text-ink">{t("reports.sheet.totalsAll", { n: total })}</dt>
                  {report.columns
                    .filter((c) => c.align === "end" && report.totals!.cells[c.key] !== null && report.totals!.cells[c.key] !== undefined)
                    .map((c) => (
                      <dd key={c.key} className="num text-ink-2">
                        {c.label}: <span className="font-semibold text-ink">{formatCell(report.totals!.cells[c.key] ?? null, c.kind, fmt)}</span>
                      </dd>
                    ))}
                </dl>
              )}
            </>
          )}
        </section>

        {/* Notes */}
        {report.notes.length > 0 && (
          <section aria-label={t("common.notes")} className="break-inside-avoid">
            <h3 className="label mb-1.5">{t("common.notes")}</h3>
            <ul className="list-disc space-y-0.5 ps-4 text-[12px] text-ink-3 print:text-[9px]">
              {report.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line px-5 py-3 text-[11.5px] text-ink-3 print:px-0 print:text-[8.5px]">
        <span>{t("reports.sheet.footer")}</span>
        <span dir="ltr" className="code">
          FORGE · RPT-{report.id.toUpperCase()}
        </span>
      </footer>
    </article>
  );
}
