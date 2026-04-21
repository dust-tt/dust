import {
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
    durationMs: 0,
  },
  {
    id: 2,
    kind: "tool_call", // shimmer plays for this duration before result appears
    from: ARIA,
    text: 'Notion search: "Ares-7 pipeline docs"',
    toolLogoNode: <NotionLogo className="s-h-4 s-w-4" />,
    durationMs: 2200,
  },
  {
    id: 3,
    kind: "tool_result",
    from: ARIA,
    text: "Found ingestion architecture doc",
    toolIcon: DocumentTextIcon,
    durationMs: 1400,
  },
  {
    id: 4,
    kind: "tool_call",
    from: ORION,
    text: "DB query: telemetry_records, last 24h",
    toolIcon: ActionDatabaseIcon,
    durationMs: 2600,
  },
  {
    id: 5,
    kind: "tool_result",
    from: ORION,
    text: "3h gap detected (02:14–05:07 UTC)",
    toolIcon: ActionDatabaseIcon,
    durationMs: 1400,
  },
  {
    id: 6,
    kind: "message",
    from: ORION,
    text: "3h of telemetry missing. Zero records ingested between 02:14–05:07 UTC.",
    durationMs: 3800,
  },

  // ACT 2 — Root Cause
  {
    id: 7,
    kind: "message",
    from: ELENA,
    text: "@Orion — check infra logs and error events for that window.",
    durationMs: 3000,
  },
  {
    id: 8,
    kind: "tool_call",
    from: ORION,
    text: "DB query: infra_events, 02:00–06:00 UTC",
    toolIcon: ActionDatabaseIcon,
    durationMs: 2800,
  },
  {
    id: 9,
    kind: "tool_result",
    from: ORION,
    text: "OOM kill on worker-node-4 at 02:13",
    toolIcon: ServerIcon,
    durationMs: 1400,
  },
  {
    id: 10,
    kind: "tool_call",
    from: ARIA,
    text: 'Web search: "OOM kill data recovery no WAL"',
    toolIcon: GlobeAltIcon,
    durationMs: 2400,
  },
  {
    id: 11,
    kind: "tool_result",
    from: ARIA,
    text: "No recovery without write-ahead log",
    toolIcon: MagnifyingGlassIcon,
    durationMs: 1200,
  },
  {
    id: 12,
    kind: "message",
    from: ARIA,
    text: "worker-node-4 crashed (OOM) at 02:13. No failover triggered. Data unrecoverable without WAL.",
    durationMs: 4200,
  },

  // ACT 3 — Human Input
  {
    id: 13,
    kind: "message",
    from: ELENA,
    text: "@Yuki — can you confirm the gap from your dashboard? Does it affect launch metrics?",
    durationMs: 3400,
  },
  {
    id: 14,
    kind: "message",
    from: YUKI,
    text: "Confirmed. Affects 4 KPIs. I can interpolate estimates if needed.",
    durationMs: 3200,
  },
  {
    id: 15,
    kind: "message",
    from: ELENA,
    text: "Yes please, attach to the incident report.",
    durationMs: 2800,
  },

  // ACT 4 — Incident Report
  {
    id: 16,
    kind: "message",
    from: ELENA,
    text: "@Hermes — draft incident report. Timeline, root cause, impact, fix recommendations.",
    durationMs: 2600,
  },
  {
    id: 17,
    kind: "tool_call",
    from: HERMES,
    text: "Write file: incident_ares7.md",
    toolIcon: PencilSquareIcon,
    durationMs: 3000,
  },
  {
    id: 18,
    kind: "tool_result",
    from: HERMES,
    text: "Done",
    toolIcon: DocumentTextIcon,
    durationMs: 1200,
  },
  {
    id: 19,
    kind: "message",
    from: HERMES,
    text: "Report ready. 4 sections, fix rec includes WAL setup + auto-failover.",
    durationMs: 3600,
  },
  {
    id: 20,
    kind: "message",
    from: ELENA,
    text: "@Sophie — flagging incident on Ares-7. Report attached. Need greenlight on infra changes.",
    durationMs: 3400,
  },
  {
    id: 21,
    kind: "message",
    from: SOPHIE,
    text: "Approved. WAL + failover must be live before T-24h. Loop in DevOps.",
    durationMs: 4000,
  },

  // ACT 5 — External Comms
  {
    id: 22,
    kind: "message",
    from: ELENA,
    text: "@James — partners may need a status update. Having Hermes draft something.",
    durationMs: 2800,
  },
  {
    id: 23,
    kind: "message",
    from: ELENA,
    text: "@Hermes — draft short external update. Acknowledge delay, no technical detail, reassuring tone.",
    durationMs: 2600,
  },
  {
    id: 24,
    kind: "tool_call",
    from: HERMES,
    text: "Write file: partner_update.md",
    toolIcon: PencilSquareIcon,
    durationMs: 2800,
  },
  {
    id: 25,
    kind: "tool_result",
    from: HERMES,
    text: "Done",
    toolIcon: DocumentTextIcon,
    durationMs: 1000,
  },
  {
    id: 26,
    kind: "message",
    from: HERMES,
    text: "Draft ready. 3 sentences, neutral tone.",
    durationMs: 2800,
  },
  {
    id: 27,
    kind: "message",
    from: ELENA,
    text: "@James — draft attached, please review.",
    durationMs: 2600,
  },
  {
    id: 28,
    kind: "message",
    from: JAMES,
    text: "Good. Soften line 2 — too close to admitting fault.",
    durationMs: 3200,
  },
  {
    id: 29,
    kind: "message",
    from: ELENA,
    text: "@Hermes — revise line 2, more neutral, no implicit fault.",
    durationMs: 2400,
  },
  {
    id: 30,
    kind: "tool_call",
    from: HERMES,
    text: "Edit file: partner_update.md",
    toolIcon: PencilSquareIcon,
    durationMs: 2200,
  },
  {
    id: 31,
    kind: "tool_result",
    from: HERMES,
    text: "Updated",
    toolIcon: DocumentTextIcon,
    durationMs: 1000,
  },
  {
    id: 32,
    kind: "message",
    from: JAMES,
    text: "Perfect. Sending now.",
    durationMs: 3000,
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
        isLocutor ? "s-text-blue-50" : "s-text-slate-900"
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
  isNewest,
  prevEntry,
}: {
  entry: LogEntry;
  isNewest: boolean;
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

  // Only animate the newest entry. Use fill-mode=none (default) so transform
  // is released after the animation ends — otherwise transform:scale(1) on a
  // bubble ancestor creates a stacking context and kills backdrop-filter.
  const animStyle: React.CSSProperties = {
    animation: isNewest
      ? "itemEnter 0.3s cubic-bezier(0.22,1,0.36,1)"
      : undefined,
  };

  // Tool icon: platform logos and action icons unified to 16×16
  const toolIconNode = entry.toolLogoNode ? (
    <span className="s-flex s-h-4 s-w-4 s-shrink-0 s-items-center s-justify-center s-opacity-70">
      {entry.toolLogoNode}
    </span>
  ) : entry.toolIcon ? (
    <Icon
      visual={entry.toolIcon}
      size="xs"
      className="s-shrink-0 s-text-slate-400"
    />
  ) : null;

  if (isTool) {
    return (
      <div className="s-flex" style={animStyle}>
        <div className="s-inline-flex s-items-center s-gap-2 s-rounded-2xl s-border s-border-white/10 s-bg-slate-800/80 s-px-2.5 s-py-2.5 s-shadow-md s-backdrop-blur-md">
          {/* Avatar — always shown, same agent consecutive rows get the avatar repeated */}
          <ActorAvatar actor={entry.from} size="xxs" />
          {toolIconNode}
          {isToolCall ? (
            <span className="s-font-mono s-text-xs s-text-shimmer">
              {entry.text}
            </span>
          ) : (
            <span className="s-font-mono s-text-xs s-italic s-text-slate-300">
              {entry.text}
            </span>
          )}
        </div>
      </div>
    );
  }

  const isAgentSender = entry.from.kind === "agent";

  if (isLocutor) {
    // Elena: blue bubble, left-aligned (same layout as interlocutor)
    return (
      <div className="s-flex s-max-w-[85%]" style={animStyle}>
        <div className="s-min-w-0 s-rounded-2xl s-border s-border-blue-300/30 s-bg-blue-500/70 s-px-3 s-py-3 s-shadow-md s-backdrop-blur-md">
          <div className="s-mb-1 s-flex s-items-center s-gap-1.5">
            <ActorAvatar actor={entry.from} size="sm" />
            <span className="s-text-sm s-font-semibold s-text-blue-100">
              {entry.from.name}
            </span>
          </div>
          <MessageText text={entry.text} isLocutor />
        </div>
      </div>
    );
  }

  // Interlocutor (human or agent): white bubble, left-aligned, avatar + name inside
  return (
    <div className="s-flex s-max-w-[85%]" style={animStyle}>
      <div className="s-min-w-0 s-rounded-2xl s-border s-border-slate-200/60 s-bg-white/80 s-px-3 s-py-3 s-shadow-md s-backdrop-blur-md">
        <div className="s-mb-1 s-flex s-items-center s-gap-1.5">
          <ActorAvatar actor={entry.from} size="sm" />
          <span
            className={`s-text-sm s-font-semibold ${
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

const POPOVER_HEIGHT = 380;

function ActivityPopover({
  pagePos,
  visible,
}: {
  pagePos: { x: number; y: number };
  visible: boolean;
}) {
  const [tick, setTick] = useState(0);
  const [mounted, setMounted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Smooth-scroll to bottom sentinel on each new entry
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [tick]);

  useEffect(() => {
    if (visible) {
      setTick(0);
      setMounted(true);

      let currentTick = 0;
      let timeoutId: ReturnType<typeof setTimeout>;

      const scheduleNext = () => {
        if (currentTick >= LOG.length - 1) return;
        const delay = LOG[currentTick].durationMs ?? 1800;
        timeoutId = setTimeout(() => {
          currentTick += 1;
          setTick(currentTick);
          scheduleNext();
        }, delay);
      };

      scheduleNext();
      return () => clearTimeout(timeoutId);
    } else {
      const id = setTimeout(() => setMounted(false), 150);
      return () => clearTimeout(id);
    }
  }, [visible]);

  const visibleEntries = LOG.slice(0, tick + 1);

  if (!mounted) return null;

  return createPortal(
    <>
      <style>{`
        @keyframes itemEnter {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes shimmerSlide {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .s-text-shimmer {
          color: transparent;
          background: linear-gradient(90deg, #cbd5e1 30%, #ffffff 50%, #cbd5e1 70%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          animation: shimmerSlide 2s linear infinite;
        }
        /* Hide scrollbar while keeping scroll behaviour */
        .activity-scroll::-webkit-scrollbar { display: none; }
        .activity-scroll {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      {/* Wrapper: NO transform/opacity/filter — any of those create a stacking
          context that clips backdrop-filter on child bubbles.
          Offset is baked into top/left directly. */}
      <div
        className="s-pointer-events-none s-fixed s-z-50"
        style={{
          left: pagePos.x + 16,
          top: pagePos.y - 12 - POPOVER_HEIGHT,
        }}
      >
        <div className="s-w-96">
          {/* overflow: scroll (not hidden) so scrollIntoView works */}
          <div
            className="activity-scroll"
            style={{
              height: POPOVER_HEIGHT,
              overflowY: "scroll",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
            }}
          >
            <div className="s-flex s-flex-col s-gap-1.5 s-px-0.5 s-py-0.5">
              {visibleEntries.map((entry, i) => (
                <LogRow
                  key={entry.id}
                  entry={entry}
                  isNewest={i === visibleEntries.length - 1}
                  prevEntry={visibleEntries[i - 1]}
                />
              ))}
              {/* Sentinel — smooth scroll target */}
              <div ref={bottomRef} style={{ height: 1 }} />
            </div>
          </div>
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

      {/* Activity popover — only for Elena, rendered in a portal above everything */}
      {portrait.hasActivity && (
        <ActivityPopover pagePos={pagePos} visible={hovered} />
      )}

      {/* Cursor: green dot + radar pulse rings */}
      {hovered && (
        <div
          className="s-pointer-events-none s-absolute s-z-10"
          style={{
            left: cursorPos.x,
            top: cursorPos.y,
            transform: "translate(-50%, -50%)",
          }}
        >
          {/* Radar rings */}
          <div
            className="cursor-radar-ring"
            style={{ animationDelay: "0ms" }}
          />
          <div
            className="cursor-radar-ring"
            style={{ animationDelay: "1067ms" }}
          />
          <div
            className="cursor-radar-ring"
            style={{ animationDelay: "2134ms" }}
          />
          {/* Center dot */}
          <div
            className="s-absolute s-left-1/2 s-top-1/2 s-h-2.5 s-w-2.5 s-rounded-full s-bg-emerald-500 s-ring-2 s-ring-white"
            style={{ transform: "translate(-50%, -50%)" }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingAIToWork() {
  return (
    <div className="s-flex s-min-h-screen s-flex-col s-items-center s-justify-center s-bg-white s-px-8 s-py-16">
      <style>{`
        @keyframes radarPulse {
          0%   { transform: translate(-50%, -50%) scale(0.3); opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
        }
        .cursor-radar-ring {
          position: absolute;
          left: 50%; top: 50%;
          width: 28px; height: 28px;
          border-radius: 9999px;
          background: #10b981;
          animation: radarPulse 3.2s ease-out infinite;
        }
      `}</style>
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
