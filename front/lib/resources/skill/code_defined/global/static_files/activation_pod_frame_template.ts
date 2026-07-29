export const ACTIVATION_POD_FRAME_TEMPLATE = `
import { useEffect, useState } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Inbox,
  MessageCircle,
  Sparkles,
} from "lucide-react";

/* ============================================================
   ACTIVATION POD FRAME — pinned pod overview
   ============================================================
   ONE state. The pod's home: a short "What is this pod?" explainer
   (collapsible) plus a growing set of tiles — one per recommendation
   the user has completed. There is no day1/grown switch; the page
   simply gains a tile each time something gets done.

   The result of a recommendation is NOT rendered here — that gets its
   own separate frame. This frame only keeps the record.

   Keep placeholder names anonymized until you write the real
   user's data.
   ============================================================ */

/* ---------------- TEMPLATE DATA ---------------- */

const USER = { name: "User", role: "Marketing", company: "Acme" };

// "What is this pod?" — the collapsible explainer.
const ABOUT =
  "Your conversations, files, and anything you approve to run on its own all live here — so nothing you set up is ever lost or hidden. This page fills up with things you say yes to, one at a time.";

const HOW_IT_WORKS = [
  { title: "Dust suggests", icon: "sparkles", tint: "indigo", sub: "One idea at a time, drawn from how you actually work. Never a list." },
  { title: "You say yes", icon: "chat", tint: "violet", sub: "In the chat, in your own words. Nothing runs without your ok." },
  { title: "It runs for you", icon: "calendar", tint: "sky", sub: "On a schedule you pick. You don't do anything." },
  { title: "Results land here", icon: "inbox", tint: "emerald", sub: "Each finished recommendation becomes a tile on this page." },
];

// One tile per completed recommendation. Append one each time something
// gets done. Empty until the first recommendation completes.
const TILES: { title: string; when: string; detail?: string }[] = [
  {
    title: "Inbox closeout",
    when: "Today",
    detail: "Drafted 4 replies and flagged the partner contract thread.",
  },
];

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

function HowItWorksTimeline() {
  return (
    <div className="flex flex-col">
      {HOW_IT_WORKS.map((step, i) => {
        const t = tintClasses(step.tint);
        const last = i === HOW_IT_WORKS.length - 1;
        return (
          <div key={step.title} className="flex gap-4">
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
        );
      })}
    </div>
  );
}

function Collapsible({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-foreground">{label}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open ? <div className="px-4 pb-5">{children}</div> : null}
    </div>
  );
}

// "What is this pod?" — collapsible. Defaults open on day 1 (no tiles yet),
// and collapses out of the way once the pod has real activity.
function AboutSection() {
  return (
    <Collapsible label="What is this pod?" defaultOpen={TILES.length === 0}>
      <div className="flex flex-col gap-6 pt-1">
        <p className="text-sm leading-relaxed text-muted-foreground">{ABOUT}</p>
        <HowItWorksTimeline />
      </div>
    </Collapsible>
  );
}

// One tile per completed recommendation.
function Tiles() {
  return (
    <div className="flex flex-col gap-2.5">
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
        <div className="flex flex-col gap-6">
          <Reveal i={0}>
            <div className="flex flex-col items-center gap-2 text-center">
              <Kicker>Your pod</Kicker>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                One place where Dust works for you, {USER.name}.
              </h1>
            </div>
          </Reveal>

          {TILES.length > 0 ? <Tiles /> : null}

          <AboutSection />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Condensed banner view (pinned, ~280px) ---------------- */

function BannerView() {
  const recent = TILES.slice().reverse();
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden bg-background px-4 py-3 text-foreground">
      <div>
        <Kicker>Your pod</Kicker>
        <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
          One place where Dust works for you, {USER.name}.
        </p>
      </div>
      {recent.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {recent.map((tile, i) => (
            <div key={i} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <p className="text-xs leading-snug text-foreground line-clamp-1">{tile.title}</p>
            </div>
          ))}
        </div>
      ) : (
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
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ActivationPodFrame() {
  const banner = useSurface();
  return banner ? <BannerView /> : <FullView />;
}
`;
