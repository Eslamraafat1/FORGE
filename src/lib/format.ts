"use client";
import { useMemo } from "react";
import { numberLocale } from "@/i18n";
import { usePrefs } from "@/store/prefs";
import { DAY, HOUR, MIN } from "@/lib/time";

export interface Fmt {
  locale: string;
  /** Plain number with grouping. */
  num(n: number, digits?: number): string;
  /** Ratio → percent, e.g. 0.934 → "93.4%". */
  pct(ratio: number, digits?: number): string;
  /** Signed percent change, e.g. 0.042 → "+4.2%". */
  signedPct(ratio: number, digits?: number): string;
  /** USD, whole dollars by default. */
  money(n: number, digits?: number): string;
  /** Compact number, e.g. 1.2M. */
  compact(n: number): string;
  compactMoney(n: number): string;
  date(ts: number): string;
  dateShort(ts: number): string;
  time(ts: number): string;
  dateTime(ts: number): string;
  weekday(ts: number): string;
  /** "12 min ago" / "in 3 days", relative to `now`. */
  relative(ts: number, now: number): string;
  /** Minutes → "1 h 32 min". */
  duration(minutes: number): string;
}

export function useFmt(): Fmt {
  const lang = usePrefs((s) => s.lang);
  const numerals = usePrefs((s) => s.numerals);
  return useMemo(() => {
    const locale = numberLocale(lang, numerals);
    const nf = (o?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, o);
    const cache = new Map<number, Intl.NumberFormat>();
    const fixed = (d: number) => {
      let f = cache.get(d);
      if (!f) cache.set(d, (f = nf({ minimumFractionDigits: d, maximumFractionDigits: d })));
      return f;
    };
    const moneyCache = new Map<number, Intl.NumberFormat>();
    const money = (d: number) => {
      let f = moneyCache.get(d);
      if (!f) moneyCache.set(d, (f = nf({ style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d })));
      return f;
    };
    const compact = nf({ notation: "compact", maximumFractionDigits: 1 });
    const compactMoney = nf({ notation: "compact", maximumFractionDigits: 1, style: "currency", currency: "USD" });
    const df = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, o);
    const date = df({ year: "numeric", month: "short", day: "numeric" });
    const dateShort = df({ month: "short", day: "numeric" });
    const time = df({ hour: "2-digit", minute: "2-digit", hour12: false });
    const dateTime = df({ month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    const weekday = df({ weekday: "short" });
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
    const hUnit = lang === "ar" ? "س" : "h";
    const mUnit = lang === "ar" ? "د" : "min";
    return {
      locale,
      num: (n, digits = 0) => fixed(digits).format(n),
      pct: (ratio, digits = 1) => `${fixed(digits).format(ratio * 100)}%`,
      signedPct: (ratio, digits = 1) => `${ratio > 0 ? "+" : ratio < 0 ? "−" : ""}${fixed(digits).format(Math.abs(ratio) * 100)}%`,
      money: (n, digits = 0) => money(digits).format(n),
      compact: (n) => compact.format(n),
      compactMoney: (n) => compactMoney.format(n),
      date: (ts) => date.format(ts),
      dateShort: (ts) => dateShort.format(ts),
      time: (ts) => time.format(ts),
      dateTime: (ts) => dateTime.format(ts),
      weekday: (ts) => weekday.format(ts),
      relative: (ts, now) => {
        const diff = ts - now;
        const abs = Math.abs(diff);
        if (abs < HOUR) return rtf.format(Math.round(diff / MIN), "minute");
        if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
        return rtf.format(Math.round(diff / DAY), "day");
      },
      duration: (minutes) => {
        const m = Math.max(0, Math.round(minutes));
        const h = Math.floor(m / 60);
        const rest = m % 60;
        if (h === 0) return `${fixed(0).format(rest)} ${mUnit}`;
        return rest === 0 ? `${fixed(0).format(h)} ${hUnit}` : `${fixed(0).format(h)} ${hUnit} ${fixed(0).format(rest)} ${mUnit}`;
      },
    };
  }, [lang, numerals]);
}
