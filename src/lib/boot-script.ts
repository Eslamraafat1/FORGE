/** Server-safe module (no "use client"): shared by the root layout and the prefs store. */
export const PREFS_KEY = "forge-prefs";

/**
 * Inline script run before first paint: applies the persisted theme, language
 * and direction so there is no flash of the wrong theme or layout direction.
 */
export const PREFS_BOOT_SCRIPT = `(function(){try{var r=localStorage.getItem(${JSON.stringify(PREFS_KEY)});var s=r?JSON.parse(r).state:{};var e=document.documentElement;e.dataset.theme=s.theme==='light'?'light':'dark';var l=s.lang==='ar'?'ar':'en';e.lang=l;e.dir=l==='ar'?'rtl':'ltr';e.dataset.motion=s.motion==='reduced'?'reduced':'system';}catch(_){document.documentElement.dataset.theme='dark';}})();`;
