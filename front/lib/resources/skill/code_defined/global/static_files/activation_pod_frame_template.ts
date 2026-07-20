export const ACTIVATION_POD_FRAME_TEMPLATE = `
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  ListTodo,
  MessageCircleQuestion,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
  RotateCcw,
  CalendarDays,
} from "lucide-react";

/* ============================================================
   ACTIVATION POD FRAME — v8
   ============================================================
   v8: UX frozen at the moment AFTER a recommendation is
   accepted. The accepted item appears in three places: a NEW
   row in the setup schedule, the newest Past entry in Your
   work, and a "last decision" line above the promoted Current
   recommendation.
   Data: get_personal_usage (30d), get_workspace_activity,
   list_recommendations, pod state file.
   ============================================================ */

/* ---------------- TEMPLATE DATA ---------------- */

const USER = { name: "Alex", role: "Marketing", company: "Acme" };

const CONVERSATION_URL = "https://app.dust.tt/w/[workspace-id]/assistant/[conversation-id]";

const DEFAULT_TAB = 2;

// Your work feed: a running list — each notable finding is one item.
type FeedItem = {
  when: string;
  source: string;
  takeaway: string;
  detail?: string;
  isNew?: boolean;
  flag?: string;
  kind?: "decision" | "quiet";
};

const FEED: FeedItem[] = [
  { when: "Today 7:55am", source: "Morning briefing", takeaway: "3 urgent items, 2 meetings. Partner contract reply is the top of the stack." },
  { when: "Today 7:41am", source: "Discovery sweep", takeaway: "4 new signals into the task ledger. One worth a look: pricing thread in #sales." },
  { when: "Mon 8:02am", source: "Weekly pipeline review", isNew: true, flag: "watch", takeaway: "Apex usage flat 3 weeks — worth a look. BetaCo and Gamma healthy.", detail: "full account page in pod files · next run Mon Feb 3" },
  { when: "Mon 9:10am", source: "PR & review digest", takeaway: "2 reviews owed, 1 stale thread." },
  { when: "Sun", source: "Recommendations", kind: "decision", takeaway: 'You accepted "Weekly pipeline review" — scheduled Mondays, reports here.' },
];

const POD_INTRO = {
  lead: "This is your pod — a home base where Dust works for you over time.",
  body: "Conversations, files, and the automations you approve all live here, so nothing you set up is ever lost or hidden. This page is its front page.",
};

const LOOP = [
  { title: "Dust suggests", sub: "one idea at a time, in Recommendations" },
  { title: "You say yes", sub: "in the chat, in your own words" },
  { title: "It runs for you", sub: "on a schedule — you don't do anything" },
  { title: "Results land here", sub: "in Your work, one line per finding" },
];

// Workspace-wide usage, last 30 days (get_workspace_activity).
const WORKSPACE_TOOLS = [
  { name: "Create Frames", type: "skill", desc: "interactive pages and dashboards — 14,846 runs in 30 days, the most-used skill at Acme" },
  { name: "Ask data questions", type: "skill", desc: "answers metric questions straight from the warehouse — 6,160 runs" },
  { name: "[Sales] Team Context", type: "skill", desc: "canonical sales roster and routing — 2,071 runs" },
  { name: "Branded Slides", type: "skill", desc: "branded slide decks for presentations — 1,293 runs" },
  { name: "ActionItemsExtractor", type: "agent", desc: "pulls action items out of transcripts and threads — 610 messages" },
];

const AVAILABLE_TOOLS = [
  { name: "[Sales] High-Level Account View", type: "skill", desc: "CRM deal stage, data warehouse usage, and adoption health in one account page — 366 runs across your workspace, none by you" },
  { name: "[Sales] ROI — Customer Time Savings", type: "skill", desc: "quantifies the hours a customer saves — 311 runs across your workspace" },
  { name: "[Team Lead] Weekly Presentation", type: "skill", desc: "drafts the weekly team deck from your initiative channel — 234 runs across your workspace" },
  { name: "[Marketing] Campaign Recap", type: "skill", desc: "turns #releases into a customer-ready digest" },
  { name: "Weekly Digest to Slack", type: "skill", desc: "themed summary of the week's highlights, customer-impacting first" },
];


const ACTIVE_REC = {
  title: "Show customers the value they get",
  oneLiner: "Turn a customer's real usage into a one-page time-savings summary — ready before your next activation call.",
  rec: {
    name: "[Sales] ROI — Customer Time Savings",
    type: "skill",
    desc: "give it one customer name; it does the rest",
  },
  status: "Ready when you are",
  source: "Already set up in your workspace — 311 runs by your colleagues",
  whyChips: ["takes one customer name", "built from real usage data"],
  flow: ["name a customer", "get the one-pager", "keep it or dismiss it"],
  learn: [
    { term: "What's a skill?", def: "A ready-made capability your workspace already has. Nothing to install or configure — you just use it." },
    { term: "How do I accept?", def: 'Reply in the conversation next to this panel. It\'s a chat — say "yes, run it for Acme" in your own words.' },
    { term: "What happens after?", def: "It runs once so you can judge the result. If you like it, it can run on a schedule — and report in Your work." },
  ],
};

const UPCOMING = [
  { name: "[Marketing] Campaign Recap", type: "skill", desc: "a customer-ready digest of #releases, generated before customer conversations", evidence: "fits your pre-call preparation pattern" },
  { name: "Weekly Wins Digest", type: "skill", desc: "drafts your weekly #updates post from the week's actual activity", evidence: "replaces a weekly manual write-up" },
];


const NEXT_STEPS = [
  { step: "Weekly pipeline review is live", desc: "accepted Jan 15 — first scheduled run landed Mon Jan 22; see the Your work tab", state: "done" },
  { step: "Decide on the current recommendation", desc: "name a customer in the conversation; the time-savings page is generated once", state: "now" },
  { step: "Keep it", desc: "saved as a one-click run — no rebuild next time", state: "then" },
  { step: "Schedule it", desc: "runs before activation calls; lands in this pod", state: "then" },
];

const SCHEDULED = [
  { name: "Weekly pipeline review", desc: "CRM deal stage + data warehouse usage for your accounts", days: [0], out: "this pod", isNew: true, lastRun: "ran Mon 8:02am" },
  { name: "Morning briefing", desc: "Slack, Gmail, and Calendar reviewed; the day's plan in the pinned panel", days: [0, 1, 2, 3, 4], out: "pinned panel", isNew: false, lastRun: "ran today 7:55am" },
  { name: "Discovery sweep", desc: "new signals across sources, triaged into the task ledger", days: [0, 1, 2, 3, 4], out: "pod tasks", isNew: false, lastRun: "ran today" },
  { name: "Weekly goals draft", desc: "your #goals post, checked against company priorities", days: [1], out: "Slack draft", isNew: false, lastRun: "ran Tue" },
  { name: "PR & review digest", desc: "open PRs, reviews owed, stale threads", days: [0], out: "this pod", isNew: false, lastRun: "" },
  { name: "Campaign performance digest", desc: "feedback clustered by theme, ranked by account signal", days: [0], out: "this pod", isNew: false, lastRun: "" },
];

const WATCHERS = [
  { name: "Sentinel", desc: "urgent signals from Slack and Gmail are sent immediately; everything else waits for the briefing", out: "Slack DM" },
];


const WEEK_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/* ---------------- END TEMPLATE DATA ---------------- */

const TAB_TITLES = ["Overview", "Your work", "Your setup", "Recommendations"];

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

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}
      {children}
    </p>
  );
}

function TypeTag({ type }: { type: string }) {
  return (
    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {type}
    </span>
  );
}

function CuratedRow({ name, type, desc }: { name: string; type: string; desc: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2">
      <TypeTag type={type} />
      <p className="min-w-0 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{name}</span> — {desc}
      </p>
    </div>
  );
}

/* ---------------- Tab 1: Overview ---------------- */

function OverviewTab() {
  return (
    <div className="space-y-6">

      <div>
        <SectionLabel icon={<Sparkles className="h-3.5 w-3.5 text-blue-500" />}>
          How this works
        </SectionLabel>
        <p className="mt-2 text-sm text-foreground">
          <span className="font-medium">{POD_INTRO.lead}</span>{" "}
          <span className="text-muted-foreground">{POD_INTRO.body}</span>
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          {LOOP.map((step, i) => (
            <div key={step.title} className="flex min-w-0 flex-1 items-center gap-2">
              <div className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <p className="mt-1.5 text-sm font-medium text-foreground">{step.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{step.sub}</p>
              </div>
              {i < LOOP.length - 1 && (
                <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 text-stone-400 sm:block" />
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="h-px flex-1 bg-border" />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RotateCcw className="h-3 w-3" />
            what it finds shapes the next suggestion
          </p>
          <span className="h-px flex-1 bg-border" />
        </div>
      </div>

      <div>
        <SectionLabel icon={<Users className="h-3.5 w-3.5 text-blue-500" />}>
          Most used across your workspace
        </SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          The busiest agents and skills at {USER.company}, last 30 days.
        </p>
        <div className="mt-2 space-y-2">
          {WORKSPACE_TOOLS.map((t) => (
            <CuratedRow key={t.name} {...t} />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel icon={<Zap className="h-3.5 w-3.5 text-blue-500" />}>
          Relevant to people like you
        </SectionLabel>
        <p className="mt-1 text-xs text-muted-foreground">
          Curated skills and agents used by similar people in your workspace. Recommendations are drawn from this list.
        </p>
        <div className="mt-2 space-y-2">
          {AVAILABLE_TOOLS.map((t) => (
            <CuratedRow key={t.name} {...t} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tab: Your work ---------------- */

function YourWorkTab() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Your work</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What your automations found, newest first.
        </p>
      </div>

      <div className="space-y-4">
        {FEED.map((item, idx) => (
          <div key={idx} className="flex gap-2.5">
            {item.kind === "decision" ? (
              <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            ) : (
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
            )}
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {item.when} · <span className="font-medium text-foreground">{item.source}</span>
                {item.isNew && (
                  <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    new — from your Jan 15 recommendation
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-sm text-foreground">
                {item.takeaway}
                {item.flag && (
                  <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    {item.flag}
                  </span>
                )}
              </p>
              {item.detail && <p className="mt-0.5 text-xs text-muted-foreground/70">▸ {item.detail}</p>}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground/70">
        Routine runs with nothing to report aren't shown. Full outputs live in this pod's files;
        urgent signals go to Slack.
      </p>
    </div>
  );
}

/* ---------------- Tab 2: Your setup ---------------- */

function YourSetupTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Everything running in this pod
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {SCHEDULED.length + WATCHERS.length} automations live. This page updates
          automatically whenever something is added, changed, or removed.
        </p>
      </div>

      <div>
        <SectionLabel icon={<PlayCircle className="h-3.5 w-3.5 text-emerald-500" />}>
          On a schedule
        </SectionLabel>
        <div className="mt-2 overflow-hidden rounded-xl border border-border">
          <div className="flex items-center border-b border-border bg-muted/50 px-3 py-1.5">
            <span className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Automation
            </span>
            {WEEK_DAYS.map((d) => (
              <span key={d} className="w-8 text-center text-xs font-medium text-muted-foreground">
                {d}
              </span>
            ))}
          </div>
          {SCHEDULED.map((s) => (
            <div key={s.name} className="flex items-center border-b border-border px-3 py-2 last:border-b-0">
              <div className="min-w-0 flex-1 pr-2">
                <p className="truncate text-sm font-medium text-foreground">
                  {s.name}
                  {s.isNew && (
                    <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      new
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.desc} <span className="text-muted-foreground/70">→ {s.out}</span>
                </p>
                {s.lastRun && (
                  <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> {s.lastRun}
                  </p>
                )}
              </div>
              {WEEK_DAYS.map((_, i) => (
                <span key={i} className="flex w-8 justify-center">
                  <span
                    className={
                      "h-2 w-2 rounded-full " + (s.days.includes(i) ? "bg-emerald-500" : "bg-muted")
                    }
                  />
                </span>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Weekly pipeline review was added Jan 15 from a recommendation. Its first scheduled run
          landed Mon Jan 22, 8:02am — the result is on the Your work tab.
        </p>
      </div>

      <div>
        <SectionLabel icon={<Eye className="h-3.5 w-3.5 text-blue-500" />}>
          Triggered by events
        </SectionLabel>
        <div className="mt-2 space-y-2">
          {WATCHERS.map((w) => (
            <div key={w.name} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2">
              <p className="min-w-0 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{w.name}</span> — {w.desc}
              </p>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground/70">→ {w.out}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tab 3: Recommendations (left rail + detail) ---------------- */

const RAIL = [
  { id: "current", label: "Current", icon: <Clock className="h-3.5 w-3.5" />, count: 1 },
  { id: "upcoming", label: "Upcoming", icon: <ListTodo className="h-3.5 w-3.5" />, count: UPCOMING.length },
];

function CurrentPane() {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">{ACTIVE_REC.title}</h2>
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            {ACTIVE_REC.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{ACTIVE_REC.oneLiner}</p>
      </div>

      <div className="rounded-xl border border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <TypeTag type={ACTIVE_REC.rec.type} />
          <p className="min-w-0 truncate text-sm font-semibold text-foreground">{ACTIVE_REC.rec.name}</p>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{ACTIVE_REC.rec.desc}</p>
        <p className="mt-1 text-xs text-muted-foreground/70">{ACTIVE_REC.source}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ACTIVE_REC.whyChips.map((c) => (
            <span
              key={c}
              className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel icon={<PlayCircle className="h-3.5 w-3.5 text-blue-500" />}>
          What happens if you accept
        </SectionLabel>
        <div className="mt-2 flex items-center gap-2">
          {ACTIVE_REC.flow.map((step, i) => (
            <div key={step} className="flex min-w-0 flex-1 items-center gap-2">
              <div className="min-w-0 flex-1 rounded-lg bg-muted px-3 py-2 text-center">
                <p className="truncate text-xs font-medium text-foreground">{step}</p>
              </div>
              {i < ACTIVE_REC.flow.length - 1 && (
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-stone-400" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel icon={<Sparkles className="h-3.5 w-3.5 text-blue-500" />}>
          New to Dust?
        </SectionLabel>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {ACTIVE_REC.learn.map((l) => (
            <div key={l.term} className="rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-950">
              <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">{l.term}</p>
              <p className="mt-0.5 text-xs text-blue-900/70 dark:text-blue-100/70">{l.def}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

function UpcomingPane() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Upcoming recommendations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          In order. Each moves to Current after you decide on the one before it.
        </p>
      </div>
      <div className="space-y-2">
        {UPCOMING.map((u, i) => (
          <div key={u.name} className="rounded-xl border border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <TypeTag type={u.type} />
              <p className="min-w-0 truncate text-sm font-semibold text-foreground">{u.name}</p>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">{u.desc}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Why: {u.evidence}</p>
          </div>
        ))}
      </div>

      <div>
        <SectionLabel icon={<ArrowRight className="h-3.5 w-3.5 text-blue-500" />}>
          How each one lands
        </SectionLabel>
        <div className="mt-2 space-y-0">
          {NEXT_STEPS.map((n, i) => (
            <div key={n.step} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold " +
                    (n.state === "now"
                      ? "bg-blue-500 text-white"
                      : n.state === "done"
                        ? "bg-emerald-500 text-white"
                        : "border border-border bg-background text-muted-foreground")
                  }
                >
                  {i + 1}
                </span>
                {i < NEXT_STEPS.length - 1 && <span className="w-px flex-1 bg-border" />}
              </div>
              <div className="pb-5">
                <p className="text-sm font-medium text-foreground">
                  {n.step}
                  {n.state === "now" && (
                    <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      you are here
                    </span>
                  )}
                  {n.state === "done" && (
                    <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      done Jan 15
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground/70">
          Every approval happens in the conversation. Anything accepted shows up under Your setup
          and reports in Your work.
        </p>
      </div>
    </div>
  );
}

function RecommendationsTab() {
  const [pane, setPane] = useState("current");
  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <div className="flex shrink-0 gap-1 overflow-x-auto md:w-44 md:flex-col md:overflow-visible">
        {RAIL.map((r) => (
          <button
            key={r.id}
            onClick={() => setPane(r.id)}
            className={
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors " +
              (pane === r.id
                ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                : "text-muted-foreground hover:bg-muted hover:text-foreground")
            }
          >
            {r.icon}
            <span>{r.label}</span>
            {r.count !== null && (
              <span
                className={
                  "ml-auto rounded-full px-1.5 py-0.5 text-xs font-medium " +
                  (pane === r.id
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                    : "bg-muted text-muted-foreground")
                }
              >
                {r.count}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        {pane === "current" ? <CurrentPane /> : <UpcomingPane />}
      </div>
    </div>
  );
}

/* ---------------- Full view ---------------- */

function FullView() {
  const [active, setActive] = useState(DEFAULT_TAB);
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background text-foreground">
      <div className="shrink-0 border-b border-blue-100 bg-blue-50 px-8 py-5 dark:border-blue-900 dark:bg-blue-950/40">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
          <Sparkles className="h-5 w-5 shrink-0 text-blue-500" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground">{USER.name}'s pod</h1>
            <p className="text-sm text-muted-foreground">
              How Dust is helping you work, and what's worth adding next.
            </p>
          </div>
          <span className="ml-auto hidden shrink-0 text-xs text-muted-foreground sm:block">
            {USER.role} · {USER.company}
          </span>
        </div>
      </div>

      <div className="shrink-0 border-b border-border px-8">
        <div className="mx-auto flex w-full max-w-4xl gap-1 overflow-x-auto">
          {TAB_TITLES.map((t, i) => (
            <button
              key={t}
              onClick={() => setActive(i)}
              className={
                "shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors " +
                (i === active
                  ? "border-blue-500 font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl flex-1 px-8 py-6">
        {active === 0 ? <OverviewTab /> : active === 1 ? <YourWorkTab /> : active === 2 ? <YourSetupTab /> : <RecommendationsTab />}

        <div className="mt-6 flex justify-center">
          <a
            href={CONVERSATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
          >
            Open the last recommendation <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Condensed banner view (~280px) ---------------- */

function BannerView() {
  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <div className="flex shrink-0 items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2.5 dark:border-blue-900 dark:bg-blue-950/40">
        <Sparkles className="h-4 w-4 shrink-0 text-blue-500" />
        <span className="truncate text-sm font-semibold text-foreground">{USER.name}'s pod</span>
        <a
          href={CONVERSATION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
        >
          Open the last recommendation <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="min-h-0 flex-1 px-4 py-3">
        <p className="text-sm text-foreground" style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          <span className="font-medium">{POD_INTRO.lead}</span>{" "}
          <span className="text-muted-foreground">{POD_INTRO.body}</span>
        </p>
        <div className="mt-3 flex items-center gap-2 overflow-x-auto">
          {LOOP.map((step, i) => (
            <div key={step.title} className="flex shrink-0 items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-500 font-semibold text-white" style={{ fontSize: 10 }}>
                  {i + 1}
                </span>
                <span className="text-xs font-medium text-foreground">{step.title}</span>
              </div>
              {i < LOOP.length - 1 && <ArrowRight className="h-3 w-3 shrink-0 text-stone-400" />}
            </div>
          ))}
          <RotateCcw className="h-3 w-3 shrink-0 text-stone-400" />
        </div>
      </div>
    </div>
  );
}

export default function ActivationPodFrame() {
  const banner = useSurface();
  return banner ? <BannerView /> : <FullView />;
}
`;
