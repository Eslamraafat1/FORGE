"use client";
import { useMemo } from "react";
import type { L10n, Msg } from "@/domain/types";
import { usePrefs, type Lang } from "@/store/prefs";
import { coreEn } from "./dict/core.en";
import { coreAr } from "./dict/core.ar";
import { commandDict } from "./dict/command";
import { assetsDict } from "./dict/assets";
import { productionDict } from "./dict/production";
import { resourcesDict } from "./dict/resources";
import { intelDict } from "./dict/intel";
import { adminDict } from "./dict/admin";
import { factoryDict } from "./dict/factory";
import { planningDict } from "./dict/planning";
import { procurementDict } from "./dict/procurement";

const en = { ...coreEn, ...commandDict.en, ...assetsDict.en, ...productionDict.en, ...resourcesDict.en, ...intelDict.en, ...adminDict.en, ...factoryDict.en, ...planningDict.en, ...procurementDict.en };
const ar: Record<keyof typeof en, string> = { ...coreAr, ...commandDict.ar, ...assetsDict.ar, ...productionDict.ar, ...resourcesDict.ar, ...intelDict.ar, ...adminDict.ar, ...factoryDict.ar, ...planningDict.ar, ...procurementDict.ar };

export type TKey = keyof typeof en;
export type TParams = Record<string, string | number | L10n>;

const dicts: Record<Lang, Record<string, string>> = { en, ar };

export function numberLocale(lang: Lang, numerals: "latn" | "arab"): string {
  return lang === "ar" ? `ar-EG-u-nu-${numerals}` : "en-US";
}

function isL10n(v: unknown): v is L10n {
  return typeof v === "object" && v !== null && "en" in v && "ar" in v;
}

export function translate(lang: Lang, key: string, params?: TParams, locale = "en-US"): string {
  const template = dicts[lang][key] ?? dicts.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name];
    if (v === undefined) return `{${name}}`;
    if (isL10n(v)) return v[lang];
    if (typeof v === "number") return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v);
    // "@some.key" params are themselves dictionary keys (e.g. a status label).
    if (v.startsWith("@")) return translate(lang, v.slice(1), undefined, locale);
    return v;
  });
}

export interface I18n {
  lang: Lang;
  dir: "ltr" | "rtl";
  rtl: boolean;
  /** Translate a dictionary key. */
  t(key: TKey, params?: TParams): string;
  /** Translate a dynamically built key (enum labels, e.g. `wostatus.${status}`). */
  td(key: string, params?: TParams): string;
  /** Render a stored message (activity, alert, error). */
  tm(msg: Msg): string;
  /** Pick the right language from a bilingual value. */
  tl(value: L10n): string;
}

export function useT(): I18n {
  const lang = usePrefs((s) => s.lang);
  const numerals = usePrefs((s) => s.numerals);
  return useMemo(() => {
    const locale = numberLocale(lang, numerals);
    const td = (key: string, params?: TParams) => translate(lang, key, params, locale);
    return {
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      rtl: lang === "ar",
      t: td as I18n["t"],
      td,
      tm: (msg) => td(msg.key, msg.params),
      tl: (value) => value[lang],
    };
  }, [lang, numerals]);
}
