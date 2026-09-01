import {
  ArrowLeft,
  Button,
  LayoutLeft,
  LayoutRight,
  Menu01,
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
  type UIEvent,
} from "react";

// ── Constants ─────────────────────────────────────────────────────────────────

const MOBILE_BREAKPOINT = 768;
const WIDE_BREAKPOINT = 1800;
const COMFORTABLE_PANEL = 520;
const MIN_NAV = 160,
  MAX_NAV = 320;
const MIN_P2 = 260,
  MAX_P2 = 960;
const MIN_P3 = 260,
  MAX_P3 = 1200;
const MIN_P4 = 260;
const MIN_MAIN = 320;
const P3_OPEN_HIDE_NAV_BELOW = 1280;
const NAV_CARD_GAP = 6;
const SPLIT_HANDLE = 1;
const CARD_EDGES = 2;

function lockHorizontalScroll(e: UIEvent<HTMLElement>) {
  if (e.currentTarget.scrollLeft !== 0) {
    e.currentTarget.scrollLeft = 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

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
  /** Extra horizontal inset so titles clear the rounded card’s 12px corner. */
  inCard?: boolean;
}

export function PanelTopBar({
  left,
  right,
  hasBorder = true,
  inCard = false,
}: PanelTopBarProps) {
  return (
    <header
      className={[
        "group/topbar flex h-[52px] flex-none items-center justify-between gap-2 overflow-x-clip whitespace-nowrap border-b transition-colors duration-200",
        inCard ? "px-4" : "px-2",
        hasBorder ? "border-separator" : "border-transparent",
      ].join(" ")}
      onScroll={lockHorizontalScroll}
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
      onScroll={lockHorizontalScroll}
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

export interface PanelLayoutPanelProps {
  label: string;
  /** Controlled: whether this panel is open. P2 (index 0) is always open. */
  isOpen: boolean;
  /** Called when the panel's close button / back button is triggered. */
  onClose: () => void;
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

  // ── Internal geometry state ─────────────────────────────────────────────
  const [navW, setNavW] = useState(312);
  const [p2W, setP2W] = useState<number | null>(null);
  const [p3W, setP3W] = useState<number | null>(null);

  const [navIntent, setNavIntent] = useState(true);
  const [navOverlay, setNavOverlay] = useState(false);
  const [navPeek, setNavPeek] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(0);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    let last = -1;
    let timer = 0;
    const measure = () => {
      if (!stageRef.current) return;
      const w = stageRef.current.getBoundingClientRect().width;
      if (Math.abs(w - last) > 0.5) {
        last = w;
        setStageW(w);
        // Seed proportional defaults on first valid measure
        setP2W((prev) => prev ?? Math.max(MIN_P2, Math.round(w * 0.3)));
        setP3W((prev) => prev ?? Math.max(MIN_P3, Math.round(w * 0.5)));
        setDragging(true);
        clearTimeout(timer);
        timer = window.setTimeout(() => setDragging(false), 80);
      }
    };
    measure();
    const id = setInterval(measure, 60);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", measure);
      clearTimeout(timer);
    };
  }, []);

  const isMobile = stageW > 0 && stageW < MOBILE_BREAKPOINT;
  const isWide = stageW >= WIDE_BREAKPOINT;

  // Restore nav when transitioning from mobile to desktop
  const prevIsMobile = useRef(isMobile);
  if (prevIsMobile.current !== isMobile) {
    if (!isMobile) Promise.resolve().then(() => setNavIntent(true));
    prevIsMobile.current = isMobile;
  }

  // ── Derived visibility ──────────────────────────────────────────────────
  // Standard (14" laptop): hide nav when P3 is open below 1280, and whenever
  // P4 is open. Wide: keep nav inline whenever the user wants it.
  const spaceTight =
    stageW > 0
      ? p3Open
        ? stageW < P3_OPEN_HIDE_NAV_BELOW
        : navW + MIN_MAIN > stageW
      : false;

  const showNavInline =
    navIntent && !isMobile && (isWide || (!spaceTight && !p4Open));
  const navHidden = !showNavInline;

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
  // Panel pixel widths must fit the column row: nav + optional 6px gap +
  // card (panels + 1px splits). Overflowing that row lets overflow:hidden
  // ancestors take a scrollLeft, which clips the left inset of the top bar
  // and the conversation list together.
  const layout = (() => {
    const W = Math.max(0, stageW);
    const resolvedP2W = p2W ?? Math.max(MIN_P2, Math.round(W * 0.3));
    const resolvedP3W = p3W ?? Math.max(MIN_P3, Math.round(W * 0.5));
    let nav = 0,
      w2 = 0,
      w3 = 0,
      w4 = 0;

    if (isMobile) {
      if (p4Open) w4 = W;
      else if (p3Open) w3 = W;
      else if (navIntent) nav = W;
      else w2 = W;
    } else if (p4Open) {
      nav = showNavInline ? navW : 0;
      const showP2WithP4 = isWide && W - nav >= 3 * COMFORTABLE_PANEL;
      const gap = nav > 0 && showP2WithP4 ? NAV_CARD_GAP : 0;
      const splits = showP2WithP4 ? 2 * SPLIT_HANDLE : SPLIT_HANDLE;
      const available = Math.max(0, W - nav - gap - splits - CARD_EDGES);

      if (showP2WithP4) {
        const minP4Share = Math.min(
          COMFORTABLE_PANEL,
          Math.max(MIN_P4, available - MIN_P2 - MIN_P3)
        );
        w2 = clamp(
          resolvedP2W,
          MIN_P2,
          Math.min(MAX_P2, available - MIN_P3 - minP4Share)
        );
        w3 = clamp(
          resolvedP3W,
          MIN_P3,
          Math.min(MAX_P3, available - w2 - minP4Share)
        );
        w4 = available - w2 - w3;
      } else {
        w3 = clamp(resolvedP3W, MIN_P3, Math.min(MAX_P3, available - MIN_P4));
        w4 = Math.max(0, available - w3);
      }
    } else if (p3Open) {
      nav = showNavInline ? navW : 0;
      const gap = nav > 0 ? NAV_CARD_GAP : 0;
      const available = Math.max(0, W - nav - gap - SPLIT_HANDLE - CARD_EDGES);
      w2 = Math.min(resolvedP2W, Math.max(MIN_P2, available - MIN_P3));
      w3 = Math.max(0, available - w2);
    } else {
      nav = showNavInline ? navW : 0;
      const gap = nav > 0 ? NAV_CARD_GAP : 0;
      w2 = Math.max(0, W - nav - gap - CARD_EDGES);
    }
    return { nav, p2: w2, p3: w3, p4: w4 };
  })();

  // ── Drag factories ──────────────────────────────────────────────────────
  const drag = useCallback(
    (opts: {
      getCurrent: () => number;
      set: (v: number) => void;
      min: number;
      max: number;
    }) =>
      makeDragResize({
        ...opts,
        onStart: () => setDragging(true),
        onEnd: () => setDragging(false),
      }),
    []
  );

  // ── Nav toggle ──────────────────────────────────────────────────────────
  const toggleNav = () => {
    if (showNavInline) {
      setNavIntent(false);
      return;
    }
    if (!isMobile && (isWide || (!spaceTight && !p4Open))) {
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
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-app-background py-1 pr-1">
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
            className="flex min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-hidden rounded-xl border bg-background shadow-sm"
            onScroll={lockHorizontalScroll}
          >
            {p2 && (
              <PanelSection
                width={layout.p2}
                isNav={false}
                resetKey={p2.props.label}
                dragging={dragging}
                topBar={
                  <PanelTopBar
                    inCard
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
                getCurrent: () =>
                  p2W ?? Math.max(MIN_P2, Math.round(stageW * 0.3)),
                set: setP2W,
                min: MIN_P2,
                max: Math.min(
                  MAX_P2,
                  Math.max(
                    MIN_P2,
                    stageW -
                      layout.nav -
                      (layout.p3 > 0 ? MIN_P3 : 0) -
                      (layout.p4 > 0 ? MIN_P4 : 0)
                  )
                ),
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
                    inCard
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
                          {p4Open &&
                            navHidden &&
                            layout.p2 === 0 &&
                            navToggleButton}
                          {p3.props.topBarLeft}
                        </>
                      )
                    }
                    right={
                      <>
                        {!isMobile && p3.props.topBarRight}
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
                getCurrent: () =>
                  p3W ?? Math.max(MIN_P3, Math.round(stageW * 0.5)),
                set: setP3W,
                min: MIN_P3,
                max: Math.min(
                  MAX_P3,
                  Math.max(MIN_P3, stageW - layout.nav - layout.p2 - MIN_P4)
                ),
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
                    inCard
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
                        p4.props.topBarLeft
                      )
                    }
                    right={
                      <>
                        {!isMobile && p4.props.topBarRight}
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
