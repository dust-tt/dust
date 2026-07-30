export const ACTIVATION_POD_FRAME_TEMPLATE = `
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

/* ============================================================
   ACTIVATION POD FRAME — pinned pod overview
   ============================================================
   TWO SURFACES, ONE DATA MODEL

   Banner (pinned): exact same PodIntro as full view — everything
   above "Where we're headed". Not a compact/summary variant.

   Full view: PodIntro → Overall Goal highlights → Session plan
   (hero, live statuses) → completed tiles.

   Update PLAN step statuses as you execute. Keep NEXT_STEP in
   sync with the current step (e.g. "Next step is in chat — …").
   All copy is second person ("you"). Customize TEMPLATE DATA;
   never ship placeholders.
   ============================================================ */

/* ---------------- TEMPLATE DATA ---------------- */

const WHY_THIS_POD =
  "People in your role at Acme already run weekly reporting from Dust — this space was set up so you can too.";

// Second-person digest of AGENTS.md (Destination + Who). Not the full file.
const OVERALL_GOAL_HIGHLIGHTS: string[] = [
  "You're in Marketing at Acme — you live in HubSpot, Slack, and weekly stakeholder updates.",
  "Overall goal: get you running recurring reporting and meeting prep from Dust, not by hand.",
  "Must-hit: one real digest you keep, then one briefing before a key meeting.",
];

const SESSION_GOAL =
  "Help you draft this week's status from HubSpot + Slack — producing a ready-to-send digest.";

// Update statuses as you go: pending → current → done.
// Exactly one step should be "current" while the session is active.
const PLAN: { label: string; status: "pending" | "current" | "done" }[] = [
  { label: "Say yes to the idea in chat", status: "current" },
  { label: "I'll build the digest from your sources", status: "pending" },
  { label: "Optionally save or schedule it for next week", status: "pending" },
];

// Plain instruction for what to do next. Update whenever PLAN's current step changes.
const NEXT_STEP =
  "Next step is in chat — say yes on the card when you're ready.";

const TILES: { title: string; when: string; detail?: string }[] = [];

/* ---------------- END TEMPLATE DATA ---------------- */

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

// Top intro — identical in pinned banner and full view (everything above "Where we're headed").
function PodIntro() {
  return (
    <div className="flex flex-col gap-2">
      <Kicker>Your pod</Kicker>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        A space Dust set up for you
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {WHY_THIS_POD}
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        A <span className="font-medium text-foreground">pod</span> is a shared team space for these chats, files, and anything you
        approve to run on its own. This panel is a{" "}
        <span className="font-medium text-foreground">Frame</span> — pinned so you can always see the plan.
      </p>
    </div>
  );
}

function PlanList() {
  return (
    <ol className="flex flex-col gap-2">
      {PLAN.map((step, i) => {
        const done = step.status === "done";
        const current = step.status === "current";
        return (
          <li
            key={step.label}
            className={
              "flex items-start gap-3 rounded-xl px-2.5 py-2 " +
              (current ? "bg-indigo-50 dark:bg-indigo-950/40" : "")
            }
          >
            <span
              className={
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold " +
                (done
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : current
                    ? "bg-indigo-500 text-white"
                    : "bg-muted text-muted-foreground")
              }
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={
                  "text-sm leading-snug " +
                  (done
                    ? "text-muted-foreground line-through"
                    : current
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground")
                }
              >
                {step.label}
              </p>
              {current ? (
                <p className="mt-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  Happening now
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Tiles() {
  if (TILES.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2.5">
      <Kicker>Done in this pod</Kicker>
      {TILES.map((tile, i) => (
        <Reveal key={i} i={i + 1}>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-sm font-medium text-foreground">{tile.title}</span>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{tile.when}</span>
            </div>
            {tile.detail ? (
              <p className="mt-2 pl-6 text-sm text-muted-foreground">{tile.detail}</p>
            ) : null}
          </div>
        </Reveal>
      ))}
    </div>
  );
}

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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-xl px-6 py-10">
        <div className="flex flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}

function FullView() {
  return (
    <Shell>
      <Reveal i={0}>
        <PodIntro />
      </Reveal>

      <Reveal i={1}>
        <div className="flex flex-col gap-2">
          <Kicker>Where we're headed</Kicker>
          <ul className="flex flex-col gap-2">
            {OVERALL_GOAL_HIGHLIGHTS.map((line) => (
              <li
                key={line}
                className="rounded-xl border border-border px-3.5 py-3 text-sm leading-snug text-foreground"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      <Reveal i={2}>
        <div className="rounded-2xl border border-indigo-200 bg-card p-5 shadow-sm dark:border-indigo-900/50">
          <Kicker>This session</Kicker>
          <p className="mt-2 text-lg font-semibold leading-snug tracking-tight text-foreground">
            {SESSION_GOAL}
          </p>
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Simple plan
            </p>
            <PlanList />
          </div>
          <p className="mt-5 text-sm font-medium text-foreground">{NEXT_STEP}</p>
        </div>
      </Reveal>

      <Tiles />
    </Shell>
  );
}

// Pinned strip = exact same PodIntro as full view (everything above "Where we're headed").
function BannerView() {
  return (
    <Shell>
      <PodIntro />
    </Shell>
  );
}

export default function ActivationPodFrame() {
  const banner = useSurface();
  return banner ? <BannerView /> : <FullView />;
}
`;
