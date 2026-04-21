import { DustLogo } from "@dust-tt/sparkle";
import {
  type CSSProperties,
  forwardRef,
  Fragment,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Dust hero — UN-BOXED, DRAGGABLE, LOGICALLY ORDERED.
// Every floating element has:
//   • a default non-overlapping position
//   • drag-to-reorder (grab anywhere, position persists)
//   • skeuomorphic rest / hover / pressed / dragging states
// Ink links are computed from live DOM refs, so they always reach the
// correct anchor even after dragging or window resize.
//
// Reveal order after Send:
//   1. Sarah pill (top-left)     — the asker identity
//   2. Sarah's question bubble   — connected by ink line to pill
//   3. @dust header + thinking   — with its own dashed column line
//   4. Connector chips fan out   — Salesforce → Zendesk (interleaved w/ thinking)
//   5. @dust final reply         — replaces thinking
//   6. Marco pill (red ping)     — linked from @dust reply
//   7. Marco's bubble            — linked from Marco pill
// ─────────────────────────────────────────────────────────────────────────────

const FONT_SANS =
  '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

type AvatarKey = "sarah" | "marco";

const AVATAR_PHOTOS: Record<AvatarKey, string> = {
  sarah:
    "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=128&h=128&fit=crop&crop=faces&auto=format",
  marco:
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=128&h=128&fit=crop&crop=faces&auto=format",
};

const PREFILLED = "@dust how's the Acme renewal looking?";

type ConnectorKind = "salesforce" | "zendesk";

type ThinkStep = { label: string; done: boolean };

type Reply = { text: string; secs: string };

type ScriptStep =
  | { kind: "sarahPill"; delay: number }
  | { kind: "sarahBubble"; delay: number }
  | { kind: "dustAppear"; delay: number }
  | { kind: "thinkStep"; delay: number; label: string }
  | { kind: "connector"; delay: number; which: ConnectorKind }
  | { kind: "dustReply"; delay: number; text: string }
  | { kind: "marcoPill"; delay: number }
  | { kind: "marcoBubble"; delay: number; text: string };

const SCRIPT: ScriptStep[] = [
  { kind: "sarahPill", delay: 300 },
  { kind: "sarahBubble", delay: 500 },
  { kind: "dustAppear", delay: 700 },
  { kind: "thinkStep", delay: 450, label: "Reading the thread context" },
  { kind: "thinkStep", delay: 900, label: "Searching Salesforce for Acme" },
  { kind: "connector", delay: 250, which: "salesforce" },
  { kind: "thinkStep", delay: 750, label: "Checking Zendesk tickets" },
  { kind: "connector", delay: 250, which: "zendesk" },
  { kind: "thinkStep", delay: 700, label: "Summarising renewal risk" },
  {
    kind: "dustReply",
    delay: 650,
    text: "Risk is **high** — usage is down **32%** since April and there are 2 open tickets. I'd loop in @marco before the QBR on Friday.",
  },
  { kind: "marcoPill", delay: 900 },
  {
    kind: "marcoBubble",
    delay: 850,
    text: "On it — drafting a save plan today.",
  },
];

type PosKey =
  | "sarahPill"
  | "sarahBubble"
  | "dust"
  | "connectors"
  | "marcoPill"
  | "marcoBubble";

type Pos = { x: number; y: number };

// Approximate widths of each card (for right-rail placement and drag clamping).
const CARD_W: Record<PosKey, number> = {
  sarahPill: 140,
  sarahBubble: 320,
  dust: 380,
  connectors: 220,
  marcoPill: 140,
  marcoBubble: 260,
};

// Default positions arranged as a clockwise ring around the centered headline
// column so the narrative chain of ink links traces a circle:
//   sarahPill (11 o'clock) → sarahBubble (1) → dust (3) → connectors (5) →
//   marcoPill (7) → marcoBubble (9) — visually closing the loop back toward
//   Sarah. Cards stay on the left and right rails, clear of the headline.
function computeDefaultPos(stageW: number): Record<PosKey, Pos> {
  const leftX = 20;
  const rightX = (w: number) => Math.max(leftX + w + 40, stageW - w - 20);
  return {
    sarahPill: { x: leftX, y: 90 }, // 11 o'clock
    sarahBubble: { x: rightX(CARD_W.sarahBubble), y: 90 }, // 1 o'clock
    dust: { x: rightX(CARD_W.dust), y: 360 }, // 3 o'clock
    connectors: { x: rightX(CARD_W.connectors) - 60, y: 680 }, // 5 o'clock
    marcoPill: { x: leftX + 20, y: 700 }, // 7 o'clock
    marcoBubble: { x: leftX, y: 410 }, // 9 o'clock
  };
}

const FALLBACK_POS = computeDefaultPos(1232); // maxWidth 1280 - 2*24 padding

type Vis = {
  sarahPill: boolean;
  sarahBubble: boolean;
  dust: boolean;
  thinking: ThinkStep[];
  reply: Reply | null;
  connectors: ConnectorKind[];
  marcoPill: boolean;
  marcoBubble: { text: string } | null;
};

const INITIAL_VIS: Vis = {
  sarahPill: false,
  sarahBubble: false,
  dust: false,
  thinking: [],
  reply: null,
  connectors: [],
  marcoPill: false,
  marcoBubble: null,
};

export default function HeroConcept() {
  useInstrumentSerif();

  const [draft, setDraft] = useState(PREFILLED);
  const [vis, setVis] = useState<Vis>(INITIAL_VIS);
  const [pos, setPos] = useState<Record<PosKey, Pos>>(FALLBACK_POS);
  const [stageW, setStageW] = useState<number>(1232);
  const [running, setRunning] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const posUserMovedRef = useRef(false);

  const refs = {
    sarahPill: useRef<HTMLDivElement | null>(null),
    sarahBubble: useRef<HTMLDivElement | null>(null),
    dust: useRef<HTMLDivElement | null>(null),
    connectors: useRef<HTMLDivElement | null>(null),
    dustReply: useRef<HTMLDivElement | null>(null),
    marcoPill: useRef<HTMLDivElement | null>(null),
    marcoBubble: useRef<HTMLDivElement | null>(null),
  };

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setDraft(PREFILLED);
    setVis(INITIAL_VIS);
    setRunning(false);
  }, [clearTimers]);

  const resetLayout = useCallback(() => {
    posUserMovedRef.current = false;
    setPos(computeDefaultPos(stageRef.current?.clientWidth ?? stageW));
  }, [stageW]);

  // Keep default positions in sync with stage width until the user drags a card.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const apply = () => {
      const w = stage.clientWidth;
      setStageW(w);
      if (!posUserMovedRef.current) {
        setPos(computeDefaultPos(w));
      }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  const run = useCallback(() => {
    if (running) {
      return;
    }
    clearTimers();
    setVis(INITIAL_VIS);
    setDraft("");
    setRunning(true);

    let t = 0;
    let thinkStart = 0;
    let steps: ThinkStep[] = [];

    SCRIPT.forEach((step) => {
      t += step.delay;
      timersRef.current.push(
        setTimeout(() => {
          setVis((s) => {
            const next: Vis = { ...s };
            if (step.kind === "sarahPill") {
              next.sarahPill = true;
            } else if (step.kind === "sarahBubble") {
              next.sarahBubble = true;
            } else if (step.kind === "dustAppear") {
              next.dust = true;
              thinkStart = Date.now();
            } else if (step.kind === "thinkStep") {
              steps = steps.map((x) => ({ ...x, done: true }));
              steps.push({ label: step.label, done: false });
              next.thinking = [...steps];
            } else if (step.kind === "connector") {
              next.connectors = [...s.connectors, step.which];
            } else if (step.kind === "dustReply") {
              steps = steps.map((x) => ({ ...x, done: true }));
              const secs = ((Date.now() - thinkStart) / 1000).toFixed(1);
              next.thinking = [...steps];
              next.reply = { text: step.text, secs };
            } else if (step.kind === "marcoPill") {
              next.marcoPill = true;
            } else if (step.kind === "marcoBubble") {
              next.marcoBubble = { text: step.text };
            }
            return next;
          });
        }, t)
      );
    });

    timersRef.current.push(setTimeout(() => setRunning(false), t + 200));
  }, [clearTimers, running]);

  useEffect(() => clearTimers, [clearTimers]);

  const makeDrag = useCallback(
    (key: PosKey) => (e: ReactPointerEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("a,input,button")) {
        return;
      }
      e.preventDefault();
      const stage = stageRef.current;
      if (!stage) {
        return;
      }
      const startX = e.clientX;
      const startY = e.clientY;
      const start = pos[key];
      const cardW = CARD_W[key];
      const stageClientW = stage.clientWidth;
      const stageClientH = stage.clientHeight;
      const EDGE_VISIBLE = 48;
      posUserMovedRef.current = true;
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";

      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const nx = Math.max(
          EDGE_VISIBLE - cardW,
          Math.min(stageClientW - EDGE_VISIBLE, start.x + dx)
        );
        const ny = Math.max(
          0,
          Math.min(stageClientH - EDGE_VISIBLE, start.y + dy)
        );
        setPos((p) => ({ ...p, [key]: { x: nx, y: ny } }));
      };
      const up = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [pos]
  );

  return (
    <div
      className="hero-scope"
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100vh",
        background: "#FAFAF7",
        overflow: "hidden",
        fontFamily: FONT_SANS,
      }}
    >
      {/* Paper texture + color washes */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `
            radial-gradient(ellipse 55% 45% at 80% 25%, rgba(202,235,255,0.55) 0%, transparent 60%),
            radial-gradient(ellipse 45% 40% at 12% 80%, rgba(255,230,200,0.45) 0%, transparent 60%),
            radial-gradient(circle at 1px 1px, rgba(17,20,24,0.025) 1px, transparent 0) 0 0 / 18px 18px
          `,
        }}
      />

      <Nav />

      <div
        ref={stageRef}
        className="hero-stage"
        style={{
          position: "relative",
          maxWidth: 1280,
          margin: "0 auto",
          padding: "40px 24px 80px",
          minHeight: 900,
        }}
      >
        <InkLinks stageRef={stageRef} refs={refs} vis={vis} />

        <DraggableFloat
          shown={vis.sarahPill}
          pos={pos.sarahPill}
          onPointerDown={makeDrag("sarahPill")}
          innerRef={refs.sarahPill}
          baseRotate={-2.5}
          floatKey="a"
        >
          <PersonPill who="sarah" name="Sarah" role="CS Lead" />
        </DraggableFloat>

        <DraggableFloat
          shown={vis.sarahBubble}
          pos={pos.sarahBubble}
          onPointerDown={makeDrag("sarahBubble")}
          innerRef={refs.sarahBubble}
          baseRotate={1.2}
          width={320}
        >
          <SpeechBubble
            side="right"
            avatar="sarah"
            name="Sarah"
            time="now"
            text={PREFILLED}
          />
        </DraggableFloat>

        <DraggableFloat
          shown={vis.dust}
          pos={pos.dust}
          onPointerDown={makeDrag("dust")}
          innerRef={refs.dust}
          baseRotate={-1.2}
          width={380}
        >
          <AgentColumn
            thinking={vis.thinking}
            reply={vis.reply}
            innerReplyRef={refs.dustReply}
          />
        </DraggableFloat>

        <DraggableFloat
          shown={vis.connectors.length > 0}
          pos={pos.connectors}
          onPointerDown={makeDrag("connectors")}
          innerRef={refs.connectors}
          baseRotate={0}
          width={220}
        >
          <ConnectorStack items={vis.connectors} />
        </DraggableFloat>

        <DraggableFloat
          shown={vis.marcoPill}
          pos={pos.marcoPill}
          onPointerDown={makeDrag("marcoPill")}
          innerRef={refs.marcoPill}
          baseRotate={3}
          floatKey="b"
        >
          <PersonPill
            who="marco"
            name="Marco"
            role="AE"
            ping={vis.marcoPill && !vis.marcoBubble}
          />
        </DraggableFloat>

        <DraggableFloat
          shown={!!vis.marcoBubble}
          pos={pos.marcoBubble}
          onPointerDown={makeDrag("marcoBubble")}
          innerRef={refs.marcoBubble}
          baseRotate={1.8}
          width={260}
        >
          <SpeechBubble
            side="left"
            avatar="marco"
            name="Marco"
            time="just now"
            text={vis.marcoBubble?.text || "…"}
          />
        </DraggableFloat>

        {/* Headline + composer — the STAGE ANCHOR, always visible */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: 760,
            margin: "60px auto 40px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              marginBottom: 20,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 14px 6px 6px",
                background: "rgba(255,255,255,0.8)",
                backdropFilter: "blur(6px)",
                border: "1px solid #EAEBEE",
                borderRadius: 999,
                font: `500 12px/16px ${FONT_SANS}`,
                color: "#313235",
                letterSpacing: "-0.1px",
                boxShadow: "0 1px 2px rgba(17,20,24,0.04)",
              }}
            >
              <DustSparkle size={20} />
              The platform for AI operators
            </div>
          </div>

          <h1
            className="hero-headline"
            style={{
              font: `500 clamp(44px, 6.5vw, 76px)/1.04 ${FONT_SANS}`,
              letterSpacing: "-0.05em",
              color: "#111418",
              margin: "0 0 22px",
              textWrap: "balance",
            }}
          >
            Where your team{" "}
            <em
              style={{
                fontStyle: "italic",
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontWeight: 400,
                color: "#1C222D",
                letterSpacing: "-2px",
              }}
            >
              and your agents
            </em>{" "}
            work together
          </h1>

          <p
            style={{
              font: `400 18px/26px ${FONT_SANS}`,
              letterSpacing: "-0.36px",
              color: "#596170",
              margin: "0 auto 28px",
              maxWidth: 520,
              textWrap: "pretty",
            }}
          >
            Dust puts AI inside the thread — answering, searching and
            summarising from your tools, right next to the people doing the
            work.
          </p>

          <InlineComposer
            draft={draft}
            setDraft={setDraft}
            running={running}
            onSend={run}
            onReset={reset}
            onResetLayout={resetLayout}
          />

          {!vis.sarahPill && !running && (
            <div
              style={{
                marginTop: 24,
                font: "italic 400 13px/18px 'Instrument Serif', Georgia, serif",
                color: "#9CA0AA",
              }}
            >
              ↑ Press{" "}
              <strong
                style={{
                  fontStyle: "normal",
                  fontFamily: FONT_SANS,
                  color: "#596170",
                }}
              >
                Send
              </strong>{" "}
              — watch @dust work · every card is draggable
            </div>
          )}
        </div>
      </div>

      <style>{KEYFRAMES_CSS}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Draggable wrapper — handles absolute positioning, rotation, hover lift,
// floating animation. Press-and-drag anywhere on the card.
// ─────────────────────────────────────────────────────────────────────────────
function DraggableFloat({
  children,
  shown,
  pos,
  onPointerDown,
  innerRef,
  baseRotate = 0,
  width,
  floatKey,
}: {
  children: ReactNode;
  shown: boolean;
  pos: Pos;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  innerRef: RefObject<HTMLDivElement | null>;
  baseRotate?: number;
  width?: number;
  floatKey?: "a" | "b";
}) {
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);

  const handleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    setDragging(true);
    onPointerDown(e);
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointerup", up);
  };

  const floatAnim =
    floatKey === "a"
      ? "heroFloatA 5.5s ease-in-out infinite"
      : floatKey === "b"
        ? "heroFloatB 6.5s ease-in-out infinite"
        : "none";

  return (
    <div
      ref={innerRef}
      className="floating-card drag-handle"
      onPointerDown={handleDown}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width,
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
        zIndex: dragging ? 30 : hover ? 5 : 3,
        cursor: dragging ? "grabbing" : "grab",
        opacity: shown ? 1 : 0,
        filter: dragging
          ? "drop-shadow(0 30px 40px rgba(17,20,24,0.25))"
          : "none",
        transition: dragging
          ? "opacity 420ms ease-out, filter 180ms ease-out"
          : "opacity 420ms ease-out, transform 280ms cubic-bezier(0.165, 0.84, 0.44, 1), filter 180ms ease-out",
        willChange: "transform",
        pointerEvents: shown ? "auto" : "none",
        touchAction: "none",
      }}
    >
      {/* Float layer — owns its own transform keyframe, no conflict */}
      <div
        style={{
          animation: shown && !dragging && !hover ? floatAnim : "none",
          willChange: "transform",
        }}
      >
        {/* Rotate + hover-lift layer */}
        <div
          style={{
            transform: `rotate(${dragging ? 0 : baseRotate}deg)${
              !dragging && hover ? " translateY(-2px)" : ""
            }`,
            transition: dragging ? "none" : "transform 220ms ease-out",
            willChange: "transform",
          }}
        >
          {children}
        </div>
      </div>
      <span
        className="drag-dots"
        style={{
          position: "absolute",
          top: -10,
          right: -10,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "linear-gradient(180deg, #FFFFFF 0%, #F3F3F0 100%)",
          border: "1px solid #E2E4E8",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 6px rgba(17,20,24,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: dragging ? 1 : 0,
          transition: "opacity 180ms ease-out",
          pointerEvents: "none",
          color: "#9CA0AA",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 16 16">
          <g fill="currentColor">
            <circle cx="5" cy="4" r="1.2" />
            <circle cx="5" cy="8" r="1.2" />
            <circle cx="5" cy="12" r="1.2" />
            <circle cx="11" cy="4" r="1.2" />
            <circle cx="11" cy="8" r="1.2" />
            <circle cx="11" cy="12" r="1.2" />
          </g>
        </svg>
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ink links — compute paths from live DOM refs each render
// ─────────────────────────────────────────────────────────────────────────────
type Anchor = { x: number; y: number };

function InkLinks({
  stageRef,
  refs,
  vis,
}: {
  stageRef: RefObject<HTMLDivElement | null>;
  refs: {
    sarahPill: RefObject<HTMLDivElement | null>;
    sarahBubble: RefObject<HTMLDivElement | null>;
    dust: RefObject<HTMLDivElement | null>;
    connectors: RefObject<HTMLDivElement | null>;
    dustReply: RefObject<HTMLDivElement | null>;
    marcoPill: RefObject<HTMLDivElement | null>;
    marcoBubble: RefObject<HTMLDivElement | null>;
  };
  vis: Vis;
}) {
  const [stageRect, setStageRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const update = () => {
      const r = stage.getBoundingClientRect();
      setStageRect((prev) => {
        if (
          prev &&
          prev.width === r.width &&
          prev.height === r.height &&
          prev.left === r.left &&
          prev.top === r.top
        ) {
          return prev;
        }
        return r;
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stage);
    window.addEventListener("scroll", update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
    };
  }, [stageRef]);

  // rAF tick so path re-renders as drags happen (refs are the source of truth)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let id = 0;
    const loop = () => {
      setTick((t) => (t + 1) % 1000000);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  const paths = useMemo(() => {
    if (!stageRect) {
      return [];
    }
    type Side = "left" | "right" | "top" | "bottom";
    type Box = { x: number; y: number; w: number; h: number };

    const boxOf = (ref: RefObject<HTMLDivElement | null>): Box | null => {
      const el = ref.current;
      if (!el) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return {
        x: r.left - stageRect.left,
        y: r.top - stageRect.top,
        w: r.width,
        h: r.height,
      };
    };

    const sidePoint = (b: Box, side: Side): Anchor => {
      switch (side) {
        case "left":
          return { x: b.x, y: b.y + b.h / 2 };
        case "right":
          return { x: b.x + b.w, y: b.y + b.h / 2 };
        case "top":
          return { x: b.x + b.w / 2, y: b.y };
        case "bottom":
          return { x: b.x + b.w / 2, y: b.y + b.h };
      }
    };

    // Pick the side of `from` whose midpoint is closest to the center of `to`.
    // Guarantees the line exits from the edge facing its partner, even after
    // a card is dragged to an arbitrary position.
    const bestSide = (from: Box, to: Box): Side => {
      const toCx = to.x + to.w / 2;
      const toCy = to.y + to.h / 2;
      const sides: Side[] = ["left", "right", "top", "bottom"];
      let best: { side: Side; d: number } = { side: "right", d: Infinity };
      for (const s of sides) {
        const p = sidePoint(from, s);
        const d = Math.hypot(p.x - toCx, p.y - toCy);
        if (d < best.d) {
          best = { side: s, d };
        }
      }
      return best.side;
    };

    const curve = (a: Anchor, b: Anchor, bow = 0.3) => {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) {
        return null;
      }
      // Unit perpendicular → consistent arc bow regardless of distance.
      const nx = -dy / len;
      const ny = dx / len;
      const k = bow * 0.125 * len;
      const cx = mx + nx * k;
      const cy = my + ny * k;
      return { d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`, end: b };
    };

    const link = (
      fromRef: RefObject<HTMLDivElement | null>,
      toRef: RefObject<HTMLDivElement | null>,
      bow = 0.3
    ) => {
      const a = boxOf(fromRef);
      const b = boxOf(toRef);
      if (!a || !b) {
        return null;
      }
      return curve(
        sidePoint(a, bestSide(a, b)),
        sidePoint(b, bestSide(b, a)),
        bow
      );
    };

    // Six cards form a clockwise ring around the headline. Each link hops to
    // the neighbor along the perimeter — never cutting across the center.
    // Sides are auto-picked so the line always exits/enters the facing edge.
    return [
      {
        path: link(refs.sarahPill, refs.sarahBubble, 0.35),
        show: vis.sarahPill && vis.sarahBubble,
        color: "#B2B6BD",
        delay: 0,
      },
      {
        path: link(refs.sarahBubble, refs.dust, 0.3),
        show: vis.sarahBubble && vis.dust,
        color: "#418B5C",
        delay: 100,
      },
      {
        path: link(refs.dust, refs.connectors, 0.25),
        show: vis.dust && vis.connectors.length > 0,
        color: "#418B5C",
        delay: 0,
      },
      {
        path: link(refs.dustReply, refs.marcoPill, 0.35),
        show: !!vis.reply && vis.marcoPill,
        color: "#418B5C",
        delay: 200,
      },
      {
        path: link(refs.marcoPill, refs.marcoBubble, 0.3),
        show: vis.marcoPill && !!vis.marcoBubble,
        color: "#B2B6BD",
        delay: 100,
      },
    ];
    // tick intentionally included to force recompute on rAF
  }, [stageRect, refs, vis, tick]);

  if (!stageRect) {
    return null;
  }

  return (
    <svg
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: stageRect.width,
        height: stageRect.height,
        pointerEvents: "none",
        zIndex: 1,
        overflow: "visible",
      }}
    >
      <defs>
        <filter id="heroInkWobble" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves={2}
            seed={5}
          />
          <feDisplacementMap in="SourceGraphic" scale="0.6" />
        </filter>
      </defs>
      {paths.map((p, i) =>
        p.path ? (
          <g key={i}>
            <path
              d={p.path.d}
              stroke={p.color}
              strokeWidth="1.5"
              fill="none"
              strokeDasharray="4 6"
              strokeLinecap="round"
              opacity={p.show ? 0.75 : 0}
              style={{
                transition: `opacity 500ms ease-out ${p.delay}ms`,
                animation: "heroDashFlow 4s linear infinite",
              }}
              filter="url(#heroInkWobble)"
            />
            {p.show && (
              <circle
                cx={p.path.end.x}
                cy={p.path.end.y}
                r="2.5"
                fill={p.color}
                opacity="0.8"
                style={{
                  transition: `opacity 500ms ease-out ${p.delay}ms`,
                }}
              />
            )}
          </g>
        ) : null
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dust sparkle
// ─────────────────────────────────────────────────────────────────────────────
function DustSparkle({ size = 20 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: "linear-gradient(145deg, #418B5C 0%, #105B2B 100%)",
        color: "#FFFFFF",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.15), 0 1px 2px rgba(17,20,24,0.2)",
      }}
    >
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M12 2.5l1.9 5.2L19 9.5l-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.8L12 2.5z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Person pill with skeuo rest/hover/pressed + optional notification ping
// ─────────────────────────────────────────────────────────────────────────────
function PersonPill({
  who,
  name,
  role,
  ping,
}: {
  who: AvatarKey;
  name: string;
  role: string;
  ping?: boolean;
}) {
  return (
    <div
      className="skeuo-pressable"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 14px 6px 6px",
        background: "linear-gradient(180deg, #FFFFFF 0%, #FBFBF9 100%)",
        border: "1px solid #EAEBEE",
        borderRadius: 999,
        position: "relative",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(17,20,24,0.04), 0 1px 2px rgba(17,20,24,0.05), 0 12px 28px -10px rgba(17,20,24,0.14)",
      }}
    >
      <img
        src={AVATAR_PHOTOS[who]}
        alt=""
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          objectFit: "cover",
          boxShadow: "0 0 0 2px #FFFFFF, inset 0 0 0 1px rgba(17,20,24,0.05)",
        }}
      />
      <div style={{ lineHeight: 1 }}>
        <div
          style={{
            font: `600 13px/16px ${FONT_SANS}`,
            color: "#111418",
            letterSpacing: "-0.15px",
          }}
        >
          {name}
        </div>
        <div
          style={{
            font: `400 10px/14px ${FONT_SANS}`,
            color: "#7B818D",
          }}
        >
          {role}
        </div>
      </div>
      {ping && (
        <span
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "linear-gradient(180deg, #FF6B6B 0%, #E03B3B 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.3), 0 0 0 2px #FAFAF7, 0 2px 6px rgba(224,59,59,0.5)",
            animation:
              "heroNotify 600ms ease-out both, heroPulse 1.8s ease-in-out infinite 600ms",
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Speech bubble
// ─────────────────────────────────────────────────────────────────────────────
function SpeechBubble({
  avatar,
  name,
  time,
  text,
  side = "left",
}: {
  avatar: AvatarKey;
  name: string;
  time: string;
  text: string;
  side?: "left" | "right";
}) {
  const isRight = side === "right";
  return (
    <div
      className="skeuo-pressable"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isRight ? "flex-end" : "flex-start",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexDirection: isRight ? "row-reverse" : "row",
          padding: "0 4px",
        }}
      >
        <img
          src={AVATAR_PHOTOS[avatar]}
          alt=""
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            objectFit: "cover",
            boxShadow: "0 0 0 2px #FFFFFF, 0 1px 2px rgba(17,20,24,0.08)",
          }}
        />
        <span
          style={{
            font: `600 12px/16px ${FONT_SANS}`,
            color: "#111418",
            letterSpacing: "-0.15px",
          }}
        >
          {name}
        </span>
        <span
          style={{
            font: `400 11px/14px ${FONT_SANS}`,
            color: "#B2B6BD",
          }}
        >
          {time}
        </span>
      </div>
      <div
        style={{
          position: "relative",
          padding: "10px 14px",
          background: "linear-gradient(180deg, #FFFFFF 0%, #F7F7F5 100%)",
          border: "1px solid #EAEBEE",
          borderRadius: isRight ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          font: `400 14px/20px ${FONT_SANS}`,
          color: "#1C222D",
          letterSpacing: "-0.15px",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(17,20,24,0.04), 0 1px 2px rgba(17,20,24,0.04), 0 14px 30px -12px rgba(17,20,24,0.18)",
          textWrap: "pretty",
        }}
      >
        {renderInline(text)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// @dust agent column — header + thinking list + final reply
// ─────────────────────────────────────────────────────────────────────────────
function AgentColumn({
  thinking,
  reply,
  innerReplyRef,
}: {
  thinking: ThinkStep[];
  reply: Reply | null;
  innerReplyRef: RefObject<HTMLDivElement | null>;
}) {
  const done = !!reply;
  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          padding: "6px 10px 6px 6px",
          background: "linear-gradient(180deg, #FFFFFF 0%, #FBFBF9 100%)",
          border: "1px solid #EAEBEE",
          borderRadius: 999,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(17,20,24,0.04)",
          width: "fit-content",
        }}
      >
        <DustSparkle size={22} />
        <span
          style={{
            font: `600 13px/16px ${FONT_SANS}`,
            color: "#111418",
            letterSpacing: "-0.15px",
          }}
        >
          @dust
        </span>
        <span
          style={{
            padding: "1px 6px",
            background: "linear-gradient(180deg, #20232A 0%, #0D0F14 100%)",
            color: "#FFFFFF",
            borderRadius: 4,
            font: `600 9px/14px ${FONT_SANS}`,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
        >
          Agent
        </span>
        <span
          style={{
            font: `400 11px/14px ${FONT_SANS}`,
            color: "#B2B6BD",
          }}
        >
          {done
            ? `crunched in ${reply.secs}s`
            : thinking.length > 0
              ? "thinking…"
              : "online"}
        </span>
      </div>

      {thinking.length > 0 && !done && (
        <div
          style={{
            paddingLeft: 12,
            marginLeft: 10,
            borderLeft: "1.5px dashed #D3D5D9",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {thinking.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                font: `400 12px/16px ${FONT_SANS}`,
                color: s.done ? "#596170" : "#1C222D",
                animation: "heroFadeUp 320ms ease-out both",
              }}
            >
              {s.done ? (
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background:
                      "linear-gradient(180deg, #E6F2EC 0%, #CDE3D7 100%)",
                    color: "#277644",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 1px rgba(17,20,24,0.06)",
                    flexShrink: 0,
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 12l5 5L20 7"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              ) : (
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    border: "1.5px solid #418B5C",
                    borderTopColor: "transparent",
                    animation: "heroSpin 0.9s linear infinite",
                    flexShrink: 0,
                  }}
                />
              )}
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {done && (
        <div
          ref={innerReplyRef}
          style={{
            padding: "12px 16px",
            background: "linear-gradient(180deg, #FEFFF5 0%, #F9FAE9 100%)",
            border: "1px solid #E9E9BF",
            borderRadius: 14,
            font: `400 14px/21px ${FONT_SANS}`,
            color: "#1C222D",
            letterSpacing: "-0.15px",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(17,20,24,0.04), 0 1px 2px rgba(17,20,24,0.04), 0 16px 36px -14px rgba(17,20,24,0.15)",
            textWrap: "pretty",
            animation: "heroFadeUp 500ms ease-out both",
          }}
        >
          {renderInline(reply.text)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Connector stack — chips stack vertically, fan in one at a time
// ─────────────────────────────────────────────────────────────────────────────
function ConnectorStack({ items }: { items: ConnectorKind[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "flex-start",
      }}
    >
      {items.map((c, i) => (
        <div
          key={c}
          style={{
            transform: `rotate(${i % 2 === 0 ? -4 : 3}deg)`,
            animation: "heroFadeUp 500ms ease-out both",
          }}
        >
          <ConnectorChip kind={c} />
        </div>
      ))}
    </div>
  );
}

function ConnectorChip({ kind }: { kind: ConnectorKind }) {
  const logos: Record<
    ConnectorKind,
    { bg: string; fg: string; label: string; name: string }
  > = {
    salesforce: {
      bg: "#00A1E0",
      fg: "#FFFFFF",
      label: "☁",
      name: "Salesforce",
    },
    zendesk: { bg: "#03363D", fg: "#FFFFFF", label: "Z", name: "Zendesk" },
  };
  const l = logos[kind];
  return (
    <span
      className="skeuo-pressable"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px 6px 6px",
        background: "linear-gradient(180deg, #FFFFFF 0%, #FBFBF9 100%)",
        border: "1px solid #EAEBEE",
        borderRadius: 999,
        font: `500 12px/16px ${FONT_SANS}`,
        color: "#313235",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(17,20,24,0.04), 0 1px 2px rgba(17,20,24,0.05), 0 10px 20px -8px rgba(17,20,24,0.14)",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: `linear-gradient(145deg, ${l.bg} 0%, ${l.bg}cc 100%)`,
          color: l.fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          font: `700 11px/1 ${FONT_SANS}`,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15)",
        }}
      >
        {l.label}
      </span>
      <span>{l.name}</span>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 30% 30%, #6DDB8E 0%, #277644 70%)",
          boxShadow:
            "0 0 6px rgba(65,139,92,0.6), inset 0 1px 0 rgba(255,255,255,0.3)",
          animation: "heroPulse 1.6s ease-in-out infinite",
        }}
      />
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline composer (skeuo hover/pressed)
// ─────────────────────────────────────────────────────────────────────────────
const InlineComposer = forwardRef<
  HTMLDivElement,
  {
    draft: string;
    setDraft: (v: string) => void;
    running: boolean;
    onSend: () => void;
    onReset: () => void;
    onResetLayout: () => void;
  }
>(function InlineComposer(
  { draft, setDraft, running, onSend, onReset, onResetLayout },
  ref
) {
  const [btnHover, setBtnHover] = useState(false);
  const [btnDown, setBtnDown] = useState(false);

  return (
    <div
      ref={ref}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 8px 8px 14px",
          background: "linear-gradient(180deg, #FFFFFF 0%, #F7F7F5 100%)",
          border: "1px solid #E2E4E8",
          borderRadius: 14,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(17,20,24,0.04), 0 1px 2px rgba(17,20,24,0.04), 0 10px 24px -8px rgba(17,20,24,0.12)",
          width: "min(520px, 100%)",
        }}
      >
        <img
          src={AVATAR_PHOTOS.sarah}
          alt=""
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            objectFit: "cover",
            flexShrink: 0,
            boxShadow: "0 0 0 2px #FFFFFF, 0 1px 2px rgba(17,20,24,0.08)",
          }}
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask @dust a question…"
          disabled={running}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            font: `400 14px/20px ${FONT_SANS}`,
            color: "#1C222D",
            letterSpacing: "-0.15px",
            padding: 0,
            textAlign: "left",
          }}
        />
        <button
          type="submit"
          disabled={running || !draft.trim()}
          onMouseEnter={() => setBtnHover(true)}
          onMouseLeave={() => {
            setBtnHover(false);
            setBtnDown(false);
          }}
          onMouseDown={() => setBtnDown(true)}
          onMouseUp={() => setBtnDown(false)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: running
              ? "linear-gradient(180deg, #C6CAD2 0%, #B2B6BD 100%)"
              : btnDown
                ? "linear-gradient(180deg, #1478E0 0%, #0F5FB8 100%)"
                : btnHover
                  ? "linear-gradient(180deg, #3FACFF 0%, #1C88EA 100%)"
                  : "linear-gradient(180deg, #2BA0FF 0%, #1478E0 100%)",
            color: "#FFFFFF",
            border: "none",
            borderRadius: 10,
            font: `600 13px/18px ${FONT_SANS}`,
            cursor: running ? "default" : "pointer",
            transform: btnDown ? "translateY(1px) scale(0.98)" : "none",
            transition:
              "transform 120ms ease-out, background 180ms ease-out, box-shadow 180ms ease-out",
            boxShadow: running
              ? "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.1)"
              : btnDown
                ? "inset 0 1px 2px rgba(0,0,0,0.25), inset 0 -1px 0 rgba(255,255,255,0.1)"
                : btnHover
                  ? "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15), 0 1px 2px rgba(17,20,24,0.08), 0 6px 14px rgba(28,145,255,0.45)"
                  : "inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.12), 0 1px 2px rgba(17,20,24,0.08), 0 4px 10px rgba(28,145,255,0.35)",
          }}
        >
          {running ? (
            <>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  border: "1.5px solid #FFFFFF",
                  borderTopColor: "transparent",
                  animation: "heroSpin 0.9s linear infinite",
                }}
              />
              Running
            </>
          ) : (
            <>
              Send
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M3 12l18-9-4 18-5-7-9-2z" fill="currentColor" />
              </svg>
            </>
          )}
        </button>
      </form>
      <button
        onClick={onReset}
        className="skeuo-pressable"
        style={{
          padding: "9px 14px",
          background: "linear-gradient(180deg, #FFFFFF 0%, #F3F3F0 100%)",
          border: "1px dashed #D3D5D9",
          borderRadius: 10,
          font: `500 13px/18px ${FONT_SANS}`,
          color: "#596170",
          cursor: "pointer",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(17,20,24,0.04)",
        }}
      >
        ↻ Reset
      </button>
      <button
        onClick={onResetLayout}
        className="skeuo-pressable"
        title="Put cards back"
        style={{
          padding: "9px 12px",
          background: "transparent",
          border: "1px solid transparent",
          borderRadius: 10,
          font: `500 12px/16px ${FONT_SANS}`,
          color: "#9CA0AA",
          cursor: "pointer",
        }}
      >
        Re-tidy ⇱
      </button>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Inline markdown: **bold** and @mentions
// ─────────────────────────────────────────────────────────────────────────────
function renderInline(text: string) {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|@\w+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      out.push(<Fragment key={k++}>{text.slice(last, m.index)}</Fragment>);
    }
    const t = m[0];
    if (t.startsWith("**")) {
      out.push(
        <strong key={k++} style={{ fontWeight: 600, color: "#111418" }}>
          {t.slice(2, -2)}
        </strong>
      );
    } else {
      out.push(
        <span
          key={k++}
          style={{
            color: "#137FE3",
            fontWeight: 500,
            background: "#E9F3FC",
            borderRadius: 4,
            padding: "0 4px",
          }}
        >
          {t}
        </span>
      );
    }
    last = m.index + t.length;
  }
  if (last < text.length) {
    out.push(<Fragment key={k++}>{text.slice(last)}</Fragment>);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Nav
// ─────────────────────────────────────────────────────────────────────────────
function Nav() {
  const link: CSSProperties = {
    padding: "0 12px",
    font: `500 14px/22px ${FONT_SANS}`,
    color: "#171921",
    textDecoration: "none",
  };
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        height: 64,
        background: "rgba(250,250,247,0.85)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid #EEEEEF",
      }}
    >
      <div
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          height: "100%",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <DustLogo style={{ height: 20, width: "auto" }} />
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            marginLeft: 48,
            flex: 1,
          }}
        >
          {["Product", "Solutions", "Developers", "Resources", "Company"].map(
            (x) => (
              <a
                key={x}
                href="#"
                style={{
                  ...link,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {x}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </a>
            )
          )}
          <a href="#" style={link}>
            Security
          </a>
          <a href="#" style={link}>
            Pricing
          </a>
        </nav>
        <a
          href="#"
          style={{
            ...link,
            padding: "8px 12px",
            font: `500 15px/24px ${FONT_SANS}`,
            color: "#313235",
          }}
        >
          Sign in
        </a>
        <a
          href="#"
          className="skeuo-pressable"
          style={{
            padding: "8px 14px",
            background: "linear-gradient(180deg, #2BA0FF 0%, #1478E0 100%)",
            color: "#FFFFFF",
            borderRadius: 8,
            font: `500 15px/24px ${FONT_SANS}`,
            textDecoration: "none",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.1), 0 1px 2px rgba(17,20,24,0.08), 0 4px 10px rgba(28,145,255,0.3)",
          }}
        >
          Try for free
        </a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// One-time Instrument Serif loader — the headline accent uses it.
// ─────────────────────────────────────────────────────────────────────────────
const INSTRUMENT_SERIF_HREF =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap";

function useInstrumentSerif() {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    if (
      document.head.querySelector(
        `link[data-hero-concept-font="instrument-serif"]`
      )
    ) {
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = INSTRUMENT_SERIF_HREF;
    link.setAttribute("data-hero-concept-font", "instrument-serif");
    document.head.appendChild(link);
  }, []);
}

const KEYFRAMES_CSS = `
  @keyframes heroSpin { to { transform: rotate(360deg); } }
  @keyframes heroFadeUp {
    from { opacity: 0; transform: translateY(8px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes heroDashFlow { to { stroke-dashoffset: -24; } }
  @keyframes heroFloatA {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }
  @keyframes heroFloatB {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  @keyframes heroPulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.15); opacity: 0.7; }
  }
  @keyframes heroNotify {
    0% { transform: scale(0.6); opacity: 0; }
    50% { transform: scale(1.2); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  .skeuo-pressable {
    transition: transform 120ms ease-out, box-shadow 180ms ease-out, filter 180ms ease-out;
  }
  .skeuo-pressable:hover { filter: brightness(1.02); }
  .skeuo-pressable:active { transform: translateY(1px) scale(0.98); }
  .drag-handle { touch-action: none; }
  .drag-handle:hover .drag-dots { opacity: 1 !important; }
  .drag-handle:active { cursor: grabbing !important; }
  .floating-card { will-change: transform; }
  @media (max-width: 900px) {
    .hero-stage { min-height: 0 !important; padding: 40px 20px 60px !important; }
    .hero-headline { font-size: 40px !important; line-height: 44px !important; letter-spacing: -2px !important; }
    .floating-card { display: none !important; }
  }
  @media (prefers-reduced-motion: reduce) {
    .hero-scope, .hero-scope *, .hero-scope *::before, .hero-scope *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;
