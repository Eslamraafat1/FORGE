"use client";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Check, X } from "lucide-react";
import { useT } from "@/i18n";
import { Button, IconButton, cn } from "./primitives";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Focus trap + Escape + scroll lock + focus restore for modal surfaces. */
function useModalBehaviour(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const target = el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
      target.focus({ preventScroll: true });
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const nodes = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);
  return ref;
}

const noopSubscribe = () => () => {};

function Portal({ children }: { children: ReactNode }) {
  // True on the client only (portals need document.body).
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const { t } = useT();
  const ref = useModalBehaviour(open, onClose);
  const titleId = useId();
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="no-print fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
            <motion.div
              className="absolute inset-0 bg-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              onClick={onClose}
              aria-hidden
            />
            <motion.div
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              initial={{ opacity: 0, y: 14, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
              className={cn(
                "relative flex max-h-[92dvh] w-full flex-col border border-line-2 bg-base shadow-pop outline-none sm:rounded-lg",
                size === "sm" && "sm:max-w-md",
                size === "md" && "sm:max-w-xl",
                size === "lg" && "sm:max-w-3xl",
              )}
            >
              <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-[15px] font-semibold text-ink">
                    {title}
                  </h2>
                  {description && <p className="mt-0.5 text-[12.5px] text-ink-3">{description}</p>}
                </div>
                <IconButton icon={X} label={t("common.close")} size="sm" onClick={onClose} />
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
              {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/40 px-5 py-3">{footer}</footer>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/* ------------------------------------------------------------------ */
/* Drawer (side panel; slides from the inline end)                     */
/* ------------------------------------------------------------------ */

export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const { t, rtl } = useT();
  const ref = useModalBehaviour(open, onClose);
  const titleId = useId();
  const off = rtl ? "-100%" : "100%";
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="no-print fixed inset-0 z-[80]">
            <motion.div className="absolute inset-0 bg-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} onClick={onClose} aria-hidden />
            <motion.div
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              initial={{ x: off }}
              animate={{ x: 0 }}
              exit={{ x: off }}
              transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
              style={{ width: `min(100vw, ${width}px)` }}
              className="absolute inset-y-0 end-0 flex flex-col border-s border-line-2 bg-base shadow-pop outline-none"
            >
              <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
                <div className="min-w-0">
                  {eyebrow && <div className="label mb-1">{eyebrow}</div>}
                  <h2 id={titleId} className="text-[15px] font-semibold text-ink">
                    {title}
                  </h2>
                </div>
                <IconButton icon={X} label={t("common.close")} size="sm" onClick={onClose} />
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
              {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/40 px-5 py-3">{footer}</footer>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/* ------------------------------------------------------------------ */
/* Confirm dialog                                                      */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  danger,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}) {
  const { t } = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            data-autofocus
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel ?? t("common.confirm")}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {danger && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-danger/40 bg-danger/10 text-danger">
            <AlertTriangle aria-hidden className="size-4" />
          </span>
        )}
        <div className="text-[13px] leading-relaxed text-ink-2">{body}</div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Popover & menu                                                      */
/* ------------------------------------------------------------------ */

/**
 * Anchored popover. Positions itself against the trigger with fixed
 * coordinates so it is never clipped by scroll containers.
 */
export function Popover({
  trigger,
  children,
  align = "end",
  width,
  open: controlled,
  onOpenChange,
  label,
}: {
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "dialog" | "menu" }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  width?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: string;
}) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = useCallback(
    (v: boolean) => {
      setInner(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const p = panel.current;
      if (!a || !p) return;
      const w = p.offsetWidth;
      const rtl = document.documentElement.dir === "rtl";
      const alignRight = (align === "end") !== rtl;
      let left = alignRight ? a.right - w : a.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      const below = window.innerHeight - a.bottom - 12;
      const above = a.top - 12;
      const h = p.scrollHeight;
      const placeAbove = below < Math.min(h, 220) && above > below;
      const maxHeight = Math.max(140, placeAbove ? above : below);
      const top = placeAbove ? Math.max(8, a.top - Math.min(h, maxHeight) - 6) : a.bottom + 6;
      setPos({ top, left, maxHeight });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      setPos(null);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        anchor.current?.querySelector<HTMLElement>("button")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  return (
    <>
      <span ref={anchor} className="inline-flex">
        {trigger({ onClick: () => setOpen(!open), "aria-expanded": open, "aria-haspopup": "dialog" })}
      </span>
      {open && (
        <Portal>
          <div
            ref={panel}
            role="dialog"
            aria-label={label}
            className="no-print fixed z-[90] animate-fade overflow-y-auto rounded-lg border border-line-2 bg-raised shadow-pop"
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width, maxHeight: pos?.maxHeight, visibility: pos ? "visible" : "hidden" }}
          >
            {children(() => setOpen(false))}
          </div>
        </Portal>
      )}
    </>
  );
}

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Shows a check mark (for single-choice menus). */
  checked?: boolean;
  hint?: string;
}

/** Dropdown action menu with arrow-key navigation. `null` entries render a divider. */
export function Menu({
  trigger,
  items,
  align = "end",
  label,
  width = 208,
}: {
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "dialog" | "menu" }) => ReactNode;
  items: (MenuItem | null)[];
  align?: "start" | "end";
  label: string;
  width?: number;
}) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const nodes = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])')];
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      nodes[(i + 1) % nodes.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nodes[(i - 1 + nodes.length) % nodes.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      nodes[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      nodes[nodes.length - 1]?.focus();
    }
  };
  return (
    <Popover trigger={(p) => trigger({ ...p, "aria-haspopup": "menu" })} align={align} width={width} label={label}>
      {(close) => (
        <MenuList onKeyDown={onKeyDown} label={label}>
          {items.map((item, i) =>
            item === null ? (
              <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-line" />
            ) : (
              <button
                key={item.label}
                type="button"
                role={item.checked !== undefined ? "menuitemradio" : "menuitem"}
                aria-checked={item.checked}
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-[7px] text-start text-[12.5px] outline-none transition-colors focus:bg-panel enabled:hover:bg-panel disabled:opacity-40",
                  item.danger ? "text-danger" : "text-ink",
                )}
              >
                {item.icon && <item.icon aria-hidden className="size-3.5 shrink-0 text-ink-3" />}
                <span className="min-w-0 flex-1">
                  {item.label}
                  {item.hint && <span className="block text-[11px] text-ink-3">{item.hint}</span>}
                </span>
                {item.checked && <Check aria-hidden className="size-3.5 shrink-0 text-forge-text" />}
              </button>
            ),
          )}
        </MenuList>
      )}
    </Popover>
  );
}

function MenuList({ children, onKeyDown, label }: { children: ReactNode; onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={ref} role="menu" aria-label={label} onKeyDown={onKeyDown} className="p-1">
      {children}
    </div>
  );
}
