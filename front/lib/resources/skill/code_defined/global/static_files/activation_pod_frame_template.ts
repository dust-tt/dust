export const ACTIVATION_POD_FRAME_TEMPLATE = `
import { useEffect, useState } from "react";
import {
  Sparkles,
  Wrench,
  Bot,
  CheckCircle2,
  Circle,
  Radar,
  Search,
  MessageCircleQuestion,
  Gift,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "shadcn";

/* ============================================================
   ACTIVATION POD FRAME — v2 experiment
   Card-based, single scrolling column formatting (from the
   "recreate from scratch" iteration), applied on top of the
   current template's placeholder data.
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

/* ==== TEMPLATE DATA — EDIT ONLY THIS BLOCK ==== */
const USER = { name: "Alex", role: "Customer Success", company: "Acme" };

const YOUR_USAGE = { messages: 6 };

const PEER_TOOLS = [
  {
    kind: "agent",
    name: "@account-recap",
    desc: "Pulls a customer's recent tickets, calls, and docs into one recap before a check-in.",
  },
  {
    kind: "skill",
    name: "QBR builder",
    desc: "Turns account notes and shared usage stats into a quarterly review draft.",
  },
  {
    kind: "agent",
    name: "@renewal-radar",
    desc: "Summarizes open risks and blockers on accounts approaching renewal, on request.",
  },
];

const WORKSPACE_TOOLS = [
  {
    kind: "agent",
    name: "@ticket-triage",
    desc: "Sorts incoming support tickets and drafts first responses.",
  },
  {
    kind: "agent",
    name: "@sales-assistant",
    desc: "Answers reps' product and pricing questions mid-deal.",
  },
];

type IdeaStatus = "shown" | "accepted";

const IDEAS: { name: string; desc: string; status: IdeaStatus }[] = [
  {
    name: "Escalation tracker",
    desc: "Collect open escalations across accounts, with status and owner, in one view.",
    status: "shown",
  },
  {
    name: "Health-check digest",
    desc: "A recurring summary of account health signals from shared sources.",
    status: "shown",
  },
];

/* ==== END TEMPLATE DATA — RENDER CODE BELOW IS FROZEN ==== */

function KindIcon({ kind }: { kind: string }) {
  const Icon = kind === "skill" ? Wrench : Bot;
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-950">
      <Icon className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
    </div>
  );
}

function ToolItem({ name, desc, kind }: { name: string; desc: string; kind: string }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <KindIcon kind={kind} />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground">{name}</p>
        <p className="text-xs leading-snug text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function IdeaItem({ name, desc, status }: { name: string; desc: string; status: IdeaStatus }) {
  const StatusIcon = status === "accepted" ? CheckCircle2 : Circle;
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <StatusIcon
        className={
          "mt-0.5 h-3.5 w-3.5 shrink-0 " +
          (status === "accepted" ? "text-violet-600" : "text-muted-foreground")
        }
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground">{name}</p>
        <p className="text-xs leading-snug text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

/* ----------------- FULL VIEW (conversation) ----------------- */

function FullView() {
  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <div className="shrink-0 bg-slate-900 px-6 py-3">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Sparkles className="h-4 w-4 shrink-0 text-violet-400" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-white">
              {USER.name}, welcome to your pod
            </h1>
            <p className="text-xs text-slate-400">
              One job: get Dust working for you.
            </p>
          </div>
          <span className="ml-auto shrink-0 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300">
            {USER.role} · {USER.company}
          </span>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden px-4 py-3">
        <div
          className="grid flex-1 gap-4 overflow-hidden"
          style={{ gridTemplateColumns: "minmax(200px, 1fr) minmax(0, 1.4fr)" }}
        >
          {/* LEFT — how this works */}
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-violet-700">
                How this works
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col justify-between space-y-3 overflow-hidden pt-0">
              <div className="space-y-3">
                {[
                  {
                    icon: Search,
                    t: "I read the signals",
                    d:
                      "how " +
                      USER.role.toLowerCase() +
                      " peers and " +
                      USER.company +
                      " use Dust, plus your public role",
                  },
                  {
                    icon: MessageCircleQuestion,
                    t: "You point me",
                    d: "a couple of quick questions turn generic ideas into your ideas",
                  },
                  {
                    icon: Gift,
                    t: "Things arrive finished",
                    d: "keep or toss, one click — kept things run on their own",
                  },
                ].map((s, i) => (
                  <div key={s.t} className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 font-semibold text-white"
                      style={{ fontSize: 10 }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <s.icon className="h-3.5 w-3.5 text-violet-600" />
                        {s.t}
                      </p>
                      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                        {s.d}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  You, so far:
                </span>{" "}
                {YOUR_USAGE.messages} messages in 30 days, nothing running.
              </p>
            </CardContent>
          </Card>

          {/* RIGHT — tools & ideas */}
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
            <Card className="min-h-0 flex-1 overflow-hidden">
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-sm text-violet-700">
                  What {USER.role.toLowerCase()} peers here already use
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border overflow-y-auto pt-0">
                {PEER_TOOLS.map((t) => (
                  <ToolItem key={t.name} {...t} />
                ))}
              </CardContent>
            </Card>

            <Card className="min-h-0 flex-1 overflow-hidden">
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-sm text-violet-700">
                  Busiest across {USER.company}
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border overflow-y-auto pt-0">
                {WORKSPACE_TOOLS.map((t) => (
                  <ToolItem key={t.name} {...t} />
                ))}
              </CardContent>
            </Card>

            <Card className="min-h-0 flex-1 overflow-hidden border-dashed">
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-sm text-violet-700">
                  Ideas, curated not personalized yet
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-border overflow-y-auto pt-0">
                {IDEAS.map((i) => (
                  <IdeaItem key={i.name} {...i} />
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-3 flex shrink-0 items-center gap-3 rounded-xl bg-violet-600 px-4 py-2.5">
          <Radar className="h-4 w-4 shrink-0 text-violet-200" />
          <p className="text-xs text-white">
            I took a first guess at a use case relevant to your role, a
            couple of quick questions sharpens it further.
          </p>
        </div>
      </div>
    </main>
  );
}

/* ----------------- DASHBOARD VIEW (pinned banner) ----------------- */

function DashboardView() {
  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-3 bg-slate-900 px-5 py-2.5">
        <Sparkles className="h-4 w-4 shrink-0 text-violet-400" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {USER.name}, welcome to your pod
          </p>
          <p className="truncate text-xs text-slate-400">
            One job: get Dust working for you.
          </p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300">
          {USER.role} · {USER.company}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden px-5 py-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-violet-700">
          How this works
        </p>
        <div className="space-y-2.5">
          {[
            {
              icon: Search,
              t: "I read the signals",
              d:
                "how " +
                USER.role.toLowerCase() +
                " peers and " +
                USER.company +
                " use Dust, plus your public role — never your email, calendar, or files",
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
            <div key={s.t} className="flex items-start gap-2.5">
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 font-semibold text-white"
                style={{ fontSize: 10 }}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <s.icon className="h-3.5 w-3.5 text-violet-600" />
                  {s.t}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {s.d}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-5 mb-2.5 flex shrink-0 items-center gap-2.5 rounded-lg bg-violet-600 px-3 py-2">
        <Radar className="h-4 w-4 shrink-0 text-violet-200" />
        <p className="text-xs text-white">
          I took a first guess at a use case relevant to your role. To curate
          further, I need to learn more about you, a couple of quick
          questions when you're ready.
        </p>
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
