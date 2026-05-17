import {
  ArrowLeftIcon,
  Button,
  MenuIcon,
  SidebarLeftCloseIcon,
  SidebarLeftOpenIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ── Constants ─────────────────────────────────────────────────────────────────

const MOBILE_BREAKPOINT = 768;
const MIN_NAV = 160,
  MAX_NAV = 320;
const MIN_P2 = 320,
  MAX_P2 = 760;
const MIN_P3 = 260,
  MAX_P3 = 560;
const MIN_MAIN = 320;
const P3_OPEN_HIDE_NAV_BELOW = 1280;

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
  label: string;
  panelIndex: number;
  left?: ReactNode;
  right?: ReactNode;
  back?: () => void;
}

export function PanelTopBar({
  label,
  panelIndex,
  left,
  right,
  back,
}: PanelTopBarProps) {
  return (
    <header className="s-flex s-h-10 s-flex-none s-items-center s-justify-between s-gap-2 s-overflow-hidden s-whitespace-nowrap s-border-b s-border-separator s-px-2 dark:s-border-separator-night">
      <div className="s-flex s-min-w-0 s-items-center s-gap-1.5 s-overflow-hidden">
        {back ? (
          <Button
            variant="ghost"
            size="xs"
            icon={ArrowLeftIcon}
            onClick={back}
            tooltip="Back"
          />
        ) : (
          left
        )}
        <span className="s-rounded s-border s-border-separator s-bg-muted-background s-px-1.5 s-py-0.5 s-text-[10px] s-font-semibold s-uppercase s-tracking-wider s-text-foreground dark:s-border-separator-night dark:s-bg-structure-100-night dark:s-text-foreground-night">
          P{panelIndex}
        </span>
        <span className="s-truncate s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
          {label}
        </span>
      </div>
      {!back && right && (
        <div className="s-flex s-flex-none s-items-center s-gap-1">{right}</div>
      )}
    </header>
  );
}

// ── Internal resize handle ────────────────────────────────────────────────────

function ResizeHandle({
  visible,
  onPointerDown,
}: {
  visible: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      className={[
        "s-group s-relative s-z-[5] s-flex s-w-[6px] s-flex-none s-cursor-col-resize s-items-stretch -s-mx-[3px] s-transition-opacity s-duration-200",
        visible ? "s-opacity-100" : "s-pointer-events-none s-opacity-0",
      ].join(" ")}
      onPointerDown={visible ? onPointerDown : undefined}
    >
      <div
        className={[
          "s-mx-auto s-w-px s-bg-separator s-transition-all s-duration-[120ms] dark:s-bg-separator-night",
          visible
            ? "group-hover:s-w-[2px] group-hover:s-bg-primary-600 group-active:s-w-[2px] group-active:s-bg-primary-600"
            : "",
        ].join(" ")}
      />
    </div>
  );
}

// ── PanelLayoutNav ────────────────────────────────────────────────────────────

export interface PanelLayoutNavProps {
  children?: ReactNode;
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
  const [navW, setNavW] = useState(260);
  const [p2W, setP2W] = useState(480);
  const [p3W, setP3W] = useState(360);

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

  // Restore nav when transitioning from mobile to desktop
  const prevIsMobile = useRef(isMobile);
  if (prevIsMobile.current !== isMobile) {
    if (!isMobile) Promise.resolve().then(() => setNavIntent(true));
    prevIsMobile.current = isMobile;
  }

  // ── Derived visibility ──────────────────────────────────────────────────
  const spaceTight =
    stageW > 0
      ? p3Open
        ? stageW < P3_OPEN_HIDE_NAV_BELOW
        : navW + MIN_MAIN > stageW
      : false;

  const showNavInline = navIntent && !spaceTight && !p4Open && !isMobile;
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
  const layout = (() => {
    const W = Math.max(0, stageW);
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
      w3 = Math.min(p3W, Math.max(MIN_P3, W - 1));
      w4 = Math.max(0, W - w3);
    } else if (p3Open) {
      nav = showNavInline ? navW : 0;
      w2 = Math.min(p2W, Math.max(MIN_P2, W - nav - MIN_P3));
      w3 = Math.max(0, W - nav - w2);
    } else {
      nav = showNavInline ? navW : 0;
      w2 = Math.max(0, W - nav);
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
    if (!spaceTight && !p4Open) {
      setNavIntent(true);
      return;
    }
    setNavOverlay((v) => !v);
  };

  // ── Shared panel shell ──────────────────────────────────────────────────
  const panelShell = (
    width: number,
    isNav: boolean,
    topBar: ReactNode,
    content: ReactNode
  ) => {
    const hidden = width === 0;
    return (
      <section
        className={[
          "s-relative s-flex s-min-w-0 s-flex-none s-flex-col s-overflow-hidden",
          isNav
            ? "s-bg-muted-background dark:s-bg-muted-background-night"
            : "s-bg-white dark:s-bg-structure-0-night",
          hidden
            ? ""
            : "s-border-r s-border-separator dark:s-border-separator-night",
          dragging
            ? ""
            : "s-transition-[width] s-duration-[260ms] s-ease-[cubic-bezier(.4,0,.2,1)]",
        ].join(" ")}
        style={{ width }}
        aria-hidden={hidden}
      >
        {topBar}
        <div
          className={[
            "s-relative s-flex-1 s-overflow-auto",
            !content
              ? isNav
                ? "s-bg-[repeating-linear-gradient(45deg,transparent_0,transparent_11px,rgba(0,0,0,0.06)_11px,rgba(0,0,0,0.06)_12px)]"
                : "s-bg-[repeating-linear-gradient(45deg,transparent_0,transparent_11px,rgba(0,0,0,0.04)_11px,rgba(0,0,0,0.04)_12px)]"
              : "",
          ].join(" ")}
        >
          {content}
        </div>
      </section>
    );
  };

  // ── Nav show/hide button ────────────────────────────────────────────────
  const navToggleButton = (
    <Button
      variant="ghost"
      size="xs"
      icon={
        isMobile
          ? MenuIcon
          : showNavOverlay
            ? SidebarLeftCloseIcon
            : SidebarLeftOpenIcon
      }
      onClick={isMobile ? () => setNavIntent(true) : toggleNav}
      tooltip={showNavOverlay ? "Hide navigation" : "Show navigation"}
    />
  );

  return (
    <div
      ref={stageRef}
      className="s-relative s-flex s-h-screen s-w-full s-overflow-hidden s-rounded-[10px] s-border s-border-separator dark:s-border-separator-night"
    >
      <div className="s-relative s-flex s-min-w-0 s-flex-1">
        {/* ── Nav panel (P1) ── */}
        {navChild &&
          panelShell(
            layout.nav,
            true,
            <PanelTopBar
              panelIndex={1}
              label="Navigation"
              right={
                !isMobile ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={SidebarLeftCloseIcon}
                    onClick={() => setNavIntent(false)}
                    tooltip="Hide navigation"
                  />
                ) : undefined
              }
            />,
            navChild.props.children
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

        {/* ── P2 ── */}
        {p2 &&
          panelShell(
            layout.p2,
            false,
            <PanelTopBar
              panelIndex={2}
              label={p2.props.label}
              left={navHidden ? navToggleButton : undefined}
            />,
            p2.props.children
          )}

        <ResizeHandle
          visible={layout.p2 > 0 && layout.p3 > 0}
          onPointerDown={drag({
            getCurrent: () => p2W,
            set: setP2W,
            min: MIN_P2,
            max: MAX_P2,
          })}
        />

        {/* ── P3 ── */}
        {p3 &&
          panelShell(
            layout.p3,
            false,
            <PanelTopBar
              panelIndex={3}
              label={p3.props.label}
              back={isMobile ? p3.props.onClose : undefined}
              left={
                !isMobile && p4Open && navHidden ? navToggleButton : undefined
              }
              right={
                !isMobile ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={XMarkIcon}
                    onClick={p3.props.onClose}
                    tooltip="Close"
                  />
                ) : undefined
              }
            />,
            p3.props.children
          )}

        <ResizeHandle
          visible={layout.p3 > 0 && layout.p4 > 0}
          onPointerDown={drag({
            getCurrent: () => p3W,
            set: setP3W,
            min: MIN_P3,
            max: MAX_P3,
          })}
        />

        {/* ── P4 ── */}
        {p4 &&
          panelShell(
            layout.p4,
            false,
            <PanelTopBar
              panelIndex={4}
              label={p4.props.label}
              back={isMobile ? p4.props.onClose : undefined}
              right={
                !isMobile ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={XMarkIcon}
                    onClick={p4.props.onClose}
                    tooltip="Close"
                  />
                ) : undefined
              }
            />,
            p4.props.children
          )}

        {/* ── Scrim ── */}
        <div
          className={[
            "s-absolute s-inset-0 s-z-40 s-bg-black/20 s-transition-opacity s-duration-200",
            showNavOverlay && !isPeek
              ? "s-pointer-events-auto s-opacity-100"
              : "s-pointer-events-none s-opacity-0",
          ].join(" ")}
          onClick={() => setNavOverlay(false)}
        />

        {/* ── Nav overlay (desktop only) ── */}
        {!isMobile && (
          <div
            className={[
              "s-absolute s-bottom-0 s-left-0 s-top-0 s-z-50 s-flex s-flex-col",
              "s-bg-muted-background dark:s-bg-muted-background-night",
              "s-border-r s-border-separator dark:s-border-separator-night",
              "s-transition-[transform,opacity] s-duration-[220ms] s-ease-[cubic-bezier(.4,0,.2,1)]",
              showNavOverlay
                ? "s-translate-x-0 s-opacity-100 s-pointer-events-auto"
                : "-s-translate-x-full s-opacity-0 s-pointer-events-none",
              isPeek
                ? "s-shadow-[4px_0_16px_rgba(0,0,0,0.08)]"
                : "s-shadow-[8px_0_24px_rgba(0,0,0,0.10)]",
            ].join(" ")}
            style={{ width: navW }}
            aria-hidden={!showNavOverlay}
            onMouseEnter={() => {
              if (navHidden) setNavPeek(true);
            }}
            onMouseLeave={() => setNavPeek(false)}
          >
            <PanelTopBar
              panelIndex={1}
              label={isPeek ? "peek" : "overlay"}
              right={
                <Button
                  variant="ghost"
                  size="xs"
                  icon={XMarkIcon}
                  onClick={() => {
                    setNavOverlay(false);
                    setNavPeek(false);
                  }}
                  tooltip="Dismiss"
                />
              }
            />
            <div className="s-flex-1 s-bg-[repeating-linear-gradient(45deg,transparent_0,transparent_11px,rgba(0,0,0,0.06)_11px,rgba(0,0,0,0.06)_12px)]">
              {navChild?.props.children}
            </div>
          </div>
        )}

        {/* ── Edge peek trigger (desktop only) ── */}
        {!isMobile && navHidden && !navOverlay && (
          <div
            className="s-absolute s-bottom-0 s-left-0 s-top-0 s-z-[35] s-w-2 s-cursor-pointer"
            onMouseEnter={() => setNavPeek(true)}
            onMouseLeave={() => setNavPeek(false)}
          />
        )}
      </div>
    </div>
  );
}
