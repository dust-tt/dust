import {
  AnimatedText,
  Avatar,
  Icon,
  MagnifyingGlassIcon,
  NotionLogo,
  ServerIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  GlobeAltIcon,
  ActionDatabaseIcon,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActorKind = "human" | "agent";

type Actor = {
  id: string;
  kind: ActorKind;
  name: string;
  // humans: photo path; agents: emoji char
  avatar: string;
  color?: string; // tailwind bg for agent avatar
};

type LogEntryKind =
  | "message" // person → person/agent
  | "tool_call" // agent tool invocation
  | "tool_result"; // result line from a tool

type ToolIcon = React.ComponentType<{ className?: string }>;

type LogEntry = {
  id: number;
  kind: LogEntryKind;
  from: Actor;
  text: string;
  toolIcon?: ToolIcon;
  toolLogoNode?: React.ReactNode;
  durationMs?: number; // how long this entry stays before the next one appears
};

// ─── Actors ───────────────────────────────────────────────────────────────────

const ELENA: Actor = {
  id: "elena",
  kind: "human",
  name: "Elena",
  avatar: "/landing/p5_cto.png",
};

const YUKI: Actor = {
  id: "yuki",
  kind: "human",
  name: "Yuki",
  avatar: "/landing/p8_data_analyst.png",
};

const SOPHIE: Actor = {
  id: "sophie",
  kind: "human",
  name: "Sophie",
  avatar: "/landing/p2_lead_scientist.png",
};

const JAMES: Actor = {
  id: "james",
  kind: "human",
  name: "James",
  avatar: "/landing/p4_comms_officer.png",
};

const ARIA: Actor = {
  id: "aria",
  kind: "agent",
  name: "Aria",
  avatar: "🔍",
  color: "s-bg-violet-100",
};

const ORION: Actor = {
  id: "orion",
  kind: "agent",
  name: "Orion",
  avatar: "🗄️",
  color: "s-bg-sky-100",
};

const HERMES: Actor = {
  id: "hermes",
  kind: "agent",
  name: "Hermes",
  avatar: "✍️",
  color: "s-bg-amber-100",
};

// ─── Activity log ─────────────────────────────────────────────────────────────

const LOG: LogEntry[] = [
  // ACT 1 — Discovery
  {
    id: 1,
    kind: "message",
    from: ELENA,
    text: "@Aria — check Ares-7 telemetry pipeline. Something feels off since last night.",
    durationMs: 2000,
  },
  {
    id: 2,
    kind: "tool_call",
    from: ARIA,
    text: 'Notion search: "Ares-7 pipeline docs"',
    toolLogoNode: <NotionLogo className="s-h-3.5 s-w-3.5" />,
    durationMs: 900,
  },
  {
    id: 3,
    kind: "tool_result",
    from: ARIA,
    text: "Found ingestion architecture doc",
    toolIcon: DocumentTextIcon,
    durationMs: 700,
  },
  {
    id: 4,
    kind: "tool_call",
    from: ORION,
    text: "DB query: telemetry_records, last 24h",
    toolIcon: ActionDatabaseIcon,
    durationMs: 1100,
  },
  {
    id: 5,
    kind: "tool_result",
    from: ORION,
    text: "3h gap detected (02:14–05:07 UTC)",
    toolIcon: ActionDatabaseIcon,
    durationMs: 600,
  },
  {
    id: 6,
    kind: "message",
    from: ORION,
    text: "3h of telemetry missing. Zero records ingested between 02:14–05:07 UTC.",
    durationMs: 2500,
  },

  // ACT 2 — Root Cause
  {
    id: 7,
    kind: "message",
    from: ELENA,
    text: "@Orion — check infra logs and error events for that window.",
    durationMs: 1800,
  },
  {
    id: 8,
    kind: "tool_call",
    from: ORION,
    text: "DB query: infra_events, 02:00–06:00 UTC",
    toolIcon: ActionDatabaseIcon,
    durationMs: 1200,
  },
  {
    id: 9,
    kind: "tool_result",
    from: ORION,
    text: "OOM kill on worker-node-4 at 02:13",
    toolIcon: ServerIcon,
    durationMs: 700,
  },
  {
    id: 10,
    kind: "tool_call",
    from: ARIA,
    text: 'Web search: "OOM kill data recovery no WAL"',
    toolIcon: GlobeAltIcon,
    durationMs: 1000,
  },
  {
    id: 11,
    kind: "tool_result",
    from: ARIA,
    text: "No recovery without write-ahead log",
    toolIcon: MagnifyingGlassIcon,
    durationMs: 600,
  },
  {
    id: 12,
    kind: "message",
    from: ARIA,
    text: "worker-node-4 crashed (OOM) at 02:13. No failover triggered. Data unrecoverable without WAL.",
    durationMs: 2800,
  },

  // ACT 3 — Human Input
  {
    id: 13,
    kind: "message",
    from: ELENA,
    text: "@Yuki — can you confirm the gap from your dashboard? Does it affect launch metrics?",
    durationMs: 2200,
  },
  {
    id: 14,
    kind: "message",
    from: YUKI,
    text: "Confirmed. Affects 4 KPIs. I can interpolate estimates if needed.",
    durationMs: 2000,
  },
  {
    id: 15,
    kind: "message",
    from: ELENA,
    text: "Yes please, attach to the incident report.",
    durationMs: 1800,
  },

  // ACT 4 — Incident Report
  {
    id: 16,
    kind: "message",
    from: ELENA,
    text: "@Hermes — draft incident report. Timeline, root cause, impact, fix recommendations.",
    durationMs: 1600,
  },
  {
    id: 17,
    kind: "tool_call",
    from: HERMES,
    text: "Write file: incident_ares7.md",
    toolIcon: PencilSquareIcon,
    durationMs: 1400,
  },
  {
    id: 18,
    kind: "tool_result",
    from: HERMES,
    text: "Done",
    toolIcon: DocumentTextIcon,
    durationMs: 600,
  },
  {
    id: 19,
    kind: "message",
    from: HERMES,
    text: "Report ready. 4 sections, fix rec includes WAL setup + auto-failover.",
    durationMs: 2400,
  },
  {
    id: 20,
    kind: "message",
    from: ELENA,
    text: "@Sophie — flagging incident on Ares-7. Report attached. Need greenlight on infra changes.",
    durationMs: 2200,
  },
  {
    id: 21,
    kind: "message",
    from: SOPHIE,
    text: "Approved. WAL + failover must be live before T-24h. Loop in DevOps.",
    durationMs: 2600,
  },

  // ACT 5 — External Comms
  {
    id: 22,
    kind: "message",
    from: ELENA,
    text: "@James — partners may need a status update. Having Hermes draft something.",
    durationMs: 1800,
  },
  {
    id: 23,
    kind: "message",
    from: ELENA,
    text: "@Hermes — draft short external update. Acknowledge delay, no technical detail, reassuring tone.",
    durationMs: 1600,
  },
  {
    id: 24,
    kind: "tool_call",
    from: HERMES,
    text: "Write file: partner_update.md",
    toolIcon: PencilSquareIcon,
    durationMs: 1300,
  },
  {
    id: 25,
    kind: "tool_result",
    from: HERMES,
    text: "Done",
    toolIcon: DocumentTextIcon,
    durationMs: 500,
  },
  {
    id: 26,
    kind: "message",
    from: HERMES,
    text: "Draft ready. 3 sentences, neutral tone.",
    durationMs: 1800,
  },
  {
    id: 27,
    kind: "message",
    from: ELENA,
    text: "@James — draft attached, please review.",
    durationMs: 1600,
  },
  {
    id: 28,
    kind: "message",
    from: JAMES,
    text: "Good. Soften line 2 — too close to admitting fault.",
    durationMs: 2000,
  },
  {
    id: 29,
    kind: "message",
    from: ELENA,
    text: "@Hermes — revise line 2, more neutral, no implicit fault.",
    durationMs: 1400,
  },
  {
    id: 30,
    kind: "tool_call",
    from: HERMES,
    text: "Edit file: partner_update.md",
    toolIcon: PencilSquareIcon,
    durationMs: 1100,
  },
  {
    id: 31,
    kind: "tool_result",
    from: HERMES,
    text: "Updated",
    toolIcon: DocumentTextIcon,
    durationMs: 500,
  },
  {
    id: 32,
    kind: "message",
    from: JAMES,
    text: "Perfect. Sending now.",
    durationMs: 2000,
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActorAvatar({
  actor,
  size = "xs",
}: {
  actor: Actor;
  size?: "xxs" | "xs" | "sm";
}) {
  if (actor.kind === "human") {
    return (
      <Avatar visual={actor.avatar} name={actor.name} size={size} isRounded />
    );
  }
  return (
    <Avatar
      emoji={actor.avatar}
      name={actor.name}
      size={size}
      backgroundColor={actor.color ?? "s-bg-slate-100"}
    />
  );
}

// Render message text with @mentions highlighted
function MessageText({
  text,
  isLocutor,
}: {
  text: string;
  isLocutor: boolean;
}) {
  const parts = text.split(/(@\w+)/g);
  return (
    <p
      className={`s-mt-0.5 s-text-sm s-leading-snug ${
        isLocutor ? "s-text-blue-50" : "s-text-slate-600"
      }`}
    >
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span
            key={i}
            className={`s-font-semibold ${
              isLocutor ? "s-text-white" : "s-text-violet-600"
            }`}
          >
            {part}
          </span>
        ) : (
          part
        )
      )}
    </p>
  );
}

function LogRow({
  entry,
  index,
  prevEntry,
}: {
  entry: LogEntry;
  index: number;
  prevEntry?: LogEntry;
}) {
  const isToolCall = entry.kind === "tool_call";
  const isToolResult = entry.kind === "tool_result";
  const isTool = isToolCall || isToolResult;
  const isLocutor = entry.from.id === ELENA.id;

  // Suppress agent avatar in tool rows when same agent ran the previous row
  const sameAgentAsPrev =
    isTool &&
    prevEntry &&
    (prevEntry.kind === "tool_call" || prevEntry.kind === "tool_result") &&
    prevEntry.from.id === entry.from.id;

  const animStyle: React.CSSProperties = {
    animation:
      index === VISIBLE_COUNT - 1
        ? "rowEnter 0.25s cubic-bezier(0.22,1,0.36,1) both"
        : undefined,
  };

  if (isTool) {
    return (
      <div
        className="s-rounded-xl s-bg-slate-800/80 s-px-3 s-py-2 s-shadow-sm s-backdrop-blur-sm"
        style={animStyle}
      >
        <div className="s-flex s-items-center s-gap-2">
          {/* Avatar slot — hidden when consecutive same-agent actions */}
          <div className="s-flex s-w-5 s-shrink-0 s-justify-center">
            {!sameAgentAsPrev && <ActorAvatar actor={entry.from} size="xs" />}
          </div>
          {entry.toolLogoNode ? (
            <span className="s-shrink-0 s-opacity-60">
              {entry.toolLogoNode}
            </span>
          ) : entry.toolIcon ? (
            <Icon
              visual={entry.toolIcon}
              size="xs"
              className="s-shrink-0 s-text-slate-400"
            />
          ) : null}
          {isToolCall ? (
            <AnimatedText
              variant="white"
              className="s-truncate s-font-mono s-text-xs"
            >
              {entry.text}
            </AnimatedText>
          ) : (
            <span className="s-truncate s-font-mono s-text-xs s-italic s-text-slate-400">
              {entry.text}
            </span>
          )}
        </div>
      </div>
    );
  }

  const isAgentSender = entry.from.kind === "agent";

  if (isLocutor) {
    // Elena: blue bubble, right-aligned, no avatar
    return (
      <div className="s-flex s-justify-end" style={animStyle}>
        <div className="s-max-w-[85%] s-rounded-xl s-bg-blue-500 s-px-3 s-py-2 s-shadow-sm">
          <MessageText text={entry.text} isLocutor />
        </div>
      </div>
    );
  }

  // Interlocutor (human or agent): white bubble, left-aligned, avatar + name inside
  return (
    <div className="s-flex s-max-w-[85%]" style={animStyle}>
      <div className="s-min-w-0 s-rounded-xl s-bg-white/90 s-px-3 s-py-2 s-shadow-sm s-backdrop-blur-sm">
        <div className="s-mb-1 s-flex s-items-center s-gap-1.5">
          <ActorAvatar actor={entry.from} size="xs" />
          <span
            className={`s-text-xs s-font-semibold ${
              isAgentSender ? "s-text-violet-700" : "s-text-slate-700"
            }`}
          >
            {entry.from.name}
          </span>
        </div>
        <MessageText text={entry.text} isLocutor={false} />
      </div>
    </div>
  );
}

// ─── Activity popover (cursor-following) ─────────────────────────────────────

const VISIBLE_COUNT = 3;
const FADE_MS = 200; // popover fade duration

function ActivityPopover({
  pagePos,
  visible,
}: {
  pagePos: { x: number; y: number };
  visible: boolean;
}) {
  const [tick, setTick] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (visible) {
      setTick(0);
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setOpacity(1)));

      // Schedule advances using each entry's own durationMs
      let currentTick = 0;
      let timeoutId: ReturnType<typeof setTimeout>;

      const scheduleNext = () => {
        if (currentTick >= LOG.length - 1) return;
        const delay = LOG[currentTick].durationMs ?? 1200;
        timeoutId = setTimeout(() => {
          currentTick += 1;
          setTick(currentTick);
          scheduleNext();
        }, delay);
      };

      scheduleNext();
      return () => clearTimeout(timeoutId);
    } else {
      setOpacity(0);
      const id = setTimeout(() => setMounted(false), FADE_MS);
      return () => clearTimeout(id);
    }
  }, [visible]);

  const end = tick + 1;
  const start = Math.max(0, end - VISIBLE_COUNT);
  const visibleEntries = LOG.slice(start, end);

  if (!mounted) return null;

  return createPortal(
    <>
      <style>{`
        @keyframes rowEnter {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        className="s-pointer-events-none s-fixed s-z-50"
        style={{
          left: pagePos.x + 16,
          top: pagePos.y,
          transform: "translateY(-50%)",
          opacity,
          transition: `opacity ${FADE_MS}ms ease`,
        }}
      >
        <div className="s-flex s-w-72 s-flex-col s-gap-1.5">
          {visibleEntries.map((entry, i) => (
            <LogRow
              key={entry.id}
              entry={entry}
              index={i}
              prevEntry={visibleEntries[i - 1]}
            />
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── Portrait card ────────────────────────────────────────────────────────────

type Portrait = {
  id: number;
  title: string;
  name: string;
  image: string;
  video?: string;
  hasActivity?: boolean;
};

const PORTRAITS: Portrait[] = [
  {
    id: 1,
    title: "CEO",
    name: "Marc",
    image: "/landing/p1_ceo.png",
    video: "/landing/portrait_video_1.mp4",
  },
  {
    id: 2,
    title: "Lead Mission Scientist",
    name: "Sophie",
    image: "/landing/p2_lead_scientist.png",
  },
  {
    id: 3,
    title: "Sales Director",
    name: "Carlos",
    image: "/landing/p3_sales_director.png",
  },
  {
    id: 4,
    title: "Communications Officer",
    name: "James",
    image: "/landing/p4_comms_officer.png",
  },
  {
    id: 5,
    title: "CTO",
    name: "Elena",
    image: "/landing/p5_cto.png",
    video: "/landing/p5_cto_video.mp4",
    hasActivity: true,
  },
  { id: 6, title: "CFO", name: "Richard", image: "/landing/p6_cfo.png" },
  {
    id: 7,
    title: "Systems Engineer",
    name: "Tom",
    image: "/landing/p7_systems_engineer.png",
  },
  {
    id: 8,
    title: "Data Analyst",
    name: "Yuki",
    image: "/landing/p8_data_analyst.png",
  },
  {
    id: 9,
    title: "Account Executive",
    name: "Claire",
    image: "/landing/p9_account_executive.png",
  },
  {
    id: 10,
    title: "Marketing Manager",
    name: "Zoé",
    image: "/landing/p10_marketing_manager.png",
  },
  {
    id: 11,
    title: "Customer Support",
    name: "Nina",
    image: "/landing/p11_customer_support.png",
  },
  {
    id: 12,
    title: "HR Manager",
    name: "Anne",
    image: "/landing/p12_hr_manager.png",
  },
];

function PortraitCard({ portrait }: { portrait: Portrait }) {
  const [hovered, setHovered] = useState(false);
  // card-relative coords for the plain pill
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  // page-level coords for the portal popover
  const [pagePos, setPagePos] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleMouseEnter = () => {
    setHovered(true);
    if (portrait.video && videoRef.current) videoRef.current.play();
  };

  const handleMouseLeave = () => {
    setHovered(false);
    if (portrait.video && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setPagePos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      ref={cardRef}
      className="s-relative s-overflow-hidden s-rounded-2xl s-cursor-none"
      style={{ aspectRatio: "1 / 1" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {/* Static image */}
      <img
        src={portrait.image}
        alt={portrait.name}
        className="s-absolute s-inset-0 s-h-full s-w-full s-object-cover s-transition-opacity s-duration-300"
        style={{ opacity: portrait.video && hovered ? 0 : 1 }}
      />

      {/* Optional video */}
      {portrait.video && (
        <video
          ref={videoRef}
          src={portrait.video}
          loop
          muted
          playsInline
          className="s-absolute s-inset-0 s-h-full s-w-full s-object-cover s-transition-opacity s-duration-300"
          style={{ opacity: hovered ? 1 : 0 }}
        />
      )}

      {/* Name + title badge */}
      <div className="s-absolute s-bottom-0 s-left-0 s-right-0 s-bg-gradient-to-t s-from-black/70 s-to-transparent s-px-3 s-pb-3 s-pt-8">
        <p className="s-text-xs s-font-semibold s-uppercase s-tracking-wider s-text-white/60">
          {portrait.title}
        </p>
        <p className="s-text-sm s-font-semibold s-text-white">
          {portrait.name}
        </p>
      </div>

      {/* Activity indicator dot */}
      {portrait.hasActivity && (
        <div className="s-absolute s-right-2.5 s-top-2.5 s-h-2 s-w-2 s-rounded-full s-bg-emerald-400 s-ring-2 s-ring-white s-animate-pulse" />
      )}

      {/* Activity popover — only for Elena, rendered in a portal above everything */}
      {portrait.hasActivity && (
        <ActivityPopover pagePos={pagePos} visible={hovered} />
      )}

      {/* Plain "Activity" pill for non-Elena cards */}
      {!portrait.hasActivity && hovered && (
        <div
          className="s-pointer-events-none s-absolute s-z-10 s-whitespace-nowrap s-rounded-full s-bg-white/20 s-px-4 s-py-1.5 s-text-sm s-font-medium s-text-white s-ring-1 s-ring-white/30 s-backdrop-blur-sm"
          style={{
            left: cursorPos.x,
            top: cursorPos.y,
            transform: "translate(12px, -50%)",
          }}
        >
          Activity
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingAIToWork() {
  return (
    <div className="s-flex s-min-h-screen s-flex-col s-items-center s-justify-center s-bg-white s-px-8 s-py-16">
      <div className="s-mb-12 s-max-w-3xl s-text-center">
        <h2 className="s-text-4xl s-font-bold s-tracking-tight s-text-slate-900">
          AI that works for everyone on your team — and brings everyone closer.
        </h2>
      </div>

      <div
        className="s-w-full s-max-w-4xl"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
        }}
      >
        {PORTRAITS.map((portrait) => (
          <PortraitCard key={portrait.id} portrait={portrait} />
        ))}
      </div>
    </div>
  );
}
