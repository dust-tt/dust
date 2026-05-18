// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
"use client";

import { H2 } from "@app/components/home/ContentComponents";
import { HomeEyebrow } from "@app/components/home/content/Product/HomeEyebrow";
import { HomeReveal } from "@app/components/home/content/Product/HomeReveal";
import { cn } from "@app/components/poke/shadcn/lib/utils";
import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type UsageShape = "circle" | "pie-br" | "pie-bl" | "pie-tr" | "pie-tl";

const PIE_ROTATION: Record<Exclude<UsageShape, "circle">, number> = {
  "pie-br": 0,
  "pie-tr": 90,
  "pie-tl": 180,
  "pie-bl": 270,
};

interface UsagePoint {
  title: string;
  description: string;
  shape: UsageShape;
  colorClass: string;
}

interface UsageTab {
  id: string;
  label: string;
  heading: string;
  imageSrc: string;
  imageAlt: string;
  bg: string;
  points: UsagePoint[];
}

// The four shapes cycle through every tab so each list reads with the same
// rhythm: circle → quarter-pie left → quarter-pie right → circle.
const SHAPE_CYCLE: UsageShape[] = ["circle", "pie-bl", "pie-br", "circle"];

const TABS: UsageTab[] = [
  {
    id: "engineering",
    label: "Engineering",
    heading: "Engineering\nOperations",
    imageSrc: "/static/landing/functions/engineering.jpg",
    imageAlt: "Engineering team workflow placeholder",
    bg: "bg-orange-100/40",
    points: [
      {
        title: "AI-Powered Code Debugging",
        description:
          "Surface relevant context, docs, and historical issues inside your IDE",
        shape: "circle",
        colorClass: "text-pink-300",
      },
      {
        title: "Automated Code Reviews",
        description: "Maintain standards and compliance at scale",
        shape: "pie-bl",
        colorClass: "text-orange-500",
      },
      {
        title: "Incident Response",
        description:
          "Execute automated runbooks, integrate communications, and enable rapid root cause analysis",
        shape: "pie-br",
        colorClass: "text-yellow-300",
      },
      {
        title: "Continuous Doc Generation",
        description:
          "Keep user and API docs up-to-date from code changes automatically",
        shape: "circle",
        colorClass: "text-green-700",
      },
    ],
  },
  {
    id: "support",
    label: "Customer Support",
    heading: "Customer Support\nOperations",
    imageSrc: "/static/landing/functions/customersupport.jpg",
    imageAlt: "Customer support workflow placeholder",
    bg: "bg-blue-100/40",
    points: [
      {
        title: "Ticket Triage & Routing",
        description: "Classify and route tickets to the right team instantly",
        shape: SHAPE_CYCLE[0],
        colorClass: "text-blue-400",
      },
      {
        title: "Draft Responses",
        description:
          "Generate context-aware replies grounded in your knowledge base",
        shape: SHAPE_CYCLE[1],
        colorClass: "text-pink-300",
      },
      {
        title: "Knowledge Synthesis",
        description: "Turn resolved tickets into reusable internal docs",
        shape: SHAPE_CYCLE[2],
        colorClass: "text-orange-400",
      },
      {
        title: "Escalation Detection",
        description: "Spot at-risk accounts and surface them before they churn",
        shape: SHAPE_CYCLE[3],
        colorClass: "text-green-500",
      },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    heading: "Sales\nOperations",
    imageSrc: "/static/landing/functions/sales.jpg",
    imageAlt: "Sales workflow placeholder",
    bg: "bg-green-100/40",
    points: [
      {
        title: "Account Research",
        description: "Brief reps in seconds with the latest signal on accounts",
        shape: SHAPE_CYCLE[0],
        colorClass: "text-blue-500",
      },
      {
        title: "Lead Qualification",
        description: "Score and route inbound leads with your live ICP",
        shape: SHAPE_CYCLE[1],
        colorClass: "text-yellow-400",
      },
      {
        title: "Proposal Drafting",
        description: "Generate tailored proposals from past wins",
        shape: SHAPE_CYCLE[2],
        colorClass: "text-pink-300",
      },
      {
        title: "CRM Hygiene",
        description: "Auto-log calls, emails, and next steps after every touch",
        shape: SHAPE_CYCLE[3],
        colorClass: "text-green-500",
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing & Content",
    heading: "Marketing & Content\nOperations",
    imageSrc: "/static/landing/functions/marketing.jpg",
    imageAlt: "Marketing workflow placeholder",
    bg: "bg-pink-100/40",
    points: [
      {
        title: "Brief Generation",
        description:
          "Turn campaign goals into structured briefs grounded in your brand",
        shape: SHAPE_CYCLE[0],
        colorClass: "text-pink-400",
      },
      {
        title: "Content Localization",
        description: "Translate and adapt copy across markets in minutes",
        shape: SHAPE_CYCLE[1],
        colorClass: "text-orange-400",
      },
      {
        title: "Performance Analysis",
        description: "Roll up campaign data into actionable narratives",
        shape: SHAPE_CYCLE[2],
        colorClass: "text-blue-400",
      },
      {
        title: "Social Drafting",
        description: "Compose on-brand posts from your latest releases",
        shape: SHAPE_CYCLE[3],
        colorClass: "text-green-500",
      },
    ],
  },
  {
    id: "data",
    label: "Data & analytics",
    heading: "Data & Analytics\nOperations",
    imageSrc: "/static/landing/functions/data.jpg",
    imageAlt: "Data and analytics workflow placeholder",
    bg: "bg-violet-100/40",
    points: [
      {
        title: "Self-Service Analytics",
        description: "Let any teammate ask data questions in plain English",
        shape: SHAPE_CYCLE[0],
        colorClass: "text-blue-500",
      },
      {
        title: "Pipeline Monitoring",
        description: "Watch dashboards and alert on anomalies automatically",
        shape: SHAPE_CYCLE[1],
        colorClass: "text-yellow-400",
      },
      {
        title: "Metrics Standardization",
        description:
          "Codify definitions so the whole company speaks one number",
        shape: SHAPE_CYCLE[2],
        colorClass: "text-pink-300",
      },
      {
        title: "Report Drafting",
        description: "Turn raw queries into ready-to-share narratives",
        shape: SHAPE_CYCLE[3],
        colorClass: "text-green-500",
      },
    ],
  },
];

interface UsageMarkerProps {
  shape: UsageShape;
  colorClass: string;
  size?: number;
}

function UsageMarker({ shape, colorClass, size = 16 }: UsageMarkerProps) {
  if (shape === "circle") {
    return (
      <span
        aria-hidden="true"
        className={`block flex-shrink-0 rounded-full bg-current ${colorClass}`}
        style={{ width: size, height: size }}
      />
    );
  }
  const rotation = PIE_ROTATION[shape];
  return (
    <span
      aria-hidden="true"
      className="block flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 12 12"
        className={`block ${colorClass}`}
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        <path d="M0 0 H12 A12 12 0 0 1 0 12 Z" fill="currentColor" />
      </svg>
    </span>
  );
}

// Mirrors the carousel motion language from HomeQuotesSection: the outgoing
// panel slides off one side while the incoming panel slides in from the
// opposite side, both running on the same 300ms ease-out-cubic. Direction is
// derived from the tab index — clicking a tab further right slides content
// left (next), clicking a tab further left slides content right (prev).
const TEAM_SLIDE_DURATION_MS = 300;
const TEAM_PANEL_CSS = `
@keyframes home-team-slide-in-right {
  from { transform: translate3d(48px, 0, 0); opacity: 0; }
  to { transform: translate3d(0, 0, 0); opacity: 1; }
}
@keyframes home-team-slide-in-left {
  from { transform: translate3d(-48px, 0, 0); opacity: 0; }
  to { transform: translate3d(0, 0, 0); opacity: 1; }
}
@keyframes home-team-slide-out-left {
  from { transform: translate3d(0, 0, 0); opacity: 1; }
  to { transform: translate3d(-48px, 0, 0); opacity: 0; }
}
@keyframes home-team-slide-out-right {
  from { transform: translate3d(0, 0, 0); opacity: 1; }
  to { transform: translate3d(48px, 0, 0); opacity: 0; }
}
@keyframes home-team-img-slide-in-right {
  from { transform: translate3d(16px, 0, 0); opacity: 0; }
  to { transform: translate3d(0, 0, 0); opacity: 1; }
}
@keyframes home-team-img-slide-in-left {
  from { transform: translate3d(-16px, 0, 0); opacity: 0; }
  to { transform: translate3d(0, 0, 0); opacity: 1; }
}
@keyframes home-team-img-slide-out-left {
  from { transform: translate3d(0, 0, 0); opacity: 1; }
  to { transform: translate3d(-16px, 0, 0); opacity: 0; }
}
@keyframes home-team-img-slide-out-right {
  from { transform: translate3d(0, 0, 0); opacity: 1; }
  to { transform: translate3d(16px, 0, 0); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .home-team-slide,
  .home-team-img-slide {
    animation: none;
    opacity: 1;
    transform: none;
  }
}
`;

interface TeamOutgoingState {
  id: string;
  direction: 1 | -1;
}

// Image and content are intentionally split so the two columns can animate
// independently on tab change — the image cross-fades in place (calm, stable
// reference) while the content slides horizontally with the tab direction
// (carries the directional intent). Both share the same 300ms ease-out-cubic
// so they finish together; only the motion paths differ.
function ImageCol({ tab, eager }: { tab: UsageTab; eager: boolean }) {
  return (
    <div className="relative flex aspect-[4/3] w-full overflow-hidden rounded-2xl lg:aspect-auto lg:h-full lg:min-h-[480px]">
      <Image
        src={tab.imageSrc}
        alt={tab.imageAlt}
        fill
        loading={eager ? "eager" : "lazy"}
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="object-cover"
      />
    </div>
  );
}

function ContentCol({ tab }: { tab: UsageTab }) {
  return (
    <div className="flex flex-col gap-10 lg:gap-12 lg:py-4">
      <h3 className="m-0 whitespace-pre-line text-4xl font-semibold leading-[0.98] tracking-[-0.03em] text-foreground md:text-5xl">
        {tab.heading}
      </h3>
      <ul className="m-0 flex list-none flex-col p-0">
        {tab.points.map((point, idx) => (
          <li
            key={point.title}
            className={`flex items-start gap-5 py-5 ${
              idx > 0 ? "border-t border-border" : ""
            }`}
          >
            <span className="flex h-7 items-center pt-px">
              <UsageMarker shape={point.shape} colorClass={point.colorClass} />
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="text-base font-semibold tracking-[-0.01em] text-foreground md:text-lg">
                {point.title}
              </div>
              <div className="text-base leading-[1.45] text-muted-foreground">
                {point.description}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HomeTeamUsageSection() {
  const [activeId, setActiveId] = useState(TABS[0].id);
  const [outgoing, setOutgoing] = useState<TeamOutgoingState | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState({
    left: 0,
    width: 0,
    ready: false,
  });

  // Clear the outgoing slide once its exit animation completes — keeping it
  // in the DOM longer would keep two panels mounted and could trap focus.
  useEffect(() => {
    if (!outgoing) {
      return;
    }
    const t = window.setTimeout(
      () => setOutgoing(null),
      TEAM_SLIDE_DURATION_MS
    );
    return () => window.clearTimeout(t);
  }, [outgoing]);

  const switchTo = (newId: string) => {
    if (outgoing || newId === activeId) {
      return; // ignore mid-animation clicks
    }
    const oldIdx = TABS.findIndex((t) => t.id === activeId);
    const newIdx = TABS.findIndex((t) => t.id === newId);
    const direction: 1 | -1 = newIdx > oldIdx ? 1 : -1;
    setOutgoing({ id: activeId, direction });
    setActiveId(newId);
  };

  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[activeId];
      const list = listRef.current;
      if (!el || !list) {
        return;
      }
      const elRect = el.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      setIndicator({
        left: elRect.left - listRect.left,
        width: elRect.width,
        ready: true,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeId]);

  // Re-measure once after fonts load — letter-spacing settles can shift width
  // by a couple of pixels and leave the indicator off by a hair.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.ready) {
      return;
    }
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) {
        return;
      }
      const el = tabRefs.current[activeId];
      const list = listRef.current;
      if (!el || !list) {
        return;
      }
      const elRect = el.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      setIndicator((prev) => ({
        left: elRect.left - listRect.left,
        width: elRect.width,
        ready: prev.ready,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const activeTab = TABS.find((t) => t.id === activeId) ?? TABS[0];
  const activeIndex = TABS.findIndex((t) => t.id === activeId);

  // Content (heading + list) slides horizontally with the tab direction.
  const incomingContentAnim = outgoing
    ? outgoing.direction === 1
      ? "home-team-slide-in-right"
      : "home-team-slide-in-left"
    : null;
  const outgoingContentAnim = outgoing
    ? outgoing.direction === 1
      ? "home-team-slide-out-left"
      : "home-team-slide-out-right"
    : null;
  // Image slides in the same direction as the content but at a much smaller
  // magnitude (16px vs 48px) — same motion language, lighter magnitude, so
  // the two columns feel layered rather than locked.
  const incomingImgAnim = outgoing
    ? outgoing.direction === 1
      ? "home-team-img-slide-in-right"
      : "home-team-img-slide-in-left"
    : null;
  const outgoingImgAnim = outgoing
    ? outgoing.direction === 1
      ? "home-team-img-slide-out-left"
      : "home-team-img-slide-out-right"
    : null;
  const animBase = `${TEAM_SLIDE_DURATION_MS}ms cubic-bezier(0.215, 0.61, 0.355, 1) both`;
  const outgoingTab = outgoing
    ? (TABS.find((t) => t.id === outgoing.id) ?? null)
    : null;

  return (
    <section className="w-full bg-background py-14 lg:py-24">
      <style dangerouslySetInnerHTML={{ __html: TEAM_PANEL_CSS }} />
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-12 px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          <HomeReveal>
            <HomeEyebrow label="How every team uses Dust" />
          </HomeReveal>
          <HomeReveal delay={80}>
            <H2 className="max-w-[760px] text-balance text-center font-semibold leading-[1.08] tracking-[-0.03em] text-foreground">
              One platform, every team, compounding value
            </H2>
          </HomeReveal>
          <HomeReveal delay={160}>
            <p className="m-0 max-w-[560px] text-base leading-[1.55] text-muted-foreground">
              Discover how AI Operators across departments are using Dust to
              rewire the way their companies work.
            </p>
          </HomeReveal>
        </div>

        {/* Custom tab nav with sliding indicator */}
        <HomeReveal delay={240}>
          <div
            ref={listRef}
            role="tablist"
            aria-label="Team use cases"
            className="relative flex w-full overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map((tab) => {
              const isActive = tab.id === activeId;
              return (
                <button
                  key={tab.id}
                  ref={(node) => {
                    tabRefs.current[tab.id] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`team-tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`team-panel-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => switchTo(tab.id)}
                  className={cn(
                    "flex-1 whitespace-nowrap px-5 py-5 text-base transition-colors duration-200 md:text-lg",
                    isActive
                      ? "font-semibold text-foreground"
                      : "font-medium text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute -bottom-px left-0 h-[2px] bg-foreground motion-reduce:transition-none",
                indicator.ready
                  ? "opacity-100 transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.215,0.61,0.355,1)]"
                  : "opacity-0"
              )}
              style={{
                transform: `translateX(${indicator.left}px)`,
                width: `${indicator.width}px`,
              }}
            />
          </div>
        </HomeReveal>

        {/* Two-column panel where image and content animate independently:
            the image slides a short 16px while the content slides the full
            48px in the tab direction. The panel itself is wrapped in a
            scroll-triggered HomeReveal so it fades up into view alongside
            the rest of the section. */}
        <HomeReveal delay={320}>
          <div
            role="tabpanel"
            id={`team-panel-${activeId}`}
            aria-labelledby={`team-tab-${activeId}`}
            className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16"
          >
            {/* Image column — relative wrapper with one in-flow ghost that
              sets the height and absolute-positioned layers stacked on top
              for the cross-fade slide. Using `relative` rather than `grid`
              lets the wrapper stretch to the panel grid's row height (which
              tracks the content column) so the image keeps the same tall
              presence it had before the split. */}
            <div className="relative">
              <div className="invisible" aria-hidden>
                <ImageCol tab={activeTab} eager={false} />
              </div>
              {outgoingTab && outgoingImgAnim && (
                <div
                  key={`out-img-${outgoing?.id}`}
                  className="home-team-img-slide absolute inset-0"
                  style={{ animation: `${outgoingImgAnim} ${animBase}` }}
                  aria-hidden
                >
                  <ImageCol tab={outgoingTab} eager={false} />
                </div>
              )}
              <div
                key={`in-img-${activeId}`}
                className="home-team-img-slide absolute inset-0"
                style={
                  incomingImgAnim
                    ? { animation: `${incomingImgAnim} ${animBase}` }
                    : undefined
                }
              >
                <ImageCol tab={activeTab} eager={activeIndex === 0} />
              </div>
            </div>

            {/* Content column — horizontal slide. */}
            <div className="relative grid overflow-hidden">
              {TABS.map((t) => (
                <div
                  key={`ghost-content-${t.id}`}
                  className="invisible col-start-1 row-start-1"
                  aria-hidden
                >
                  <ContentCol tab={t} />
                </div>
              ))}
              {outgoingTab && outgoingContentAnim && (
                <div
                  key={`out-content-${outgoing?.id}`}
                  className="home-team-slide col-start-1 row-start-1"
                  style={{ animation: `${outgoingContentAnim} ${animBase}` }}
                  aria-hidden
                >
                  <ContentCol tab={outgoingTab} />
                </div>
              )}
              <div
                key={`in-content-${activeId}`}
                className="home-team-slide col-start-1 row-start-1"
                style={
                  incomingContentAnim
                    ? { animation: `${incomingContentAnim} ${animBase}` }
                    : undefined
                }
              >
                <ContentCol tab={activeTab} />
              </div>
            </div>
          </div>
        </HomeReveal>
      </div>
    </section>
  );
}
