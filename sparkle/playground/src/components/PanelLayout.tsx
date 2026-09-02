import {
  ArrowLeft,
  Button,
  LayoutLeft,
  LayoutRight,
  Maximize01,
  Menu01,
  Minimize01,
  XClose,
} from "@dust-tt/sparkle";
import { customColors } from "@dust-tt/sparkle/lib/colors";
import {
  cloneElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { allocateFocusPanels, applySplitDrag } from "./panelAllocate";

// ── Constants ─────────────────────────────────────────────────────────────────

const MOBILE_BREAKPOINT = 768;
const MIN_NAV = 160,
  MAX_NAV = 320;
const PANEL_MINIMAL = 384; // --breakpoint-xxs — hard floor for any panel
const PANEL_COMPACT = 512; // --breakpoint-xs — width of non-focus panels
// Panel-count caps by stage width. Principle: a column count unlocks only
// when every panel can sit at ≥ compact width, and the sidebar joins only
// when it fits on top of that — between the two thresholds the layout shows
// the panels with the nav hidden. Under 14" (NAV_AUTOHIDE_BELOW, a
// device-anchored choice) the nav also yields as soon as a second panel
// opens. Never more than four panels.
const NAV_AUTOHIDE_BELOW = 1512;
const THREE_PANELS_FROM = 1600;
const NAV_WITH_THREE_PANELS_FROM = 1900;
const FOUR_PANELS_FROM = 2100;
const NAV_WITH_FOUR_PANELS_FROM = 2400;
const NAV_CARD_GAP = 6;
const SPLIT_HANDLE = 1;

// ── Drag-resize factory ───────────────────────────────────────────────────────

function makeDragResize({
  getCurrent,
  set,
  min,
  max,
  onStart,
  onEnd,
}: {
  getCurrent: () => number;
  set: (v: number) => void;
  min: number;
  max: number;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  return (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = getCurrent();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    onStart?.();
    const move = (ev: PointerEvent) =>
      set(Math.max(min, Math.min(max, startW + (ev.clientX - startX))));
    const up = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onEnd?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
}

// ── PanelTopBar ───────────────────────────────────────────────────────────────

interface PanelTopBarProps {
  left?: ReactNode;
  right?: ReactNode;
  /** When false, the bottom border fades out (used until content scrolls). */
  hasBorder?: boolean;
}

export function PanelTopBar({
  left,
  right,
  hasBorder = true,
}: PanelTopBarProps) {
  return (
    <header
      className={[
        "group/topbar flex h-[52px] flex-none items-center justify-between gap-2 overflow-x-clip whitespace-nowrap border-b transition-colors duration-200 px-2",
        hasBorder ? "border-separator" : "border-transparent",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {left}
      </div>
      {right && (
        <div className="flex flex-none items-center gap-1">{right}</div>
      )}
    </header>
  );
}

// ── PanelSection ──────────────────────────────────────────────────────────────
// A panel = its top bar + a scrollable content area. Tracks whether the inner
// content has scrolled away from the top (via a capture-phase scroll listener,
// since scroll events from descendants do not bubble) and toggles the top bar's
// bottom border accordingly.

interface PanelSectionProps {
  width: number;
  isNav: boolean;
  topBar: ReactElement<PanelTopBarProps>;
  content: ReactNode;
  /** Changing this resets the scrolled state (e.g. when the view swaps). */
  resetKey: string;
  dragging: boolean;
}

function PanelSection({
  width,
  isNav,
  topBar,
  content,
  resetKey,
  dragging,
}: PanelSectionProps) {
  const hidden = width === 0;
  const contentRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) {
      return;
    }
    const onScroll = (e: Event) => {
      const target = e.target as HTMLElement | null;
      setIsScrolled(!!target && target.scrollTop > 0);
    };
    // Capture phase so we catch scroll from the nested scroller(s) inside.
    el.addEventListener("scroll", onScroll, true);
    return () => el.removeEventListener("scroll", onScroll, true);
  }, []);

  // Reset when the view changes or the panel gets hidden: no scroll event fires
  // when fresh, unscrolled content swaps in.
  useEffect(() => {
    setIsScrolled(false);
  }, [resetKey, hidden]);

  // The scrollable content area (shared by nav and content panels). When empty,
  // it shows a diagonal hatch placeholder.
  const contentArea = (
    <div
      ref={contentRef}
      className={[
        "relative flex min-h-0 flex-1 flex-col overflow-hidden",
        !content
          ? isNav
            ? "bg-[repeating-linear-gradient(45deg,transparent_0,transparent_11px,rgba(0,0,0,0.06)_11px,rgba(0,0,0,0.06)_12px)]"
            : "bg-[repeating-linear-gradient(45deg,transparent_0,transparent_11px,rgba(0,0,0,0.04)_11px,rgba(0,0,0,0.04)_12px)]"
          : "",
      ].join(" ")}
    >
      {content}
    </div>
  );

  // Nav (P1) is flush against the muted canvas. Content panels (P2+) are
  // columns inside the shared white card in PanelLayout.
  return (
    <section
      className={[
        "relative flex h-full min-w-0 flex-none flex-col overflow-x-clip overflow-y-hidden",
        isNav ? "bg-app-background" : "",
        dragging
          ? ""
          : "transition-[width] duration-[260ms] ease-[cubic-bezier(.4,0,.2,1)]",
      ].join(" ")}
      style={{ width }}
      {...(hidden ? { inert: "" } : {})} // inert not in React's HTMLAttributes yet
    >
      {cloneElement(topBar, { hasBorder: isScrolled })}
      {contentArea}
    </section>
  );
}

// ── Internal resize handle ────────────────────────────────────────────────────

function ResizeHandle({
  visible,
  onPointerDown,
  variant = "gap",
}: {
  visible: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  variant?: "gap" | "split";
}) {
  if (variant === "split") {
    return (
      <div
        className={[
          "group relative z-[5] flex flex-none items-stretch",
          visible
            ? "w-px cursor-col-resize"
            : "pointer-events-none w-0 overflow-hidden",
        ].join(" ")}
        onPointerDown={visible ? onPointerDown : undefined}
      >
        {visible ? (
          <>
            <div className="absolute inset-y-0 -left-[3px] -right-[3px]" />
            <div className="relative z-[1] w-px bg-separator transition-all duration-[120ms] group-hover:w-[2px] group-hover:[background:var(--panel-resize-focus-border)] group-active:w-[2px] group-active:[background:var(--panel-resize-focus-border)]" />
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={[
        "group relative z-[5] flex flex-none items-stretch",
        visible
          ? "w-[6px] cursor-col-resize"
          : "pointer-events-none w-0 overflow-hidden",
      ].join(" ")}
      onPointerDown={visible ? onPointerDown : undefined}
    >
      {visible ? (
        <div className="mx-auto w-px bg-transparent transition-all duration-[120ms] group-hover:w-[2px] group-hover:[background:var(--panel-resize-focus-border)] group-active:w-[2px] group-active:[background:var(--panel-resize-focus-border)]" />
      ) : null}
    </div>
  );
}

// ── PanelLayoutNav ────────────────────────────────────────────────────────────

export interface PanelLayoutNavProps {
  topBarLeft?: ReactNode;
  topBarRight?: ReactNode;
  children?: ((onClose: () => void) => ReactNode) | ReactNode;
}

// Marker — PanelLayout identifies this slot by displayName.
export function PanelLayoutNav(_props: PanelLayoutNavProps) {
  return null;
}
PanelLayoutNav.displayName = "PanelLayoutNav";

// ── PanelLayoutPanel ──────────────────────────────────────────────────────────

export type PanelSizingType = "default" | "secondary" | "shared";

export interface PanelLayoutPanelProps {
  label: string;
  /** Controlled: whether this panel is open. P2 (index 0) is always open. */
  isOpen: boolean;
  /** Called when the panel's close button / back button is triggered. */
  onClose: () => void;
  /**
   * default — takes focus when it enters; the focus panel gets the remaining
   * space while every other panel sits at its compact width.
   * secondary — never takes focus, always sits at its compact width.
   * shared — never takes focus, but splits the remaining space 50/50 with it.
   */
  sizingType?: PanelSizingType;
  /** Hard floor: manual resize and the shrink cascade never go below this. */
  minimalWidth?: number;
  /** Width the panel holds when it is not the focus panel. */
  compactWidth?: number;
  /**
   * Shows a fullscreen toggle (left of the close button). Fullscreen gives
   * the panel the whole card and hides the navigation; it exits when toggled
   * again, when the panel closes or its content stops being fullscreen-able,
   * or when any panel enters or leaves.
   */
  fullscreenEnabled?: boolean;
  topBarLeft?: ReactNode;
  topBarRight?: ReactNode;
  children?: ReactNode;
}

// Marker — PanelLayout identifies these slots by displayName.
export function PanelLayoutPanel(_props: PanelLayoutPanelProps) {
  return null;
}
PanelLayoutPanel.displayName = "PanelLayoutPanel";

// ── PanelLayout ───────────────────────────────────────────────────────────────

export interface PanelLayoutProps {
  children: ReactNode;
}

export function PanelLayout({ children }: PanelLayoutProps) {
  // ── Parse children ──────────────────────────────────────────────────────
  // Slot 0 = PanelLayoutNav, slots 1-3 = PanelLayoutPanel (P2, P3, P4)
  const childArray = Array.isArray(children) ? children : [children];

  const navChild = childArray.find(
    (c: any) => c?.type?.displayName === "PanelLayoutNav"
  ) as React.ReactElement<PanelLayoutNavProps> | undefined;

  const panelChildren = childArray.filter(
    (c: any) => c?.type?.displayName === "PanelLayoutPanel"
  ) as React.ReactElement<PanelLayoutPanelProps>[];

  // Panels: [P2, P3, P4]
  const p2 = panelChildren[0];
  const p3 = panelChildren[1];
  const p4 = panelChildren[2];

  const p3Open = !!p3?.props.isOpen;
  const p4Open = !!p4?.props.isOpen;

  // Per-panel meta, indexed [P2, P3, P4].
  const panelEls = [p2, p3, p4];
  const panelOpen = [!!p2, !!p3 && p3Open, !!p4 && p4Open];
  const sizingTypes = panelEls.map((p) => p?.props.sizingType ?? "default");
  const minimalWidths = panelEls.map(
    (p) => p?.props.minimalWidth ?? PANEL_MINIMAL
  );
  const compactWidths = panelEls.map(
    (p) => p?.props.compactWidth ?? PANEL_COMPACT
  );

  // ── Internal geometry state ─────────────────────────────────────────────
  const [navW, setNavW] = useState(312);
  /** Live left-panel width while a split handle is being dragged. */
  const [dragLeftW, setDragLeftW] = useState(0);
  const [dragHandle, setDragHandle] = useState<"p2-p3" | "p3-p4" | null>(null);
  const [dragFreeze, setDragFreeze] = useState<{
    p2: number;
    p3: number;
    p4: number;
  } | null>(null);
  /** Session-only manual widths from splitter drags, cleared whenever the
   *  visible panel set or focus changes (a new panel resets everyone). */
  const [manualWidths, setManualWidths] = useState<(number | null)[]>([
    null,
    null,
    null,
  ]);

  // ── Focus panel ─────────────────────────────────────────────────────────
  // Focus = last entered "default"-type panel. Secondary and shared panels
  // never take focus. When the focus panel closes, focus returns to the
  // nearest upper (lower-index) open default panel.
  const [focusIdx, setFocusIdx] = useState(0);

  const prevOpenRef = useRef(panelOpen);
  const prevTypesRef = useRef(sizingTypes);
  if (
    prevOpenRef.current.some((wasOpen, i) => wasOpen !== panelOpen[i]) ||
    prevTypesRef.current.some((type, i) => type !== sizingTypes[i])
  ) {
    const prev = prevOpenRef.current;
    const prevTypes = prevTypesRef.current;
    let next: number | null = null;
    for (let i = 0; i < panelOpen.length; i++) {
      // A panel "enters" as default when it opens as default, or when its
      // content swaps from a secondary kind to a default one while open.
      const becameDefault =
        prevTypes[i] !== "default" && sizingTypes[i] === "default";
      if (
        panelOpen[i] &&
        sizingTypes[i] === "default" &&
        (!prev[i] || becameDefault)
      ) {
        next = i; // deepest newly-entered default panel wins
      }
    }
    // The focus panel relinquishes focus when it closes, or when its content
    // is replaced by a secondary/shared kind while open — both fall back to
    // the nearest upper open default panel.
    const focusLost =
      !panelOpen[focusIdx] || sizingTypes[focusIdx] !== "default";
    if (next === null && focusLost) {
      for (let i = focusIdx - 1; i >= 0; i--) {
        if (panelOpen[i] && sizingTypes[i] === "default") {
          next = i;
          break;
        }
      }
    }
    if (next !== null && next !== focusIdx) {
      const value = next;
      Promise.resolve().then(() => setFocusIdx(value));
    }
    prevOpenRef.current = panelOpen;
    prevTypesRef.current = sizingTypes;
  }

  // The state can lag the props by one microtask — derive the effective focus.
  const effectiveFocus = (() => {
    if (panelOpen[focusIdx] && sizingTypes[focusIdx] === "default") {
      return focusIdx;
    }
    for (let i = focusIdx - 1; i >= 0; i--) {
      if (panelOpen[i] && sizingTypes[i] === "default") {
        return i;
      }
    }
    for (let i = panelOpen.length - 1; i >= 0; i--) {
      if (panelOpen[i] && sizingTypes[i] === "default") {
        return i;
      }
    }
    for (let i = panelOpen.length - 1; i >= 0; i--) {
      if (panelOpen[i]) {
        return i;
      }
    }
    return 0;
  })();

  const focusRef = useRef(effectiveFocus);
  focusRef.current = effectiveFocus;

  const [navIntent, setNavIntent] = useState(true);
  const [navOverlay, setNavOverlay] = useState(false);
  const [navPeek, setNavPeek] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(0);
  const [cardW, setCardW] = useState(0);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const measure = () => {
      setStageW(stage.getBoundingClientRect().width);
      const card = cardRef.current;
      if (card) {
        setCardW(card.clientWidth);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    if (cardRef.current) {
      observer.observe(cardRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const isMobile = stageW > 0 && stageW < MOBILE_BREAKPOINT;

  // Restore nav when transitioning from mobile to desktop
  const prevIsMobile = useRef(isMobile);
  if (prevIsMobile.current !== isMobile) {
    if (!isMobile) Promise.resolve().then(() => setNavIntent(true));
    prevIsMobile.current = isMobile;
  }

  // ── Visible panels ──────────────────────────────────────────────────────
  // Count cap by stage width; beyond it, upper-most non-focus panels hide
  // (the focus panel always stays visible).
  const maxPanels =
    stageW === 0 || stageW >= FOUR_PANELS_FROM
      ? 4
      : stageW >= THREE_PANELS_FROM
        ? 3
        : 2;

  const openCount = panelOpen.filter(Boolean).length;
  let visible = [0, 1, 2].filter((i) => panelOpen[i]);
  while (visible.length > maxPanels) {
    const evict = visible.find((i) => i !== effectiveFocus);
    if (evict === undefined) {
      break;
    }
    visible = visible.filter((i) => i !== evict);
  }
  const panelEvicted = visible.length < openCount;

  // ── Fullscreen ────────────────────────────────────────────────────────────
  // One panel can take the whole card (nav hidden, other panels at width 0).
  // Purely presentational: focus, sizing and manual widths are untouched, so
  // exiting restores the exact previous layout.
  const fullscreenFlags = panelEls.map((p) => !!p?.props.fullscreenEnabled);
  const [fullscreenIdx, setFullscreenIdx] = useState<number | null>(null);
  const effectiveFullscreen =
    fullscreenIdx !== null &&
    !isMobile &&
    visible.includes(fullscreenIdx) &&
    fullscreenFlags[fullscreenIdx]
      ? fullscreenIdx
      : null;

  const minWidthOf = (indices: number[]) =>
    indices.reduce((sum, i) => sum + minimalWidths[i], 0) +
    Math.max(0, indices.length - 1) * SPLIT_HANDLE;

  // ── Derived visibility ──────────────────────────────────────────────────
  // The sidebar never outlives a panel: it hides whenever an open panel had
  // to be evicted (or one is fullscreen). Under 14" it also yields as soon
  // as a second panel opens; otherwise it hides only when it genuinely
  // doesn't fit next to the visible panels.
  const spaceTight =
    stageW > 0 &&
    (panelEvicted ||
      effectiveFullscreen !== null ||
      (stageW < NAV_AUTOHIDE_BELOW && visible.length >= 2) ||
      (stageW < NAV_WITH_THREE_PANELS_FROM && visible.length >= 3) ||
      (stageW < NAV_WITH_FOUR_PANELS_FROM && visible.length >= 4) ||
      navW + NAV_CARD_GAP + minWidthOf(visible) > stageW);

  const showNavInline = navIntent && !isMobile && !spaceTight;
  const navHidden = !showNavInline;

  // Even within the count cap, evict upper-most non-focus panels that cannot
  // fit at their minimal width.
  const contentBudget = stageW - (showNavInline ? navW + NAV_CARD_GAP : 0);
  while (
    visible.length > 1 &&
    stageW > 0 &&
    minWidthOf(visible) > contentBudget
  ) {
    const evict = visible.find((i) => i !== effectiveFocus);
    if (evict === undefined) {
      break;
    }
    visible = visible.filter((i) => i !== evict);
  }

  // A panel entering or leaving resets everyone to compact sizing and exits
  // fullscreen.
  const visibleKey = `${visible.join(",")}|${effectiveFocus}`;
  const prevVisibleKey = useRef(visibleKey);
  if (prevVisibleKey.current !== visibleKey) {
    if (manualWidths.some((w) => w !== null)) {
      Promise.resolve().then(() => setManualWidths([null, null, null]));
    }
    if (fullscreenIdx !== null) {
      Promise.resolve().then(() => setFullscreenIdx(null));
    }
    prevVisibleKey.current = visibleKey;
  }

  const prevNavHidden = useRef(navHidden);
  if (prevNavHidden.current !== navHidden) {
    if (!navHidden)
      Promise.resolve().then(() => {
        setNavOverlay(false);
        setNavPeek(false);
      });
    prevNavHidden.current = navHidden;
  }

  const showNavOverlay = navHidden && (navOverlay || navPeek);
  const isPeek = !navOverlay && navPeek && navHidden;

  // ── Layout widths ───────────────────────────────────────────────────────
  const layout = (() => {
    const W = Math.max(0, stageW);

    if (isMobile) {
      if (p4Open) {
        return { nav: 0, p2: 0, p3: 0, p4: W };
      }
      if (p3Open) {
        return { nav: 0, p2: 0, p3: W, p4: 0 };
      }
      if (navIntent) {
        return { nav: W, p2: 0, p3: 0, p4: 0 };
      }
      return { nav: 0, p2: W, p3: 0, p4: 0 };
    }

    const nav = showNavInline ? navW : 0;
    if (visible.length === 0) {
      return { nav, p2: 0, p3: 0, p4: 0 };
    }

    // Fullscreen: one panel takes the whole card, nav is already hidden.
    if (effectiveFullscreen !== null) {
      const inner = cardW > 0 ? cardW : W;
      return {
        nav: 0,
        p2: effectiveFullscreen === 0 ? inner : 0,
        p3: effectiveFullscreen === 1 ? inner : 0,
        p4: effectiveFullscreen === 2 ? inner : 0,
      };
    }

    const splits = Math.max(0, visible.length - 1) * SPLIT_HANDLE;
    const inner =
      cardW > 0 ? cardW : Math.max(0, W - nav - (nav > 0 ? NAV_CARD_GAP : 0));
    const available = Math.max(0, inner - splits);

    // While dragging a splitter, only its two panels move; the third column
    // keeps its start-of-drag width.
    if (dragHandle && dragFreeze) {
      const has = (i: number) => visible.includes(i);
      if (dragHandle === "p2-p3" && has(0) && has(1)) {
        const frozenP4 = has(2) ? dragFreeze.p4 : 0;
        const split = applySplitDrag({
          available,
          mouse: dragLeftW,
          leftMin: minimalWidths[0],
          neighborMin: minimalWidths[1],
          frozenOther: frozenP4,
        });
        return { nav, p2: split.left, p3: split.neighbor, p4: frozenP4 };
      }
      if (dragHandle === "p3-p4" && has(1) && has(2)) {
        const frozenP2 = has(0) ? dragFreeze.p2 : 0;
        const split = applySplitDrag({
          available,
          mouse: dragLeftW,
          leftMin: minimalWidths[1],
          neighborMin: minimalWidths[2],
          frozenOther: frozenP2,
        });
        return { nav, p2: frozenP2, p3: split.left, p4: split.neighbor };
      }
    }

    const specs = visible.map((i) => ({
      // A manual width pins the panel: a resized shared panel stops splitting
      // 50/50 and holds its width, the focus panel takes the remainder again.
      // (Cleared with manualWidths whenever the visible set or focus changes.)
      role:
        i === effectiveFocus
          ? ("focus" as const)
          : sizingTypes[i] === "shared" && manualWidths[i] === null
            ? ("shared" as const)
            : ("compact" as const),
      minimal: minimalWidths[i],
      compact: manualWidths[i] ?? compactWidths[i],
    }));

    const widths = allocateFocusPanels(available, specs);
    const byIdx = [0, 0, 0];
    visible.forEach((idx, k) => {
      byIdx[idx] = widths[k];
    });
    return { nav, p2: byIdx[0], p3: byIdx[1], p4: byIdx[2] };
  })();

  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // ── Drag factories ──────────────────────────────────────────────────────
  const drag = useCallback(
    (opts: {
      getCurrent: () => number;
      set: (v: number) => void;
      min: number;
      max: number;
      handle?: "p2-p3" | "p3-p4";
    }) =>
      makeDragResize({
        getCurrent: opts.getCurrent,
        set: opts.set,
        min: opts.min,
        max: opts.max,
        onStart: () => {
          setDragging(true);
          if (!opts.handle) {
            return;
          }
          const current = layoutRef.current;
          setDragFreeze({
            p2: current.p2,
            p3: current.p3,
            p4: current.p4,
          });
          setDragLeftW(
            Math.round(opts.handle === "p2-p3" ? current.p2 : current.p3)
          );
          setDragHandle(opts.handle);
        },
        onEnd: () => {
          if (opts.handle) {
            const current = layoutRef.current;
            const widths = [current.p2, current.p3, current.p4];
            const adjacent = opts.handle === "p2-p3" ? [0, 1] : [1, 2];
            // The manual width sticks on the non-focus side(s); the focus
            // panel keeps flexing with the window.
            setManualWidths((prev) =>
              prev.map((v, i) =>
                adjacent.includes(i) && i !== focusRef.current && widths[i] > 0
                  ? Math.round(widths[i])
                  : v
              )
            );
          }
          setDragHandle(null);
          setDragFreeze(null);
          setDragging(false);
        },
      }),
    []
  );

  // ── Nav toggle ──────────────────────────────────────────────────────────
  const toggleNav = () => {
    if (showNavInline) {
      setNavIntent(false);
      return;
    }
    if (!isMobile && !spaceTight) {
      setNavIntent(true);
      return;
    }
    setNavOverlay((v) => !v);
  };

  // ── Nav show/hide button ────────────────────────────────────────────────
  const navToggleButton = (
    <Button
      variant="ghost"
      size="sm"
      icon={isMobile ? Menu01 : showNavOverlay ? LayoutLeft : LayoutRight}
      onClick={isMobile ? () => setNavIntent(true) : toggleNav}
      tooltip={showNavOverlay ? "Hide navigation" : "Show navigation"}
    />
  );

  const closeNav = () => {
    if (isMobile) setNavIntent(false);
  };
  const resolvedNavChildren = navChild
    ? typeof navChild.props.children === "function"
      ? navChild.props.children(closeNav)
      : navChild.props.children
    : null;

  return (
    <div className="relative flex h-[100vh] w-full overflow-hidden">
      <style>{`
        :root {
          --panel-resize-focus-border: linear-gradient(to bottom, ${customColors.blue[400]}00, ${customColors.blue[400]}00, ${customColors.blue[400]}80, ${customColors.blue[400]}99, ${customColors.blue[400]}80, ${customColors.blue[400]}00, ${customColors.blue[400]}00);
        }
      `}</style>
      <div
        className={[
          "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-app-background py-1 pr-1",
          // With the sidebar collapsed, keep the card off the window edge with
          // the same gutter it has on the other sides.
          navHidden ? "pl-1" : "",
        ].join(" ")}
      >
        <div
          ref={stageRef}
          className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          {/* ── Nav panel (P1) ── */}
          {navChild && (
            <PanelSection
              width={layout.nav}
              isNav
              resetKey="nav"
              dragging={dragging}
              topBar={
                <PanelTopBar
                  left={navChild.props.topBarLeft}
                  right={
                    <>
                      {navChild.props.topBarRight}
                      {!isMobile && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={LayoutLeft}
                          onClick={() => setNavIntent(false)}
                          tooltip="Hide navigation"
                        />
                      )}
                    </>
                  }
                />
              }
              // Only mount the nav content when the inline nav is actually
              // visible. The overlay below renders its own copy when shown;
              // mounting both at once would duplicate portaled content such as
              // open dropdown menus.
              content={layout.nav > 0 ? resolvedNavChildren : null}
            />
          )}

          <ResizeHandle
            visible={layout.nav > 0 && layout.p2 > 0}
            onPointerDown={drag({
              getCurrent: () => navW,
              set: setNavW,
              min: MIN_NAV,
              max: MAX_NAV,
            })}
          />

          {/* ── Content card (P2–P4) ── */}
          <div
            ref={cardRef}
            className="flex min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-hidden rounded-xl border bg-background shadow-sm"
          >
            {p2 && (
              <PanelSection
                width={layout.p2}
                isNav={false}
                resetKey={p2.props.label}
                dragging={dragging}
                topBar={
                  <PanelTopBar
                    left={
                      <>
                        {navHidden && navToggleButton}
                        {p2.props.topBarLeft}
                      </>
                    }
                    right={p2.props.topBarRight}
                  />
                }
                content={p2.props.children}
              />
            )}

            <ResizeHandle
              variant="split"
              visible={layout.p2 > 0 && layout.p3 > 0}
              onPointerDown={drag({
                getCurrent: () => layout.p2,
                set: setDragLeftW,
                min: minimalWidths[0],
                max: Math.max(
                  minimalWidths[0],
                  (cardW > 0 ? cardW : stageW) -
                    minimalWidths[1] -
                    (layout.p4 > 0 ? layout.p4 : 0)
                ),
                handle: "p2-p3",
              })}
            />

            {p3 && (
              <PanelSection
                width={layout.p3}
                isNav={false}
                resetKey={p3.props.label}
                dragging={dragging}
                topBar={
                  <PanelTopBar
                    left={
                      isMobile ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={ArrowLeft}
                          onClick={p3.props.onClose}
                          tooltip="Back"
                        />
                      ) : (
                        <>
                          {navHidden && layout.p2 === 0 && navToggleButton}
                          {p3.props.topBarLeft}
                        </>
                      )
                    }
                    right={
                      <>
                        {!isMobile && p3.props.topBarRight}
                        {!isMobile && fullscreenFlags[1] && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={
                              effectiveFullscreen === 1
                                ? Minimize01
                                : Maximize01
                            }
                            onClick={() =>
                              setFullscreenIdx(
                                effectiveFullscreen === 1 ? null : 1
                              )
                            }
                            tooltip={
                              effectiveFullscreen === 1
                                ? "Exit full screen"
                                : "Open in full screen"
                            }
                          />
                        )}
                        {!isMobile && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={XClose}
                            onClick={p3.props.onClose}
                            tooltip="Close"
                          />
                        )}
                      </>
                    }
                  />
                }
                content={p3.props.children}
              />
            )}

            <ResizeHandle
              variant="split"
              visible={layout.p3 > 0 && layout.p4 > 0}
              onPointerDown={drag({
                getCurrent: () => layout.p3,
                set: setDragLeftW,
                min: minimalWidths[1],
                max: Math.max(
                  minimalWidths[1],
                  (cardW > 0 ? cardW : stageW) -
                    minimalWidths[2] -
                    (layout.p2 > 0 ? layout.p2 : 0)
                ),
                handle: "p3-p4",
              })}
            />

            {p4 && (
              <PanelSection
                width={layout.p4}
                isNav={false}
                resetKey={p4.props.label}
                dragging={dragging}
                topBar={
                  <PanelTopBar
                    left={
                      isMobile ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={ArrowLeft}
                          onClick={p4.props.onClose}
                          tooltip="Back"
                        />
                      ) : (
                        <>
                          {navHidden &&
                            layout.p2 === 0 &&
                            layout.p3 === 0 &&
                            navToggleButton}
                          {p4.props.topBarLeft}
                        </>
                      )
                    }
                    right={
                      <>
                        {!isMobile && p4.props.topBarRight}
                        {!isMobile && fullscreenFlags[2] && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={
                              effectiveFullscreen === 2
                                ? Minimize01
                                : Maximize01
                            }
                            onClick={() =>
                              setFullscreenIdx(
                                effectiveFullscreen === 2 ? null : 2
                              )
                            }
                            tooltip={
                              effectiveFullscreen === 2
                                ? "Exit full screen"
                                : "Open in full screen"
                            }
                          />
                        )}
                        {!isMobile && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={XClose}
                            onClick={p4.props.onClose}
                            tooltip="Close"
                          />
                        )}
                      </>
                    }
                  />
                }
                content={p4.props.children}
              />
            )}
          </div>

          {/* ── Scrim ── */}
          <div
            className={[
              "absolute inset-0 z-40 bg-black/20 transition-opacity duration-200",
              showNavOverlay && !isPeek
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none opacity-0",
            ].join(" ")}
            onClick={() => setNavOverlay(false)}
          />

          {/* ── Nav overlay (desktop only) ── */}
          {!isMobile && (
            <div
              className={[
                "absolute bottom-0 left-0 top-0 z-50 flex flex-col",
                "bg-app-background",
                "border-r border-separator",
                "transition-[transform,opacity] duration-[220ms] ease-[cubic-bezier(.4,0,.2,1)]",
                showNavOverlay
                  ? "translate-x-0 opacity-100 pointer-events-auto"
                  : "-translate-x-full opacity-0 pointer-events-none",
                isPeek
                  ? "shadow-[4px_0_16px_rgba(0,0,0,0.08)]"
                  : "shadow-[8px_0_24px_rgba(0,0,0,0.10)]",
              ].join(" ")}
              style={{ width: navW }}
              aria-hidden={!showNavOverlay}
              onMouseEnter={() => {
                if (navHidden) setNavPeek(true);
              }}
              onMouseLeave={() => setNavPeek(false)}
            >
              <PanelTopBar
                left={navChild?.props.topBarLeft}
                right={
                  <>
                    {navChild?.props.topBarRight}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={XClose}
                      onClick={() => {
                        setNavOverlay(false);
                        setNavPeek(false);
                      }}
                      tooltip="Dismiss"
                    />
                  </>
                }
              />
              <div className="flex-1 bg-[repeating-linear-gradient(45deg,transparent_0,transparent_11px,rgba(0,0,0,0.06)_11px,rgba(0,0,0,0.06)_12px)]">
                {showNavOverlay ? resolvedNavChildren : null}
              </div>
            </div>
          )}

          {/* ── Edge peek trigger (desktop only) ── */}
          {!isMobile && navHidden && !navOverlay && (
            <div
              className="absolute bottom-0 left-0 top-0 z-[35] w-2 cursor-pointer"
              onMouseEnter={() => setNavPeek(true)}
              onMouseLeave={() => setNavPeek(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
