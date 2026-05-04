import { H2, P } from "@app/components/home/ContentComponents";
import { HomeEyebrow } from "@app/components/home/content/Product/HomeEyebrow";
import { HomeReveal } from "@app/components/home/content/Product/HomeReveal";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";

function useReducedMotionPref() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

interface FeatureCard {
  number: string;
  title: string;
  subtitle: string;
  accent: string;
  hoverVideoSrc: string;
}

const CARDS: FeatureCard[] = [
  {
    number: "01",
    title: "Knows your company",
    subtitle:
      "Connects to all your tools and data — your stack becomes the agent's memory.",
    accent: "text-blue-500",
    hoverVideoSrc: "/static/landing/home/features/knows-your-company.mp4",
  },
  {
    number: "02",
    title: "AI is a team sport",
    subtitle:
      "Built for collaboration across departments. Skills travel; agents compound.",
    accent: "text-rose-500",
    hoverVideoSrc: "/static/landing/home/features/team-sport.mp4",
  },
  {
    number: "03",
    title: "Always the best model",
    subtitle:
      "Switch between OpenAI, Anthropic, Google, Mistral — without rewriting the agent.",
    accent: "text-golden-500",
    hoverVideoSrc: "/static/landing/home/features/best-model.mp4",
  },
  {
    number: "04",
    title: "Compounds across the org",
    subtitle:
      "Value grows with every team that joins. The fiftieth workflow is easier than the fifth.",
    accent: "text-green-700",
    hoverVideoSrc: "/static/landing/home/features/compounds.mp4",
  },
];

interface HoverImageCardProps {
  card: FeatureCard;
  index: number;
}

function HoverImageCard({ card, index }: HoverImageCardProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const trackerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingPosRef = useRef<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(false);
  const reducedMotion = useReducedMotionPref();

  const writePosition = () => {
    rafRef.current = null;
    const tracker = trackerRef.current;
    const next = pendingPosRef.current;
    if (!tracker || !next) {
      return;
    }
    tracker.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
  };

  const queueMove = (x: number, y: number) => {
    pendingPosRef.current = { x, y };
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(writePosition);
    }
  };

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const handleEnter = (event: ReactMouseEvent<HTMLDivElement>) => {
    const wrapper = wrapperRef.current;
    const tracker = trackerRef.current;
    if (!wrapper || !tracker) {
      return;
    }
    const rect = wrapper.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    // Snap the tracker to the entry coordinates synchronously so the video
    // fades in directly under the cursor instead of jumping from (0,0).
    tracker.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    pendingPosRef.current = { x, y };
    setActive(true);
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => {
        /* Autoplay may be blocked; the video stays at its first frame. */
      });
    }
  };

  const handleLeave = () => {
    setActive(false);
    const video = videoRef.current;
    if (video) {
      video.pause();
    }
  };

  const handleMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }
    const rect = wrapper.getBoundingClientRect();
    queueMove(event.clientX - rect.left, event.clientY - rect.top);
  };

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onMouseMove={handleMove}
    >
      <HomeReveal
        as="article"
        delay={index * 80}
        className="group relative z-0 flex flex-col gap-6 overflow-hidden bg-background p-8 transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-50/40 md:p-10"
      >
        <div className="flex items-center gap-4">
          <span
            className={`inline-block font-mono text-2xl font-medium tracking-tight transition-transform duration-200 group-hover:scale-110 ${card.accent}`}
            style={{ transformOrigin: "left center" }}
          >
            {card.number}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-xl font-semibold tracking-[-0.01em] text-foreground md:text-2xl">
            {card.title}
          </h3>
          <p className="m-0 max-w-[420px] text-sm leading-[1.55] text-muted-foreground">
            {card.subtitle}
          </p>
        </div>
      </HomeReveal>
      {!reducedMotion && (
        <div
          ref={trackerRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-10 hidden md:block"
          style={{ willChange: "transform" }}
        >
          <div
            className={`origin-center -translate-x-1/2 -translate-y-1/2 transition-[opacity,transform] ease-out ${
              active
                ? "scale-100 opacity-100 duration-300"
                : "scale-95 opacity-0 duration-200"
            }`}
          >
            <video
              ref={videoRef}
              src={card.hoverVideoSrc}
              muted
              loop
              playsInline
              preload="metadata"
              className="h-[260px] w-[260px] rounded-2xl bg-slate-100 object-cover shadow-xl ring-1 ring-black/5"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function HomeAgentsImproveSection() {
  return (
    <section className="w-full bg-background py-24">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-16 px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          <HomeReveal>
            <HomeEyebrow label="How dust agents improve with you" />
          </HomeReveal>
          <HomeReveal delay={80}>
            <H2 className="max-w-[820px] text-balance text-center font-semibold leading-[1.08] tracking-[-0.03em] text-foreground">
              Agents that understand how you work and get smarter over time
            </H2>
          </HomeReveal>
          <HomeReveal delay={160}>
            <P
              size="sm"
              className="max-w-[680px] text-center text-muted-foreground"
            >
              Dust agents don&apos;t just search your data; your teams encode
              how you work in agents. With Skills and reinforcement
              capabilities, agents learn and evolve through repeated use. Best
              practices consolidate into shared skills, improvements spread to
              every agent automatically, and your fiftieth workflow is easier to
              build than your fifth.
            </P>
          </HomeReveal>
        </div>
        <div className="grid grid-cols-1 gap-px rounded-3xl bg-border md:grid-cols-2">
          {CARDS.map((card, index) => (
            <HoverImageCard key={card.title} card={card} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
