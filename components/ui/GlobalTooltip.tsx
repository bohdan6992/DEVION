"use client";

import React from "react";
import { createPortal } from "react-dom";

/**
 * One dark tooltip for the whole app, in place of the browser's white `title` bubble.
 *
 * WHY GLOBAL AND NOT A <Tooltip> WRAPPER. The app carries ~2,300 `title=` attributes in ~155 files
 * (every toolbar pill explains itself that way). Swapping each for a component would be 155 edits that
 * the next new pill would silently not follow - it would just put a white bubble back. This listens
 * once on the document, so a `title` written anywhere, today or next year, gets the house style.
 *
 * HOW. On hover/focus of an element that has a `title`, the attribute is moved aside (otherwise the
 * browser would draw its own bubble on top of this one) and put back the moment the pointer leaves,
 * so nothing that reads `title` - React's props, tests, assistive tech outside a hover - ever sees it
 * missing for longer than the hover.
 *
 * The card is the app's own glass surface - the one every scanner stat card uses (GlassCard: `bg-[#0a0a0a]`
 * + `backdrop-blur-xl`, `border-white/[0.06]`, `rounded-2xl`, `shadow-xl`), a little more opaque so text stays
 * readable over a table - with mono text and is drawn through a portal on <body>: the page canvas is scaled with
 * a CSS transform (`#app-scale`), which would otherwise scale and clip it. Its position comes from the
 * host's on-screen rect, clamped to the viewport and flipped above when there is no room below.
 *
 * Opt out with `data-native-title` on an element that must keep the browser's bubble. Touch is ignored
 * (there is no hover). Tags where `title` is not a tooltip (iframe, link, meta ...) are skipped.
 */
const SKIP_TAGS = new Set(["IFRAME", "LINK", "STYLE", "META", "SCRIPT", "HTML", "BODY", "TITLE", "BASE"]);
const SHOW_DELAY_MS = 140;
const GAP = 8;

type Tip = { text: string; left: number; right: number; top: number; bottom: number };
type Pos = { left: number; top: number };

function findHost(start: EventTarget | null): HTMLElement | null {
  let el: Element | null = start instanceof Element ? start : null;
  while (el && el !== document.body) {
    if (
      el instanceof HTMLElement &&
      !SKIP_TAGS.has(el.tagName) &&
      !el.hasAttribute("data-native-title") &&
      (el.getAttribute("title") ?? "").trim() !== ""
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

export default function GlobalTooltip() {
  const [mounted, setMounted] = React.useState(false);
  const [tip, setTip] = React.useState<Tip | null>(null);
  const [pos, setPos] = React.useState<Pos | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    let host: HTMLElement | null = null;
    let saved = "";
    // Ancestors whose own `title` is parked too (see begin): with the host's title gone the browser would
    // fall back to the NEAREST ANCESTOR's and draw its white bubble over ours.
    let parkedAncestors: Array<[HTMLElement, string]> = [];
    let timer: number | null = null;
    let watch: number | null = null;
    let mo: MutationObserver | null = null;

    const restore = () => {
      if (host && saved && !host.hasAttribute("title")) host.setAttribute("title", saved);
      for (const [el, t] of parkedAncestors) if (!el.hasAttribute("title")) el.setAttribute("title", t);
      parkedAncestors = [];
      host = null;
      saved = "";
    };
    const hide = () => {
      if (timer != null) window.clearTimeout(timer);
      if (watch != null) window.clearInterval(watch);
      mo?.disconnect();
      mo = null;
      timer = watch = null;
      restore();
      setTip(null);
      setPos(null);
    };
    const begin = (el: HTMLElement) => {
      const text = (el.getAttribute("title") ?? "").trim();
      if (!text) return;
      host = el;
      saved = el.getAttribute("title") ?? "";
      el.removeAttribute("title"); // the browser must not draw its own bubble over ours
      // ...nor its ancestors' (a button inside a titled group would otherwise show the GROUP's bubble).
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const t = a.getAttribute("title");
        if (t && !a.hasAttribute("data-native-title") && !SKIP_TAGS.has(a.tagName)) {
          parkedAncestors.push([a, t]);
          a.removeAttribute("title");
        }
      }
      // React re-applies `title` whenever the prop changes (a toggle's "on"/"off" wording flips when it is
      // clicked). Without this the parked copy goes stale and the card would keep saying the OLD text.
      mo = new MutationObserver(() => {
        const cur = host?.getAttribute("title");
        if (!host || !cur) return;
        saved = cur;
        host.removeAttribute("title");
        setTip((t) => (t ? { ...t, text: cur.trim() } : t));
      });
      mo.observe(el, { attributes: true, attributeFilter: ["title"] });
      timer = window.setTimeout(() => {
        timer = null;
        if (!host || !host.isConnected) return hide();
        const r = host.getBoundingClientRect();
        const latest = saved.trim() || text;
        setTip({ text: latest, left: r.left, right: r.right, top: r.top, bottom: r.bottom });
        // A host that unmounts while hovered would leave the card pointing at nothing.
        watch = window.setInterval(() => {
          if (!host || !host.isConnected) hide();
        }, 300);
      }, SHOW_DELAY_MS);
    };

    const enter = (target: EventTarget | null) => {
      let next = findHost(target);
      // Inside the current host's own children (its title - and its ancestors' - are parked, so findHost
      // finds nothing) - stay.
      if (!next && host && target instanceof Node && host.contains(target)) return;
      if (next && next === host) return;
      // Anywhere else: put every parked title back FIRST, then look again - the element now under the
      // pointer may be one of the ancestors that was parked a moment ago.
      if (host) {
        hide();
        next = findHost(target);
      }
      if (next) begin(next);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      enter(e.target);
    };
    const onOut = (e: PointerEvent) => {
      if (!host) return;
      const rel = e.relatedTarget as Node | null;
      if (rel && host.contains(rel)) return;
      hide();
    };
    const onFocusIn = (e: FocusEvent) => enter(e.target);
    const onFocusOut = () => hide();

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("wheel", hide, { capture: true, passive: true });
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("wheel", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Position once the card has a size: centred under the host, clamped to the viewport, flipped above
  // when it would run off the bottom.
  React.useLayoutEffect(() => {
    if (!tip || !cardRef.current) return;
    const { width: w, height: h } = cardRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(GAP, Math.min(vw - w - GAP, (tip.left + tip.right) / 2 - w / 2));
    let top = tip.bottom + GAP;
    if (top + h > vh - GAP) top = Math.max(GAP, tip.top - h - GAP);
    setPos({ left, top });
  }, [tip]);

  if (!mounted || !tip) return null;
  return createPortal(
    <div
      ref={cardRef}
      role="tooltip"
      className="pointer-events-none w-max whitespace-pre-line break-words rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/70 px-3.5 py-2.5 text-[11px] font-mono leading-snug text-zinc-300 shadow-xl backdrop-blur-xl"
      // position and z-index are INLINE on purpose: themes.css gives every direct child of <body>
      // `position: relative; z-index: 1` (html[data-theme=...] body > *), which out-ranks the
      // `fixed` / `z-*` utility classes - the card then sat in the page flow, 1920px wide, off screen.
      // maxWidth inline too: globals.css has `.zoom-mode [class*="max-w-"] { max-width: none !important }`,
      // which would strip a `max-w-*` class and let a long title run 1,000px wide.
      style={{
        position: "fixed",
        zIndex: 2147483000,
        maxWidth: 340,
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {tip.text}
    </div>,
    document.body
  );
}
