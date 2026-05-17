import {
  ArrowLeftIcon,
  Button,
  MenuIcon,
  SidebarLeftCloseIcon,
  SidebarLeftOpenIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

const MOBILE_BREAKPOINT = 768;

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_P1 = 160,
  MAX_P1 = 320;
const MIN_P2 = 320,
  MAX_P2 = 760;
const MIN_P3 = 260,
  MAX_P3 = 560;
const MIN_MAIN = 320;
const P3_OPEN_HIDE_P1_BELOW = 1280;

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

// ── ResizeHandle ─────────────────────────────────────────────────────────────

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
        "s-group s-relative s-z-[5] s-flex s-w-[6px] s-flex-none s-cursor-col-resize s-items-stretch",
        "-s-mx-[3px]",
        "s-transition-opacity s-duration-200",
        visible ? "s-opacity-100" : "s-pointer-events-none s-opacity-0",
      ].join(" ")}
      onPointerDown={visible ? onPointerDown : undefined}
    >
      <div
        className={[
          "s-mx-auto s-w-px s-bg-separator dark:s-bg-separator-night",
          "s-transition-all s-duration-[120ms]",
          visible
            ? "group-hover:s-w-[2px] group-hover:s-bg-primary-600 group-active:s-w-[2px] group-active:s-bg-primary-600"
            : "",
        ].join(" ")}
      />
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function Panel({
  n,
  label,
  width,
  isNav,
  headerLeft,
  headerRight,
  back,
  dragging,
  children,
}: {
  n: 1 | 2 | 3 | 4;
  label: string;
  width: number;
  isNav?: boolean;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  back?: () => void;
  dragging?: boolean;
  children?: React.ReactNode;
}) {
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
            headerLeft
          )}
          <span className="s-rounded s-border s-border-separator s-bg-muted-background s-px-1.5 s-py-0.5 s-text-[10px] s-font-semibold s-uppercase s-tracking-wider s-text-foreground dark:s-border-separator-night dark:s-bg-structure-100-night dark:s-text-foreground-night">
            P{n}
          </span>
          <span className="s-truncate s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
            {label}
          </span>
        </div>
        {!back && headerRight && (
          <div className="s-flex s-flex-none s-items-center s-gap-1">
            {headerRight}
          </div>
        )}
      </header>
      <div
        className={[
          "s-relative s-flex-1 s-overflow-auto",
          !children
            ? isNav
              ? "s-bg-[repeating-linear-gradient(45deg,transparent_0,transparent_11px,rgba(0,0,0,0.06)_11px,rgba(0,0,0,0.06)_12px)]"
              : "s-bg-[repeating-linear-gradient(45deg,transparent_0,transparent_11px,rgba(0,0,0,0.04)_11px,rgba(0,0,0,0.04)_12px)]"
            : "",
        ].join(" ")}
      >
        {children}
      </div>
    </section>
  );
}

const PROJECTS = ["Project 1", "Project 2", "Project 3"];
const CONVERSATIONS = ["Conversation 1", "Conversation 2", "Conversation 3"];
const FRAMES = [
  "Frame 1",
  "Frame 2",
  "CSV 1",
  "Co-Edition text 1",
  "Co-Edition text 2",
];

// ── Story ─────────────────────────────────────────────────────────────────────

export default function Panels() {
  const [p1W, setP1W] = useState(260);
  const [p2W, setP2W] = useState(480);
  const [p3W, setP3W] = useState(360);

  const [selectedProject, setSelectedProject] = useState(PROJECTS[0]);
  const [selectedConversation, setSelectedConversation] = useState<
    string | null
  >(null);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);

  const [p1Intent, setP1Intent] = useState(true);
  const [p3Open, setP3Open] = useState(false);
  const [p4Open, setP4Open] = useState(false);
  const [p1Overlay, setP1Overlay] = useState(false);
  const [p1Peek, setP1Peek] = useState(false);

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

  // Restore P1 when transitioning from mobile to desktop
  const prevIsMobile = useRef(isMobile);
  if (prevIsMobile.current !== isMobile) {
    if (!isMobile) {
      Promise.resolve().then(() => setP1Intent(true));
    }
    prevIsMobile.current = isMobile;
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const spaceTight =
    stageW > 0
      ? p3Open
        ? stageW < P3_OPEN_HIDE_P1_BELOW
        : p1W + MIN_MAIN > stageW
      : false;

  const showP1Inline = p1Intent && !spaceTight && !p4Open;
  const p1Hidden = !showP1Inline;

  // Clear overlays when P1 comes back inline (avoid setState-during-render)
  const prevP1Hidden = useRef(p1Hidden);
  if (prevP1Hidden.current !== p1Hidden) {
    if (!p1Hidden) {
      Promise.resolve().then(() => {
        setP1Overlay(false);
        setP1Peek(false);
      });
    }
    prevP1Hidden.current = p1Hidden;
  }

  const showP1Overlay = p1Hidden && (p1Overlay || p1Peek);
  const isPeek = !p1Overlay && p1Peek && p1Hidden;

  // ── Layout widths ─────────────────────────────────────────────────────────

  const layout = (() => {
    const W = Math.max(0, stageW);
    let p1 = 0,
      p2 = 0,
      p3 = 0,
      p4 = 0;

    if (isMobile) {
      // On mobile: only one panel visible at full width.
      // P1 overlay is handled separately; inline P1 takes full width when open.
      // Priority: P4 > P3 > P1 (when intent) > P2
      if (p4Open) {
        p4 = W;
      } else if (p3Open) {
        p3 = W;
      } else if (p1Intent) {
        p1 = W;
      } else {
        p2 = W;
      }
    } else if (p4Open) {
      p3 = Math.min(p3W, Math.max(MIN_P3, W - 1));
      p4 = Math.max(0, W - p3);
    } else if (p3Open) {
      p1 = showP1Inline ? p1W : 0;
      p2 = Math.min(p2W, Math.max(MIN_P2, W - p1 - MIN_P3));
      p3 = Math.max(0, W - p1 - p2);
    } else {
      p1 = showP1Inline ? p1W : 0;
      p2 = Math.max(0, W - p1);
    }
    return { p1, p2, p3, p4 };
  })();

  // ── Drag factories ────────────────────────────────────────────────────────

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

  // ── Actions ───────────────────────────────────────────────────────────────

  const toggleP1 = () => {
    if (showP1Inline) {
      setP1Intent(false);
      return;
    }
    if (!spaceTight && !p4Open) {
      setP1Intent(true);
      return;
    }
    setP1Overlay((v) => !v);
  };

  const toggleP3 = () => {
    if (p3Open) {
      setP3Open(false);
      setP4Open(false);
      setSelectedConversation(null);
      setSelectedFrame(null);
    } else {
      setP3Open(true);
    }
  };

  const closeP4 = () => {
    setP4Open(false);
    setSelectedFrame(null);
  };

  return (
    <div
      ref={stageRef}
      className="s-relative s-flex s-h-screen s-w-full s-overflow-hidden s-rounded-[10px] s-border s-border-separator dark:s-border-separator-night"
    >
      {/* Columns */}
      <div className="s-relative s-flex s-min-w-0 s-flex-1">
        {/* Panel 1 — Navigation */}
        <Panel
          n={1}
          label="Navigation"
          width={layout.p1}
          isNav
          dragging={dragging}
          headerRight={
            !isMobile ? (
              <Button
                variant="ghost"
                size="xs"
                icon={SidebarLeftCloseIcon}
                onClick={() => setP1Intent(false)}
                tooltip="Hide navigation"
              />
            ) : undefined
          }
        >
          <div className="s-flex s-flex-col s-gap-0.5 s-p-2">
            {PROJECTS.map((project) => {
              const isSelected = project === selectedProject;
              return (
                <button
                  key={project}
                  onClick={() => {
                    setSelectedProject(project);
                    if (isMobile) setP1Intent(false);
                  }}
                  className={[
                    "s-flex s-w-full s-items-center s-rounded-md s-px-3 s-py-2 s-text-left s-text-sm s-transition-colors",
                    isSelected
                      ? "s-bg-primary-100 s-font-medium s-text-primary-900 dark:s-bg-primary-900/30 dark:s-text-primary-100"
                      : "s-text-foreground hover:s-bg-structure-100 dark:s-text-foreground-night dark:hover:s-bg-structure-100-night",
                  ].join(" ")}
                >
                  {project}
                </button>
              );
            })}
          </div>
        </Panel>

        <ResizeHandle
          visible={layout.p1 > 0 && layout.p2 > 0}
          onPointerDown={drag({
            getCurrent: () => p1W,
            set: setP1W,
            min: MIN_P1,
            max: MAX_P1,
          })}
        />

        {/* Panel 2 — Project */}
        <Panel
          n={2}
          label={selectedProject}
          width={layout.p2}
          dragging={dragging}
          headerLeft={
            !showP1Inline ? (
              <Button
                variant="ghost"
                size="xs"
                icon={
                  isMobile
                    ? MenuIcon
                    : showP1Overlay
                      ? SidebarLeftCloseIcon
                      : SidebarLeftOpenIcon
                }
                onClick={isMobile ? () => setP1Intent(true) : toggleP1}
                tooltip={showP1Overlay ? "Hide navigation" : "Show navigation"}
              />
            ) : undefined
          }
        >
          <div className="s-flex s-flex-col s-gap-0.5 s-p-2">
            {CONVERSATIONS.map((conversation) => {
              const isSelected = conversation === selectedConversation;
              return (
                <button
                  key={conversation}
                  onClick={() => {
                    setSelectedConversation(conversation);
                    setP3Open(true);
                  }}
                  className={[
                    "s-flex s-w-full s-items-center s-rounded-md s-px-3 s-py-2 s-text-left s-text-sm s-transition-colors",
                    isSelected
                      ? "s-bg-primary-100 s-font-medium s-text-primary-900 dark:s-bg-primary-900/30 dark:s-text-primary-100"
                      : "s-text-foreground hover:s-bg-structure-100 dark:s-text-foreground-night dark:hover:s-bg-structure-100-night",
                  ].join(" ")}
                >
                  {conversation}
                </button>
              );
            })}
          </div>
        </Panel>

        <ResizeHandle
          visible={layout.p2 > 0 && layout.p3 > 0}
          onPointerDown={drag({
            getCurrent: () => p2W,
            set: setP2W,
            min: MIN_P2,
            max: MAX_P2,
          })}
        />

        {/* Panel 3 — Conversation */}
        <Panel
          n={3}
          label={selectedConversation ?? "Conversation"}
          width={layout.p3}
          dragging={dragging}
          back={isMobile ? toggleP3 : undefined}
          headerLeft={
            !isMobile && p4Open && p1Hidden ? (
              <Button
                variant="ghost"
                size="xs"
                icon={
                  showP1Overlay ? SidebarLeftCloseIcon : SidebarLeftOpenIcon
                }
                onClick={toggleP1}
                tooltip={showP1Overlay ? "Hide navigation" : "Show navigation"}
              />
            ) : undefined
          }
          headerRight={
            !isMobile ? (
              <Button
                variant="ghost"
                size="xs"
                icon={XMarkIcon}
                onClick={toggleP3}
                tooltip="Close conversation"
              />
            ) : undefined
          }
        >
          <div className="s-flex s-flex-col s-gap-0.5 s-p-2">
            {FRAMES.map((frame) => {
              const isSelected = frame === selectedFrame;
              return (
                <button
                  key={frame}
                  onClick={() => {
                    setSelectedFrame(frame);
                    setP4Open(true);
                  }}
                  className={[
                    "s-flex s-w-full s-items-center s-rounded-md s-px-3 s-py-2 s-text-left s-text-sm s-transition-colors",
                    isSelected
                      ? "s-bg-primary-100 s-font-medium s-text-primary-900 dark:s-bg-primary-900/30 dark:s-text-primary-100"
                      : "s-text-foreground hover:s-bg-structure-100 dark:s-text-foreground-night dark:hover:s-bg-structure-100-night",
                  ].join(" ")}
                >
                  {frame}
                </button>
              );
            })}
          </div>
        </Panel>

        <ResizeHandle
          visible={layout.p3 > 0 && layout.p4 > 0}
          onPointerDown={drag({
            getCurrent: () => p3W,
            set: setP3W,
            min: MIN_P3,
            max: MAX_P3,
          })}
        />

        {/* Panel 4 — Co-edition */}
        <Panel
          n={4}
          label={selectedFrame ?? "Co-edition"}
          width={layout.p4}
          dragging={dragging}
          back={isMobile ? closeP4 : undefined}
          headerRight={
            !isMobile ? (
              <Button
                variant="ghost"
                size="xs"
                icon={XMarkIcon}
                onClick={closeP4}
                tooltip="Close"
              />
            ) : undefined
          }
        />

        {/* Scrim */}
        <div
          className={[
            "s-absolute s-inset-0 s-z-40 s-bg-black/20 s-transition-opacity s-duration-200",
            showP1Overlay && !isPeek
              ? "s-pointer-events-auto s-opacity-100"
              : "s-pointer-events-none s-opacity-0",
          ].join(" ")}
          onClick={() => setP1Overlay(false)}
        />

        {/* P1 overlay panel — desktop only */}
        {!isMobile && (
          <div
            className={[
              "s-absolute s-bottom-0 s-left-0 s-top-0 s-z-50 s-flex s-flex-col",
              "s-bg-muted-background dark:s-bg-muted-background-night",
              "s-border-r s-border-separator dark:s-border-separator-night",
              "s-transition-[transform,opacity] s-duration-[220ms] s-ease-[cubic-bezier(.4,0,.2,1)]",
              showP1Overlay
                ? "s-translate-x-0 s-opacity-100 s-pointer-events-auto"
                : "-s-translate-x-full s-opacity-0 s-pointer-events-none",
              isPeek
                ? "s-shadow-[4px_0_16px_rgba(0,0,0,0.08)]"
                : "s-shadow-[8px_0_24px_rgba(0,0,0,0.10)]",
            ].join(" ")}
            style={{ width: p1W }}
            aria-hidden={!showP1Overlay}
            onMouseEnter={() => {
              if (p1Hidden) setP1Peek(true);
            }}
            onMouseLeave={() => setP1Peek(false)}
          >
            <header className="s-flex s-h-10 s-flex-none s-items-center s-justify-between s-gap-2 s-border-b s-border-separator s-px-2 dark:s-border-separator-night">
              <div className="s-flex s-items-center s-gap-1.5">
                <span className="s-rounded s-border s-border-separator s-bg-white s-px-1.5 s-py-0.5 s-text-[10px] s-font-semibold s-uppercase s-tracking-wider s-text-foreground dark:s-border-separator-night dark:s-bg-structure-0-night dark:s-text-foreground-night">
                  P1
                </span>
                <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                  {isPeek ? "peek" : "overlay"}
                </span>
              </div>
              <Button
                variant="ghost"
                size="xs"
                icon={XMarkIcon}
                onClick={() => {
                  setP1Overlay(false);
                  setP1Peek(false);
                }}
                tooltip="Dismiss"
              />
            </header>
            <div className="s-flex-1 s-bg-[repeating-linear-gradient(45deg,transparent_0,transparent_11px,rgba(0,0,0,0.06)_11px,rgba(0,0,0,0.06)_12px)]" />
          </div>
        )}

        {/* Edge peek trigger — desktop only */}
        {!isMobile && p1Hidden && !p1Overlay && (
          <div
            className="s-absolute s-bottom-0 s-left-0 s-top-0 s-z-[35] s-w-2 s-cursor-pointer"
            onMouseEnter={() => setP1Peek(true)}
            onMouseLeave={() => setP1Peek(false)}
          />
        )}
      </div>
    </div>
  );
}
