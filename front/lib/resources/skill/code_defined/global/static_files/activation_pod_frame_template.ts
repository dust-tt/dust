export const ACTIVATION_POD_FRAME_TEMPLATE = `
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Inbox,
  MessageCircle,
  Sparkles,
} from "lucide-react";

/* ============================================================
   ACTIVATION POD FRAME — v9 (progressive)
   ============================================================
   One centered column that starts as an explanation and becomes
   a record. It never grows on a schedule — only on events. Each
   event trades one unit of explanation for one unit of evidence,
   and only the newest thing on the page is ever fully expanded.

   LEVEL is set by the agent from pod state each interaction:
     "day1"  — pod intro + how-it-works timeline. Nothing else
               exists, so nothing else renders.
     "grown" — greeting + the latest result (expanded) + any
               collapsed Running/Earlier rows + exactly one Next
               idea + how-it-works decayed to a collapsed row.

   Rules that keep it from regressing into a dashboard:
     - One new element per event, never per session.
     - Only the newest thing is expanded; everything else is a
       one-line collapsed row with a count.
     - Education decays: timeline -> collapsed row -> gone.
     - Exactly one recommendation visible, ever.
     - No placeholder sections. A section is born only when it
       has real content.

   Keep placeholder names anonymized until you write the real
   user's data.
   ============================================================ */

/* ---------------- TEMPLATE DATA ---------------- */

const USER = { name: "User", role: "Marketing", company: "Acme" };

// Maturity level. Start at "day1"; move to "grown" once the first result lands.
const LEVEL = "day1";

// Day 1 only: what the pod is, in one short paragraph.
const POD_INTRO =
  "Your conversations, files, and anything you approve to run on its own all live here — so nothing you set up is ever lost or hidden. This page starts empty on purpose. It fills up only with things you say yes to, one at a time.";

// The loop. Full sub on Day 1; shortSub in the decayed collapsed version.
const HOW_IT_WORKS = [
  { title: "Dust suggests", icon: "sparkles", tint: "indigo", sub: "One idea at a time, drawn from how you actually work. Never a list.", shortSub: "one idea at a time" },
  { title: "You say yes", icon: "chat", tint: "violet", sub: "In the chat, in your own words. Nothing runs without your ok.", shortSub: "in the chat, in your own words" },
  { title: "It runs for you", icon: "calendar", tint: "sky", sub: "On a schedule you pick. You don't do anything.", shortSub: "on a schedule you pick" },
  { title: "Results land here", icon: "inbox", tint: "emerald", sub: "This page becomes the front page of everything running for you.", shortSub: "one card per finding" },
];

// Grown only: the newest result — the hero. This is the user's work, not ours.
const LATEST = {
  label: "Inbox closeout",
  when: "Ran once, just now",
  findings: [
    "4 replies drafted and waiting for your review",
    "2 threads can safely wait until tomorrow",
    "1 needs you today: the partner contract thread",
  ],
  // The habit nudge — how the schedule step is seeded without a second card.
  nudge: "Like this every evening at 5pm? Say so in the chat and it becomes automatic.",
};

// Grown only: exactly one next idea. Never a list, never a rail.
const NEXT_IDEA = {
  title: "A morning briefing before your first meeting",
  body:
    "Your calendar fills up by 9am. I can pull what matters from overnight email and Slack into three lines, ready when you sit down.",
  cta: 'Say "run it" in the chat',
};

// Collapsed rows — born only when they have real content. Empty => not rendered.
const RUNNING: { name: string; cadence: string; lastRun: string }[] = [];
const EARLIER: { title: string; when: string }[] = [];

/* ---------------- END TEMPLATE DATA ---------------- */

function tintClasses(tint: string) {
  if (tint === "indigo") {
    return { bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-500" };
  }
  if (tint === "violet") {
    return { bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-500" };
  }
  if (tint === "sky") {
    return { bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-500" };
  }
  return { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-500" };
}

function StepIcon({ name, className }: { name: string; className?: string }) {
  if (name === "sparkles") {
    return <Sparkles className={className} />;
  }
  if (name === "chat") {
    return <MessageCircle className={className} />;
  }
  if (name === "calendar") {
    return <CalendarCheck className={className} />;
  }
  return <Inbox className={className} />;
}

// Everything enters once, top to bottom — the page composes itself in reading
// order. useEffect always fires, so content is never left permanently hidden.
function Reveal({ i = 0, children }: { i?: number; children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 80 + i * 120);
    return () => clearTimeout(t);
  }, [i]);
  return (
    <div
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(8px)",
        transition: "opacity 0.45s ease-out, transform 0.45s ease-out",
      }}
    >
      {children}
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500">
      {children}
    </p>
  );
}

/* ---------------- Day 1 ---------------- */

function HowItWorksTimeline() {
  return (
    <div className="flex flex-col">
      {HOW_IT_WORKS.map((step, i) => {
        const t = tintClasses(step.tint);
        const last = i === HOW_IT_WORKS.length - 1;
        return (
          <Reveal key={step.title} i={i + 2}>
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-full " + t.bg}>
                  <StepIcon name={step.icon} className={"h-4 w-4 " + t.text} />
                </div>
                {last ? null : <div className="my-1 w-px flex-1 bg-border" />}
              </div>
              <div className={last ? "" : "pb-7"}>
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{step.sub}</p>
              </div>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

function DayOneView() {
  return (
    <div className="flex flex-col gap-8">
      <Reveal i={0}>
        <div className="flex flex-col items-center gap-3 text-center">
          <Kicker>Your pod</Kicker>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            One place where Dust works for you, {USER.name}.
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {POD_INTRO}
          </p>
        </div>
      </Reveal>

      <HowItWorksTimeline />
    </div>
  );
}

/* ---------------- Grown ---------------- */

function LatestCard() {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-card p-5 dark:border-emerald-900/50">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 shrink-0 text-emerald-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            {LATEST.label}
          </span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{LATEST.when}</span>
      </div>
      <div className="mt-4 space-y-2.5">
        {LATEST.findings.map((f, i) => (
          <Reveal key={i} i={i + 1}>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <p className="text-sm text-foreground">{f}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">{LATEST.nudge}</p>
      </div>
    </div>
  );
}

function NextIdeaCard() {
  return (
    <div className="rounded-2xl border border-indigo-100 bg-card p-5 dark:border-indigo-900/50">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
        <Kicker>Next idea</Kicker>
      </div>
      <h2 className="mt-1.5 text-lg font-semibold text-foreground">{NEXT_IDEA.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{NEXT_IDEA.body}</p>
      <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white">
        <MessageCircle className="h-4 w-4" /> {NEXT_IDEA.cta}
      </div>
    </div>
  );
}

function CollapsibleRow({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {label}
          {count > 0 ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {count}
            </span>
          ) : null}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}

function HowItWorksCollapsed() {
  return (
    <CollapsibleRow label="How this page works" count={0}>
      <div className="space-y-3">
        {HOW_IT_WORKS.map((step) => {
          const t = tintClasses(step.tint);
          return (
            <div key={step.title} className="flex items-center gap-3">
              <div className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-full " + t.bg}>
                <StepIcon name={step.icon} className={"h-4 w-4 " + t.text} />
              </div>
              <p className="text-sm text-foreground">
                <span className="font-medium">{step.title}</span>{" "}
                <span className="text-muted-foreground">{step.shortSub}</span>
              </p>
            </div>
          );
        })}
      </div>
    </CollapsibleRow>
  );
}

function GrownView() {
  return (
    <div className="flex flex-col gap-5">
      <Reveal i={0}>
        <div className="flex flex-col items-center gap-2 text-center">
          <Kicker>Your pod</Kicker>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Your first result is in, {USER.name}.
          </h1>
          <p className="text-sm text-muted-foreground">
            This page fills up only with things you say yes to.
          </p>
        </div>
      </Reveal>

      <Reveal i={1}>
        <LatestCard />
      </Reveal>

      {RUNNING.length > 0 ? (
        <Reveal i={2}>
          <CollapsibleRow label="Running for you" count={RUNNING.length}>
            <div className="space-y-2">
              {RUNNING.map((r) => (
                <div key={r.name} className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{r.name}</span>
                  <span className="text-xs text-muted-foreground">{r.cadence} · {r.lastRun}</span>
                </div>
              ))}
            </div>
          </CollapsibleRow>
        </Reveal>
      ) : null}

      {EARLIER.length > 0 ? (
        <Reveal i={3}>
          <CollapsibleRow label="Earlier" count={EARLIER.length}>
            <div className="space-y-2">
              {EARLIER.map((e, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground">{e.title}</span>
                  <span className="text-xs text-muted-foreground">{e.when}</span>
                </div>
              ))}
            </div>
          </CollapsibleRow>
        </Reveal>
      ) : null}

      <Reveal i={4}>
        <NextIdeaCard />
      </Reveal>

      <Reveal i={5}>
        <HowItWorksCollapsed />
      </Reveal>
    </div>
  );
}

/* ---------------- Surface detection ---------------- */

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

/* ---------------- Full view (single centered column) ---------------- */

function FullView() {
  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-xl px-6 py-10">
        {LEVEL === "day1" ? <DayOneView /> : <GrownView />}
      </div>
    </div>
  );
}

/* ---------------- Condensed banner view (pinned, ~280px) ---------------- */

function BannerDay1() {
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden bg-background px-4 py-3 text-foreground">
      <div>
        <Kicker>Your pod</Kicker>
        <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
          One place where Dust works for you, {USER.name}.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {HOW_IT_WORKS.map((step) => {
          const t = tintClasses(step.tint);
          return (
            <div key={step.title} className="flex items-center gap-2.5">
              <div className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-full " + t.bg}>
                <StepIcon name={step.icon} className={"h-3.5 w-3.5 " + t.text} />
              </div>
              <p className="text-xs text-foreground">
                <span className="font-medium">{step.title}</span>
                {" "}
                <span className="text-muted-foreground">{step.shortSub}</span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BannerGrown() {
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden bg-background px-4 py-3 text-foreground">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Inbox className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            {LATEST.label}
          </span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{LATEST.when}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {LATEST.findings.map((f, i) => (
          <div key={i} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <p className="text-xs leading-snug text-foreground line-clamp-2">{f}</p>
          </div>
        ))}
      </div>
      {NEXT_IDEA.title ? (
        <div className="mt-auto rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 dark:border-indigo-900/50 dark:bg-indigo-950/30">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 shrink-0 text-indigo-500" />
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Next idea</p>
          </div>
          <p className="mt-0.5 text-xs leading-snug text-foreground line-clamp-2">{NEXT_IDEA.title}</p>
        </div>
      ) : null}
    </div>
  );
}

function BannerView() {
  return LEVEL === "day1" ? <BannerDay1 /> : <BannerGrown />;
}

export default function ActivationPodFrame() {
  const banner = useSurface();
  return banner ? <BannerView /> : <FullView />;
}
`;
