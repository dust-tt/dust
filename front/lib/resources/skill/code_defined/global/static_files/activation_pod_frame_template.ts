export const ACTIVATION_POD_FRAME_TEMPLATE = `
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useFile } from "@dust/react-hooks";
import {
  X,
  Zap,
  CalendarCheck,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  Check,
  Layers,
  FileText,
  Sparkles,
  MessageCircle,
  Inbox,
} from "lucide-react";
// SLOT: import the pre-built result Frame by its real fileId (from Stage 4).
// Replace both the fileId and the local name to match the built artifact.
// This is a frame file reference — the imported component renders inside ResultSheet.
import ReleaseReadinessBrief from "fil_REPLACE_WITH_RESULT_FRAME_ID";

/* ================================================================== */
/* EXAMPLE SCENARIO — this is a design REFERENCE, not a fixed form.    */
/* Replace the example data (USER, HEADLINE, WHY_CHOSEN, SKILL_RUNS,   */
/* CANDIDATES, PREVIEW_IMAGE) with the user's real evidence; keep the  */
/* components, palette, and motion. Every number must be real,         */
/* retrieved data — never invented.                                   */
/*                                                                    */
/* HOW_IT_WORKS_HEADER / HOW_IT_WORKS are FIXED copy — do not reword.  */
/* The top CANDIDATE is pre-run: its result previews as an image on    */
/* the card and opens in full via the "Open result" bar.              */
/* ================================================================== */

const USER = { name: "User Name", role: "Engineering" };

/* Per-recommendation copy — rewrite to name what you found and ran for this user. */
const HEADLINE = {
  title: "A skill you already had, run for this release",
  sub: "Deployment Checklist was sitting unused in your workspace. I ran it on v3.0.",
};

/* FIXED COPY — do not reword. This wording is the approved version of the
   "How this works" panel and is identical for every user. */
const HOW_IT_WORKS_HEADER = {
  title: "How this works",
  intro: "A small loop that turns a useful signal into a visible result.",
};

const HOW_IT_WORKS = [
  {
    title: "Dust suggests",
    icon: "sparkles",
    tint: "violet",
    sub: "One idea at a time, drawn from how you actually work. Never a list.",
  },
  {
    title: "You give feedback",
    icon: "chat",
    tint: "violet",
    sub: "The artifact is generated first. Refine it in the chat, but nothing waits on your approval.",
  },
  {
    title: "It runs for you",
    icon: "calendar",
    tint: "sky",
    sub: "On a schedule you pick. You don't do anything.",
  },
  {
    title: "Results land here",
    icon: "inbox",
    tint: "emerald",
    sub: "This page becomes the front page of everything running for you.",
  },
];

/* WHY THIS WAS CHOSEN — real, retrieved evidence only.
   SKILL_RUNS: the user's own skill executions, last 30 days (workspace
   analytics). DOCS: the source docs behind the artifact, with the exact
   number of rules each section contributes. Never invent a number. */
const SKILL_RUNS = {
  window: "Last 30 days · your own runs",
  total: 1164,
  rows: [
    { name: "Activation", runs: 769 },
    { name: "Create Frames", runs: 247 },
    { name: "Dust Support", runs: 78 },
    { name: "Pods, Mentions, Go Deep, Author Skills", runs: 70 },
    { name: "Anything about shipping code", runs: 0 },
  ],
};

const WHY_CHOSEN = {
  intro: "Three things Dust checked before suggesting anything.",
  signals: [
    {
      label: "Your 30 days in Dust",
      value: "1,164 skill runs, 0 on engineering",
      detail: "All spent testing Dust, none on shipping code.",
      visual: "usage",
    },
    {
      label: "A skill you already own",
      value: "Deployment Checklist · 0 runs",
      detail: "Built for you earlier, never executed.",
      visual: "none",
    },
    {
      label: "Both source docs",
      value: "Edited today, Jul 27",
      detail:
        "Engineering Standards and Release Notes v3.0 both changed today, so a rerun is worth it now.",
      visual: "none",
    },
  ],
};

/* The queue. \`does\` is the skill's own description; \`run\` is what this
   execution produced. Keep both to one line. */
const CANDIDATES = [
  {
    skill: "Deployment Checklist",
    origin: "Existing skill",
    status: "Ran just now",
    prebuilt: true,
    does:
      "Rebuilds your release checklist from the Engineering Standards doc: pre-deploy, deploy, rollback, on-call escalation.",
    run: "12 checks, plus a v3.0 announcement from your release notes.",
  },
  {
    skill: "On-Call Escalation Card",
    origin: "Not built yet",
    status: "Ask and I build it",
    prebuilt: false,
    does: "Primary → Secondary → Engineering Manager, for the current weekly rotation.",
    run: "From the On-Call section of the same doc.",
  },
  {
    skill: "PR Review Checklist",
    origin: "Not built yet",
    status: "Ask and I build it",
    prebuilt: false,
    does: "One approval, conventional commits, under 400 lines, tests included.",
    run: "From the Code Review section of the same doc.",
  },
];

/* Kept artifacts shelf — accumulates across sessions (template slot) */
const KEPT: { name: string; when: string }[] = [];

/* ================================================================== */

const C = {
  you: "#6366F1",
  team: "#8B5CF6",
  rec: "#059669",
  note: "#F59E0B",
  ink: "#0F172A",
  sub: "#64748B",
  line: "#CBD5E1",
  bg: "#F8FAFC",
};

const DUST_LOGO = "https://dust.tt/static/landing/logos/dust/Dust_Logo.png";

function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.15) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVisible(true);
      },
      { threshold }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return visible;
}

function FadeIn({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: \`opacity 0.6s ease \${delay}s, transform 0.6s ease \${delay}s\`,
      }}
    >
      {children}
    </div>
  );
}

/* ---- Why this was chosen: real evidence, with the graphs that carry it ---- */

/* Signal 1: the user's own skill runs. The zero row is the whole point,
   so it is drawn as an empty track, not a missing bar. */
function UsageBars() {
  const max = Math.max(...SKILL_RUNS.rows.map((r) => r.runs));
  return (
    <div className="mt-2.5">
      <div className="space-y-1.5">
        {SKILL_RUNS.rows.map((r, i) => {
          const zero = r.runs === 0;
          return (
            <div key={r.name} className="flex items-center gap-2">
              <span
                className="shrink-0 truncate"
                style={{
                  width: 132,
                  fontSize: 10.5,
                  color: zero ? C.ink : C.sub,
                  fontWeight: zero ? 700 : 400,
                }}
                title={r.name}
              >
                {r.name}
              </span>
              <span className="relative min-w-0 flex-1" style={{ height: 8 }}>
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ background: zero ? "transparent" : "#F1F5F9", border: zero ? \`1px dashed \${C.line}\` : "none" }}
                />
                {!zero && (
                  <motion.span
                    className="absolute left-0 top-0 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: \`\${(r.runs / max) * 100}%\` }}
                    transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 + i * 0.07 }}
                    style={{ height: 8, background: C.you, opacity: 1 - i * 0.15 }}
                  />
                )}
              </span>
              <span
                className="shrink-0 text-right"
                style={{
                  width: 34,
                  fontSize: 11,
                  fontWeight: 800,
                  color: zero ? C.rec : C.ink,
                }}
              >
                {r.runs}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2" style={{ fontSize: 10.5, color: C.sub }}>
        {SKILL_RUNS.window} · {SKILL_RUNS.total.toLocaleString()} total
      </p>
    </div>
  );
}

function WhyChosenSection() {
  return (
    <FadeIn delay={0.05}>
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          border: "1px solid #E2E8F0",
          borderTop: \`3px solid \${C.team}\`,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
          padding: "16px 16px 14px",
        }}
      >
        <p style={{ fontWeight: 800, fontSize: 14, color: C.ink }}>Why this was chosen</p>
        <p className="mt-0.5" style={{ fontSize: 12, color: C.sub }}>
          {WHY_CHOSEN.intro}
        </p>

        <div className="mt-3.5">
          {WHY_CHOSEN.signals.map((s, i) => {
            const last = i === WHY_CHOSEN.signals.length - 1;
            return (
              <div key={s.label} className="flex items-stretch gap-3">
                <div className="flex w-7 shrink-0 flex-col items-center">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full"
                    style={{
                      background: \`\${C.team}14\`,
                      color: C.team,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    {i + 1}
                  </span>
                  {!last && <span className="my-1 w-px flex-1" style={{ background: \`\${C.team}33\` }} />}
                </div>
                <div className={last ? "min-w-0 flex-1" : "min-w-0 flex-1 pb-4"}>
                  <p
                    className="uppercase"
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      color: C.team,
                      letterSpacing: "0.08em",
                    }}
                  >
                    {s.label}
                  </p>
                  <p className="mt-0.5" style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>
                    {s.value}
                  </p>
                  <p className="mt-0.5" style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.5 }}>
                    {s.detail}
                  </p>
                  {s.visual === "usage" && <UsageBars />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </FadeIn>
  );
}

function Particles({ side }: { side: "left" | "right" }) {
  const color = side === "left" ? C.you : C.team;
  const fromX = side === "left" ? 25 : 75;
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute z-10 rounded-full"
          style={{ backgroundColor: color, width: 7, height: 7 }}
          initial={{ left: \`\${fromX}%\`, top: "0%", opacity: 0 }}
          animate={{
            left: [\`\${fromX}%\`, "50%"],
            top: ["0%", "88%"],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            delay: i * 0.55 + (side === "right" ? 0.28 : 0),
            ease: "easeInOut",
          }}
        />
      ))}
    </>
  );
}

/* Preview for the pre-built artifact: one image, no copy. SLOT — swap the
   image path for whatever the skill actually produces. */
const PREVIEW_IMAGE = "REPLACE_WITH_PREVIEW_IMAGE_PATH";

function DeckPreview() {
  const file = useFile(PREVIEW_IMAGE);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{ border: "1px solid #E2E8F0", background: "#F8FAFC" }}
      aria-hidden
    >
      {url ? (
        <img
          src={url}
          alt="Deployment checklist preview"
          className="w-full"
          style={{ display: "block", objectFit: "contain" }}
        />
      ) : (
        <div style={{ height: 132 }} />
      )}
    </div>
  );
}

/* Queued candidate placeholder — an alternate recommendation, not built. */
function GhostPreview() {
  return (
    <div
      className="flex items-center justify-center gap-2 rounded-md"
      style={{ border: "1.5px dashed #E2E8F0", padding: "14px 0" }}
      aria-hidden
    >
      <Layers size={14} color={C.line} />
      <span style={{ fontSize: 11.5, color: C.sub }}>Ask in the chat and I'll build it</span>
    </div>
  );
}

/* ================================================================== */
/* Candidate card stack — one decision, swipeable queue               */
/* ================================================================== */

function CandidateStack() {
  const [index, setIndex] = useState(0);
  const [whyOpen, setWhyOpen] = useState(false);
  const next = () => {
    setWhyOpen(false);
    setIndex((v) => Math.min(v + 1, CANDIDATES.length - 1));
  };
  const prev = () => {
    setWhyOpen(false);
    setIndex((v) => Math.max(v - 1, 0));
  };

  const card = CANDIDATES[index];
  const behind = CANDIDATES.slice(index + 1, index + 3);

  return (
    <div>
      <div className="relative" style={{ paddingTop: behind.length * 10 }}>
        {/* Peeking cards behind */}
        {behind.map((b, i) => (
            <div
              key={b.skill}
              className="absolute left-0 right-0"
              style={{
                top: (behind.length - 1 - i) * 10,
                transform: \`scale(\${1 - (i + 1) * 0.035})\`,
                transformOrigin: "top center",
                zIndex: behind.length - i,
                background: "#FFFFFF",
                borderRadius: 18,
                border: "1px solid #E2E8F0",
                height: 40,
                boxShadow: "0 2px 8px rgba(15,23,42,0.05)",
              }}
            />
          ))}

        {/* Top card — recommendation becomes the full result in place */}
        <AnimatePresence initial={false}>
          <motion.div
            key={card.skill}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={(_, info) => {
              if (info.offset.x < -90) next();
              else if (info.offset.x > 90) prev();
            }}
            initial={{ opacity: 0, x: 60, rotate: 3 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            exit={{ opacity: 0, x: -80, rotate: -4 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
            whileDrag={{ rotate: -2, cursor: "grabbing" }}
            className="relative"
            style={{
              zIndex: 10,
              background: "#FFFFFF",
              borderRadius: 18,
              border: \`1px solid \${C.rec}40\`,
              borderTop: \`3px solid \${C.rec}\`,
              boxShadow: \`0 8px 28px \${C.rec}14\`,
              padding: "18px 20px 16px",
              cursor: "grab",
              touchAction: "pan-y",
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p
                className="uppercase"
                style={{
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  color: card.prebuilt ? C.rec : C.sub,
                }}
              >
                {card.origin}
              </p>
              <p style={{ fontSize: 11, color: C.sub }}>{card.status}</p>
            </div>

            <p style={{ fontSize: 19, fontWeight: 800, color: C.ink, marginTop: 6 }}>{card.skill}</p>
            <p style={{ fontSize: 13, color: C.sub, marginTop: 4, lineHeight: 1.5 }}>{card.does}</p>

            <div className="mt-4">{card.prebuilt ? <DeckPreview /> : <GhostPreview />}</div>

            {!card.prebuilt && (
              <p className="mt-3" style={{ fontSize: 11.5, color: C.sub, lineHeight: 1.45 }}>
                {card.run}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <>
        <>
          {/* Queue controls */}
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={prev}
              disabled={index === 0}
              className="flex items-center gap-1 rounded-full px-2.5 py-1"
              style={{
                border: "1px solid #E2E8F0",
                background: "#FFFFFF",
                color: index === 0 ? C.line : C.ink,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: index === 0 ? "default" : "pointer",
              }}
            >
              <ChevronLeft size={12} /> Back
            </button>

            <div className="flex items-center gap-1.5">
              {CANDIDATES.map((c, i) => (
                <span
                  key={c.skill}
                  className="rounded-full"
                  style={{
                    width: i === index ? 16 : 6,
                    height: 6,
                    background: i === index ? C.rec : "#E2E8F0",
                    transition: "all 0.25s ease",
                  }}
                />
              ))}
            </div>

            <button
              onClick={next}
              disabled={index === CANDIDATES.length - 1}
              className="flex items-center gap-1 rounded-full px-2.5 py-1"
              style={{
                border: "1px solid #E2E8F0",
                background: "#FFFFFF",
                color: index === CANDIDATES.length - 1 ? C.line : C.ink,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: index === CANDIDATES.length - 1 ? "default" : "pointer",
              }}
            >
              Next <ChevronRight size={12} />
            </button>
          </div>

          <p className="mt-1.5 text-center" style={{ fontSize: 10.5, color: C.sub }}>
            {index + 1} of {CANDIDATES.length} · swipe or tap to browse
          </p>
        </>
      </>
    </div>
  );
}

/* ================================================================== */
/* The Frame: full diagram, inputs → match → card stack               */
/* ================================================================== */

/* Step tints for the "How this works" loop */
function tintClasses(tint: string) {
  if (tint === "indigo") return { bg: "bg-indigo-50", text: "text-indigo-500" };
  if (tint === "violet") return { bg: "bg-violet-50", text: "text-violet-500" };
  if (tint === "sky") return { bg: "bg-sky-50", text: "text-sky-500" };
  return { bg: "bg-emerald-50", text: "text-emerald-500" };
}

function StepIcon({ name, className }: { name: string; className?: string }) {
  if (name === "sparkles") return <Sparkles className={className} />;
  if (name === "file") return <FileText className={className} />;
  if (name === "chat") return <MessageCircle className={className} />;
  if (name === "inbox") return <Inbox className={className} />;
  return <CalendarCheck className={className} />;
}

/* Vertical timeline: tinted icon per step, hairline connector between them.
   \`compact\` is the pinned-strip scale: same layout, smaller everything. */
function HowItWorksTimeline({ compact = false }: { compact?: boolean }) {
  const dot = compact ? "h-7 w-7" : "h-9 w-9";
  const glyph = compact ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <div className="flex flex-col">
      {HOW_IT_WORKS.map((step, i) => {
        const t = tintClasses(step.tint);
        const last = i === HOW_IT_WORKS.length - 1;
        return (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut", delay: 0.06 * i }}
            className={compact ? "flex gap-2.5" : "flex gap-4"}
          >
            <div className="flex flex-col items-center">
              <div
                className={"flex shrink-0 items-center justify-center rounded-full " + dot + " " + t.bg}
              >
                <StepIcon name={step.icon} className={glyph + " " + t.text} />
              </div>
              {last ? null : <div className="my-1 w-px flex-1" style={{ background: C.line }} />}
            </div>
            <div className={last ? "" : compact ? "pb-2.5" : "pb-4"}>
              <p style={{ fontSize: compact ? 11.5 : 13, fontWeight: 800, color: C.ink }}>
                {step.title}
              </p>
              <p
                className="mt-0.5"
                style={{ fontSize: compact ? 10.5 : 11.5, color: C.sub, lineHeight: 1.5 }}
              >
                {step.sub}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* Fixed heading: same type as every other section title in this frame
   (14/800 ink, or 13 in the pin). Wording must not be reworded. */
function HowItWorksHeading({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="block min-w-0 text-left"
      style={{ fontSize: compact ? 13 : 14, fontWeight: 800, color: C.ink, lineHeight: 1.3 }}
    >
      {HOW_IT_WORKS_HEADER.title}
    </span>
  );
}

function WhatIsThis({ collapsible = true }: { collapsible?: boolean }) {
  const [open, setOpen] = useState(true);
  const show = collapsible ? open : true;
  const compact = !collapsible;
  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: compact ? 12 : 16,
        border: "1px solid #E2E8F0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      {collapsible ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-start justify-between gap-3"
          style={{ padding: "14px 16px 4px", background: "transparent", border: "none", cursor: "pointer" }}
        >
          <HowItWorksHeading />
          {show ? <ChevronUp size={16} color={C.sub} /> : <ChevronDown size={16} color={C.sub} />}
        </button>
      ) : (
        <div style={{ padding: "10px 12px 4px" }}>
          <HowItWorksHeading compact />
        </div>
      )}
      <AnimatePresence initial={false}>
        {show && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: compact ? "0 12px 12px" : "0 16px 16px" }}>
              <p
                className={compact ? "mb-2.5" : "mb-3.5"}
                style={{ fontSize: compact ? 11 : 12, color: C.sub, lineHeight: 1.45 }}
              >
                {HOW_IT_WORKS_HEADER.intro}
              </p>
              <HowItWorksTimeline compact={compact} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FrameBody() {
  return (
    <div>
      {/* Evidence: the three signals, with the graphs behind them */}
      <WhyChosenSection />

      {/* Converging flow */}
      <FadeIn delay={0.25}>
        <div className="relative" style={{ height: 84 }}>
          <svg viewBox="0 0 600 84" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <path
              d="M 150 0 C 150 46, 300 36, 300 78"
              fill="none"
              stroke={C.you}
              strokeOpacity={0.3}
              strokeWidth={1.5}
            />
            <path
              d="M 450 0 C 450 46, 300 36, 300 78"
              fill="none"
              stroke={C.team}
              strokeOpacity={0.3}
              strokeWidth={1.5}
            />
          </svg>
          <Particles side="left" />
          <Particles side="right" />
          <motion.span
            className="absolute flex items-center gap-1.5 rounded-full px-3 py-1.5"
            style={{
              left: "50%",
              top: "54%",
              translateX: "-50%",
              translateY: "-50%",
              background: C.ink,
              color: "#fff",
              fontSize: 11.5,
              fontWeight: 700,
              boxShadow: "0 2px 10px rgba(15,23,42,0.25)",
            }}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <Zap size={12} />
            matched for you
          </motion.span>
        </div>
      </FadeIn>

      {/* Candidate stack */}
      <FadeIn delay={0.3}>
        <CandidateStack />
      </FadeIn>

      {/* Kept shelf — the Frame is a memory, not a moment */}
      <FadeIn delay={0.35}>
        <p
          className="mt-6 uppercase"
          style={{ fontSize: 10, fontWeight: 800, color: C.sub, letterSpacing: "0.12em" }}
        >
          Kept so far
        </p>
        {KEPT.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {KEPT.map((k) => (
              <div
                key={k.name}
                className="flex items-center justify-between rounded-xl px-3 py-2"
                style={{ background: "#FFFFFF", border: "1px solid #E2E8F0" }}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full"
                    style={{ background: \`\${C.rec}14\`, color: C.rec }}
                  >
                    <Check size={11} />
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 650, color: C.ink }}>{k.name}</span>
                </span>
                <span style={{ fontSize: 11, color: C.sub }}>{k.when}</span>
              </div>
            ))}
            <p style={{ fontSize: 10.5, color: C.sub }}>
              Rerun any of these from the chat.
            </p>
          </div>
        ) : (
          <p className="mt-2" style={{ fontSize: 12, color: C.sub }}>
            Nothing yet. Keep this one and it lands here.
          </p>
        )}
      </FadeIn>

      {/* Lifecycle */}
      <FadeIn delay={0.4}>
        <div className="mt-6 flex items-center justify-center gap-2.5">
          {[
            { icon: <Eye size={12} />, label: "Review it" },
            { icon: <Check size={12} />, label: "Keep it" },
            { icon: <CalendarCheck size={12} />, label: "Make it weekly" },
          ].map((s, i) => (
            <span key={s.label} className="flex items-center gap-2.5">
              <span
                className="flex items-center gap-1.5"
                style={{ fontSize: 12, fontWeight: 600, color: C.sub }}
              >
                <span style={{ color: C.you }}>{s.icon}</span>
                {s.label}
              </span>
              {i < 2 && <ChevronRight size={12} color={C.line} />}
            </span>
          ))}
        </div>
        <p className="mt-2 text-center" style={{ fontSize: 11.5, color: C.sub }}>
          Nothing is kept or scheduled without your ok.
        </p>
      </FadeIn>
    </div>
  );
}

/* ================================================================== */
/* Surface detection — condensed banner vs full view                  */
/* ================================================================== */

function useSurface() {
  const isBanner = () => {
    try {
      const id = new URLSearchParams(window.location.search).get("identifier");
      return Boolean(id && id.startsWith("viz-banner-")) && window.innerHeight < 400;
    } catch {
      return false;
    }
  };
  const [banner, setBanner] = useState(isBanner);
  useEffect(() => {
    const onResize = () => setBanner(isBanner());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return banner;
}

/* Full-frame result sheet — opened from a Frame-level trigger, never
   from inside a candidate card. Renders the imported result Frame. */
function ResultSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="h-full overflow-y-auto" style={{ background: C.bg }}>
      <div
        className="sticky top-0 flex items-center justify-between gap-2 px-5 py-3"
        style={{ background: "#FFFFFF", borderBottom: \`1px solid \${C.line}\`, zIndex: 20 }}
      >
        <div className="min-w-0">
          <p style={{ fontSize: 9.5, fontWeight: 800, color: C.rec, letterSpacing: "0.1em" }}>
            YOUR RESULT
          </p>
          <p className="truncate" style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>
            Release Readiness Brief
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5"
          style={{
            background: "#F1F5F9",
            border: \`1px solid \${C.line}\`,
            color: C.ink,
            cursor: "pointer",
            fontSize: 11.5,
            fontWeight: 700,
          }}
        >
          <X size={12} /> Close
        </button>
      </div>
      <ReleaseReadinessBrief />
    </div>
  );
}

function FullView() {
  const [resultOpen, setResultOpen] = useState(false);

  if (resultOpen) {
    return <ResultSheet onClose={() => setResultOpen(false)} />;
  }

  return (
    <div className="relative h-full overflow-y-auto" style={{ background: C.bg }}>
      {/* V6 — sticky bottom bar with the button on the LEFT, so it never
          collides with the Frame's own controls in the bottom-right. */}
      <div
        className="fixed bottom-0 left-0 right-0 flex items-center gap-3 px-4 py-3"
        style={{
          zIndex: 40,
          background: "#FFFFFF",
          borderTop: \`1px solid \${C.line}\`,
          boxShadow: "0 -4px 18px rgba(15,23,42,0.08)",
          paddingRight: 110,
        }}
      >
        <button
          onClick={() => setResultOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full"
          style={{
            background: C.rec,
            color: "#fff",
            border: "none",
            padding: "9px 16px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 800,
            boxShadow: \`0 4px 14px \${C.rec}30\`,
          }}
        >
          Open result <ChevronRight size={13} />
        </button>
        <div className="min-w-0">
          <p className="truncate" style={{ fontSize: 12, fontWeight: 800, color: C.ink }}>
            Release Readiness Brief
          </p>
          <p className="truncate" style={{ fontSize: 10.5, color: C.sub }}>
            12 checks · v3.0 announcement
          </p>
        </div>
      </div>
      <div className="mx-auto px-5 py-7 pb-24" style={{ maxWidth: 660 }}>
        {/* Header */}
        <FadeIn>
          <div className="flex items-center gap-2.5">
            <img src={DUST_LOGO} alt="Dust" style={{ height: 20, objectFit: "contain" }} />
            <span
              className="uppercase"
              style={{ fontSize: 10.5, fontWeight: 800, color: C.sub, letterSpacing: "0.14em" }}
            >
              Built for {USER.name} · {USER.role}
            </span>
          </div>
          <h1 style={{ fontSize: 23, fontWeight: 800, color: C.ink, marginTop: 8, lineHeight: 1.2 }}>
            {HEADLINE.title}
          </h1>
          <p style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>{HEADLINE.sub}</p>
        </FadeIn>

        {/* What is this? */}
        <FadeIn delay={0.08}>
          <div className="mt-4">
            <WhatIsThis />
          </div>
        </FadeIn>

        {/* The Frame body */}
        <div className="mt-5">
          <FrameBody />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Condensed banner view (pinned strip) ----------------
   Exactly the expanded "How this works" panel from the full view: same
   card, same header, same intro, same timeline component — just always
   open, with no chevron. Scrolls only if the pin is unusually short. */

function BannerView() {
  return (
    <div className="h-full overflow-y-auto px-2.5 py-2.5" style={{ background: C.bg }}>
      <WhatIsThis collapsible={false} />
    </div>
  );
}

export default function ActivationPodFrame() {
  const banner = useSurface();
  return banner ? <BannerView /> : <FullView />;
}
`;
