// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
"use client";

import { HomeEyebrow } from "@app/components/home/content/Product/HomeEyebrow";
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
    imageSrc: "/static/landing/functions/engineering.png",
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
    imageSrc: "/static/landing/functions/customersupport.png",
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
    imageSrc: "/static/landing/functions/sales.png",
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
    imageSrc: "/static/landing/functions/marketing.png",
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
    imageSrc: "/static/landing/functions/data.png",
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

function UsageMarker({ shape, colorClass, size = 22 }: UsageMarkerProps) {
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

export function HomeTeamUsageSection() {
  const [activeId, setActiveId] = useState(TABS[0].id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState({
    left: 0,
    width: 0,
    ready: false,
  });

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

  return (
    <section className="w-full bg-background py-24">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-12 px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          <HomeEyebrow label="How every team uses Dust" />
          <h2 className="m-0 max-w-[760px] text-balance text-center text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-foreground md:text-5xl xl:text-6xl">
            One platform, every team, compounding value
          </h2>
          <p className="m-0 max-w-[560px] text-base leading-[1.55] text-muted-foreground">
            Pick your team to see what AI operators are shipping there today.
          </p>
        </div>

        {/* Custom tab nav with sliding indicator */}
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
                onClick={() => setActiveId(tab.id)}
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

        {/* Active tab panel — keyed so React remounts and the fade fires on switch */}
        <div
          key={activeTab.id}
          role="tabpanel"
          id={`team-panel-${activeTab.id}`}
          aria-labelledby={`team-tab-${activeTab.id}`}
          className="grid animate-in grid-cols-1 gap-10 fade-in-0 duration-200 lg:grid-cols-2 lg:gap-16"
        >
          <div
            className={`relative flex aspect-[4/3] w-full items-center justify-center self-stretch overflow-hidden rounded-2xl lg:aspect-auto lg:min-h-[480px] ${activeTab.bg}`}
          >
            <Image
              src={activeTab.imageSrc}
              alt={activeTab.imageAlt}
              fill
              loading={activeIndex === 0 ? "eager" : "lazy"}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-contain p-8"
            />
          </div>
          <div className="flex flex-col gap-10 lg:gap-12 lg:py-4">
            <h3 className="m-0 whitespace-pre-line text-4xl font-semibold leading-[0.98] tracking-[-0.03em] text-foreground md:text-5xl">
              {activeTab.heading}
            </h3>
            <ul className="m-0 flex list-none flex-col p-0">
              {activeTab.points.map((point, idx) => (
                <li
                  key={point.title}
                  className={`flex items-start gap-5 py-5 ${
                    idx > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <span className="flex h-7 items-center pt-px">
                    <UsageMarker
                      shape={point.shape}
                      colorClass={point.colorClass}
                    />
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
        </div>
      </div>
    </section>
  );
}
