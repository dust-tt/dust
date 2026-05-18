// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file

import { HomeReveal } from "@app/components/home/content/Product/HomeReveal";
import { homeScenarios } from "@app/components/home/content/Product/heroOfficeScenario";
import { mountFloorScene } from "@app/components/home/content/Product/heroOfficeScene";
import type { TeamMember } from "@app/components/home/content/shared/team";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { Button } from "@dust-tt/sparkle";
import Link from "next/link";
import { useEffect, useRef } from "react";

const HEADLINE_LINE_1 = "Multiplayer AI for";
const HEADLINE_LINE_2 = "human-agent collaboration.";
const LEAD_COPY =
  "Dust is where people and agents collaborate as co-contributors, so that work doesn't just get done – it gets rewired.";

const OFFICE_FIRST_NAMES = [
  "Aisha",
  "Amara",
  "Carlos",
  "David",
  "Elena",
  "James",
  "Kevin",
  "Leila",
  "Marcus",
  "Mei",
  "Natasha",
  "Omar",
  "Priya",
  "Raj",
  "Ryan",
  "Sarah",
  "Sofia",
  "Tyler",
  "Wei",
  "Yuki",
] as const;

const TEAM_POOL: TeamMember[] = OFFICE_FIRST_NAMES.map((firstName) => ({
  name: firstName,
  title: "",
  image: `/static/landing/people/office/${firstName.toLowerCase()}.png`,
  linkedIn: null,
  github: "",
}));

export function HeroOfficeSection() {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = sceneRef.current;
    if (!host) {
      return;
    }
    if (
      typeof window !== "undefined" &&
      !window.matchMedia("(min-width: 1024px)").matches
    ) {
      // The animated floor scene is desktop-only — skip mounting on smaller
      // viewports where it overwhelms the layout and burns mobile cycles.
      return;
    }
    const cleanup = mountFloorScene(host, {
      avatarPool: TEAM_POOL,
      scenarios: homeScenarios,
    });
    // Pause the scene's CSS animations when the hero scrolls out of view OR
    // the tab loses focus. The CSS rule
    //   .dust-floor-host[data-paused="true"] * { animation-play-state: paused; }
    // freezes every running keyframe. We only toggle the attribute when the
    // resolved state actually changed (idempotent) and we ignore transient
    // off-screen flips with a 500ms debounce so browser-zoom reflow chatter
    // doesn't reach the DOM. WAAPI animations (chat card enter/exit) are
    // intentionally NOT paused — pausing them mid-fade snaps the playhead
    // and produces a visible flicker.
    let currentPaused = false;
    const setPaused = (paused: boolean) => {
      if (paused === currentPaused) {
        return;
      }
      currentPaused = paused;
      if (paused) {
        host.setAttribute("data-paused", "true");
      } else {
        host.removeAttribute("data-paused");
      }
    };
    let viewportInView = true;
    let tabVisible =
      typeof document === "undefined" || document.visibilityState === "visible";
    let pendingPause: number | null = null;
    const sync = () => {
      if (pendingPause !== null) {
        clearTimeout(pendingPause);
        pendingPause = null;
      }
      const shouldPause = !(viewportInView && tabVisible);
      if (!shouldPause) {
        setPaused(false);
      } else {
        pendingPause = window.setTimeout(() => {
          pendingPause = null;
          setPaused(true);
        }, 500);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      viewportInView = entry.isIntersecting;
      sync();
    });
    observer.observe(host);
    const onVisibility = () => {
      tabVisible = document.visibilityState === "visible";
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (pendingPause !== null) {
        clearTimeout(pendingPause);
      }
      cleanup?.();
    };
  }, []);

  return (
    <section className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-background pb-12">
      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col-reverse items-stretch gap-10 px-6 pt-16 lg:flex-row lg:items-center lg:gap-0 lg:px-10 lg:pt-24">
        <div className="z-10 flex w-full flex-col items-start gap-6 lg:w-[42%] lg:pr-8">
          <HomeReveal>
            <Link
              href="/landing/ebook"
              onClick={withTracking(TRACKING_AREAS.HOME, "hero_ebook_pill")}
              className="group inline-flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-blue-200 bg-blue-50 py-1 pl-1 pr-3 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
            >
              <span className="inline-flex h-5 flex-shrink-0 items-center whitespace-nowrap rounded-full bg-blue-500 px-2 text-[10px] font-semibold uppercase leading-none tracking-[0.06em] text-white">
                New ebook
              </span>
              <span className="min-w-0 truncate">
                The AI Enterprise Playbook - Download it now
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
                aria-hidden="true"
              >
                <line x1="3" y1="8" x2="13" y2="8" />
                <polyline points="9 4 13 8 9 12" />
              </svg>
            </Link>
          </HomeReveal>
          <HomeReveal>
            <h1
              className="m-0 text-balance text-[clamp(40px,4.8vw,76px)] font-semibold leading-[90%] tracking-[-0.04em] text-foreground"
              style={{ fontFamily: "var(--font-sans, inherit)" }}
            >
              {HEADLINE_LINE_1}
              <br />
              {HEADLINE_LINE_2}
            </h1>
          </HomeReveal>
          <HomeReveal delay={80}>
            <p className="copy-lg max-w-[520px] text-pretty leading-[1.55] text-muted-foreground">
              {LEAD_COPY}
            </p>
          </HomeReveal>
          <HomeReveal delay={160}>
            <div className="flex flex-row flex-wrap justify-start gap-3">
              <Link href="/home/contact">
                <Button
                  variant="highlight"
                  size="md"
                  label="Request a demo"
                  onClick={withTracking(TRACKING_AREAS.HOME, "hero_book_demo")}
                />
              </Link>
              <Link href="/sign-up">
                <Button
                  variant="ghost-secondary"
                  size="md"
                  label="Try for free →"
                  onClick={withTracking(TRACKING_AREAS.HOME, "hero_start_free")}
                />
              </Link>
            </div>
          </HomeReveal>
        </div>

        <HomeReveal
          delay={80}
          className="relative hidden w-full lg:block lg:w-[58%]"
        >
          <div
            ref={sceneRef}
            className="dust-floor-host w-full lg:h-[min(86vh,900px)]"
            aria-hidden="true"
          />
        </HomeReveal>
      </div>
    </section>
  );
}
