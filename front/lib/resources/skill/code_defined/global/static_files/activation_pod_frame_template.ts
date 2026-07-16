export const ACTIVATION_POD_FRAME_TEMPLATE = `import { useEffect, useState } from "react";
import {
  Sparkles,
  ArrowRight,
  Search,
  MessageCircleQuestion,
  Gift,
  Users,
  Building2,
  Lightbulb,
  Bot,
  Wrench,
} from "lucide-react";

/* ============================================================
   ACTIVATION POD FRAME v7
   Design sources: beautiful-frames-design skill (icons not
   emojis, perfect spacing, premium minimalist), Henry's
   failure-mode analysis (committed visual identity: one accent
   [violet], one neutral base, one strong anchor [dark masthead];
   no default-admin-panel), Frame design playbook.
   Content rules from this thread:
   - Enumeration intro kept (top left).
   - Analytics are the hero: agents & skills shown DIRECTLY,
     each with a proper plain-language description. Replaces
     the process map.
   - No gamification. No pulsing badges, streaks, or locks.
   - No presumed artifacts: recommendations are clearly labeled
     curated ideas. The real next step is getting more intel,
     and the single CTA says so.
   - Calm: masthead + 3 regions + 1 CTA. Nothing else.
   Two renderings, auto-selected by surface.
   ============================================================ */

/* ----------------- surface detection ----------------- */

function useSurface(): "dashboard" | "full" {
  const [surface, setSurface] = useState<"dashboard" | "full">(() => detect());
  function detect(): "dashboard" | "full" {
    try {
      const id =
        new URLSearchParams(window.location.search).get("identifier") ?? "";
      if (id.startsWith("viz-banner-")) return "dashboard";
    } catch {
      /* fall through */
    }
    return window.innerHeight < 400 ? "dashboard" : "full";
  }
  useEffect(() => {
    const onResize = () => setSurface(detect());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return surface;
}

/* ----------------- TEMPLATE DATA (from allowed calls only) -----------------
   get_personal_usage / get_personal_usage(job_type) /
   get_workspace_activity / skills list / Exa public profile.
   RULE: agents and skills are shown directly, by name, each with
   a real one-line description of what it does. Counts are real.
   No claims about schedules or automations we cannot see. */

/* ==== TEMPLATE DATA — EDIT ONLY THIS BLOCK ==== */
const USER = { name: "Alex", role: "Customer Success", company: "Acme" };

const YOUR_USAGE = { messages: 6 };

// get_personal_usage(job_type) — agents & skills peers actually use
const PEER_TOOLS = [
  {
    kind: "agent",
    name: "@account-recap",
    desc: "Pulls a customer's recent tickets, calls, and docs into one recap before a check-in.",
    who: "7 of 11 CSMs",
  },
  {
    kind: "skill",
    name: "QBR builder",
    desc: "Turns account notes and shared usage stats into a quarterly review draft.",
    who: "5 CSMs",
  },
  {
    kind: "agent",
    name: "@renewal-radar",
    desc: "Summarizes open risks and blockers on accounts approaching renewal, on request.",
    who: "3 CSMs",
  },
];

// get_workspace_activity — most used across the whole workspace
const WORKSPACE_TOOLS = [
  {
    kind: "agent",
    name: "@ticket-triage",
    desc: "Sorts incoming support tickets and drafts first responses.",
    who: "420 runs last month",
  },
  {
    kind: "agent",
    name: "@sales-assistant",
    desc: "Answers reps' product and pricing questions mid-deal.",
    who: "310 runs last month",
  },
];

// skills/templates list — curated for the role, labeled honestly
const IDEAS = [
  {
    name: "Escalation tracker",
    desc: "Collect open escalations across accounts, with status and owner, in one view.",
  },
  {
    name: "Health-check digest",
    desc: "A recurring summary of account health signals from shared sources.",
  },
];

/* ==== END TEMPLATE DATA — RENDER CODE BELOW IS FROZEN ==== */

/* ----------------- shared: tool row ----------------- */

function ToolRow({
  kind,
  name,
  desc,
  who,
}: {
  kind: string;
  name: string;
  desc: string;
  who: string;
}) {
  const Icon = kind === "skill" ? Wrench : Bot;
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-950">
        <Icon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <span className="ml-auto shrink-0 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            {who}
          </span>
        </div>
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

/* ----------------- FULL VIEW (conversation) ----------------- */

function FullView() {
  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      {/* masthead — the one strong visual anchor */}
      <div className="shrink-0 bg-slate-900 px-8 py-5">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
          <Sparkles className="h-5 w-5 shrink-0 text-violet-400" />
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-white">
              {USER.name}, welcome to your pod
            </h1>
            <p className="text-sm text-slate-400">
              One job: get Dust quietly working for you — without you building
              anything.
            </p>
          </div>
          <span className="ml-auto hidden shrink-0 text-xs text-slate-500 sm:block">
            {USER.role} · {USER.company}
          </span>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-y-auto px-8 py-6">
        <div
          className="grid flex-1 gap-8"
          style={{ gridTemplateColumns: "minmax(220px, 2fr) 3fr" }}
        >
          {/* LEFT — how this works (the enumeration) */}
          <div className="flex min-w-0 flex-col">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              How this works
            </p>
            <div className="mt-4 space-y-5">
              {[
                {
                  icon: Search,
                  t: "I read the signals",
                  d: \`how \${USER.role.toLowerCase()} peers and \${USER.company} use Dust, plus your public role — never your email, calendar, or files\`,
                },
                {
                  icon: MessageCircleQuestion,
                  t: "You point me",
                  d: "a couple of quick questions in the conversation — that's what turns generic ideas into your ideas",
                },
                {
                  icon: Gift,
                  t: "Things arrive finished",
                  d: "keep or toss, one click — kept things run on their own, and this panel keeps score",
                },
              ].map((s, i) => (
                <div key={s.t} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 font-semibold text-white"
                    style={{ fontSize: 11 }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <s.icon className="h-4 w-4 text-violet-600" />
                      {s.t}
                    </p>
                    <p className="mt-1 text-sm leading-snug text-muted-foreground">
                      {s.d}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-6">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  You, so far:
                </span>{" "}
                {YOUR_USAGE.messages} messages in 30 days, nothing running.
                That's exactly who this pod is for.
              </p>
            </div>
          </div>

          {/* RIGHT — the analytics, front and center */}
          <div className="flex min-w-0 flex-col">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Users className="h-3.5 w-3.5 text-violet-600" />
              What {USER.role.toLowerCase()} peers here already use
            </p>
            <div className="mt-1 divide-y divide-border">
              {PEER_TOOLS.map((t) => (
                <ToolRow key={t.name} {...t} />
              ))}
            </div>

            <p className="mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 text-violet-600" />
              Busiest across {USER.company}
            </p>
            <div className="mt-1 divide-y divide-border">
              {WORKSPACE_TOOLS.map((t) => (
                <ToolRow key={t.name} {...t} />
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-3">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Lightbulb className="h-3.5 w-3.5 text-violet-600" />
                Ideas for your role — curated, not personalized yet
              </p>
              <div className="mt-2 space-y-1.5">
                {IDEAS.map((i) => (
                  <p key={i.name} className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{i.name}</span>
                    {" — "}
                    {i.desc}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* the single CTA — intel, not a presumed artifact */}
        <div className="mt-6 flex shrink-0 items-center gap-4 rounded-xl bg-violet-600 px-6 py-4">
          <MessageCircleQuestion className="h-6 w-6 shrink-0 text-violet-200" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              I took a first guess at a use case relevant to your role.
            </p>
            <p className="text-sm text-violet-200">
              To curate further and understand your workflows, I need to learn
              more about you — a couple of quick questions when you're ready.
            </p>
          </div>
        </div>

        <p className="mt-3 shrink-0 text-xs text-muted-foreground opacity-70">
          Built from workspace usage stats and your public profile.
        </p>
      </div>
    </main>
  );
}

/* ----------------- DASHBOARD VIEW (pinned banner) ----------------- */

function DashboardView() {
  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      {/* condensed masthead — same anchor as the full view */}
      <div className="flex shrink-0 items-center gap-2 bg-slate-900 px-4 py-2.5">
        <Sparkles className="h-4 w-4 shrink-0 text-violet-400" />
        <span className="truncate text-sm font-semibold text-white">
          {USER.name}'s activation pod
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300">
          nothing running yet
        </span>
      </div>

      {/* condensed ledger — peers only, the highest-value section */}
      <div className="flex min-h-0 flex-1 flex-col justify-center px-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Users className="h-3 w-3 text-violet-600" />
          What {USER.role.toLowerCase()} peers here already use
        </p>
        <div className="mt-0.5 divide-y divide-border">
          {PEER_TOOLS.slice(0, 2).map((t) => (
            <div key={t.name} className="flex items-baseline gap-2 py-1.5">
              <span className="shrink-0 text-sm font-semibold text-foreground">
                {t.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {t.desc}
              </span>
              <span className="ml-auto shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                {t.who}
              </span>
            </div>
          ))}
          <div className="flex items-baseline gap-2 py-1.5">
            <span className="shrink-0 text-sm font-semibold text-foreground">
              {IDEAS[0].name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {IDEAS[0].desc}
            </span>
            <span className="ml-auto shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">
              curated
            </span>
          </div>
        </div>
      </div>

      {/* condensed CTA — same message as the full view, one line */}
      <div className="mx-4 mb-3 flex shrink-0 items-center gap-2.5 rounded-lg bg-violet-600 px-3 py-2">
        <MessageCircleQuestion className="h-4 w-4 shrink-0 text-violet-200" />
        <p className="truncate text-xs font-medium text-white">
          I took a first guess for your role — help me sharpen it in the
          conversation
        </p>
        <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-violet-200" />
      </div>
    </main>
  );
}

/* ----------------- ROOT ----------------- */

export default function ActivationPodFrame() {
  const surface = useSurface();
  return surface === "dashboard" ? <DashboardView /> : <FullView />;
}
`;
