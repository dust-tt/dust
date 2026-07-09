// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file

import { HeroVideo } from "@marketing/components/home/content/Product/HeroVideo";
import { HomeReveal } from "@marketing/components/home/content/Product/HomeReveal";
import { homeScenarios } from "@marketing/components/home/content/Product/heroOfficeScenario";
import { mountFloorScene } from "@marketing/components/home/content/Product/heroOfficeScene";
import type { TeamMember } from "@marketing/components/home/content/shared/team";
import { useSignUpModal } from "@marketing/hooks/useSignUpModal";
import type { HeroVariantKey } from "@marketing/lib/experiments/hero_experiment";
import {
  DEFAULT_HERO_VARIANT,
  HERO_CONTENT,
} from "@marketing/lib/experiments/hero_experiment";
import { TRACKING_AREAS, withTracking } from "@marketing/lib/tracking";
import { LegacyButton as Button } from "@dust-tt/sparkle";
import Link from "next/link";
import { useEffect, useRef } from "react";

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

interface HeroOfficeSectionProps {
  variant?: HeroVariantKey;
}

export function HeroOfficeSection({
  variant = DEFAULT_HERO_VARIANT,
}: HeroOfficeSectionProps = {}) {
  const { openSignUpModal } = useSignUpModal();
  const sceneRef = useRef<HTMLDivElement>(null);
  const content = HERO_CONTENT[variant];

  useEffect(() => {
    if (content.heroVideo) {
      // Video variants render an embed instead of the animated floor scene, so
      // there is nothing to mount.
      return;
    }
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
  }, [content.heroVideo]);

  return (
    <section className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-background pb-12">
      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col-reverse items-stretch gap-10 px-6 pt-16 lg:flex-row lg:items-center lg:gap-0 lg:px-10 lg:pt-24">
        <div className="z-10 flex w-full flex-col items-start gap-6 lg:w-[42%] lg:pr-8">
          <HomeReveal>
            <h1
              className="m-0 text-balance text-[clamp(40px,4.8vw,76px)] font-semibold leading-[90%] tracking-[-0.04em] text-foreground"
              style={{ fontFamily: "var(--font-sans, inherit)" }}
            >
              {content.headlineLine1}
              <br />
              {content.headlineLine2}
            </h1>
          </HomeReveal>
          <HomeReveal delay={80}>
            <p className="copy-lg max-w-[520px] text-pretty leading-[1.55] text-muted-foreground">
              {content.leadCopy}
            </p>
          </HomeReveal>
          <HomeReveal delay={160}>
            <div className="flex flex-row flex-wrap justify-start gap-3">
              <Link href="/home/contact">
                <Button
                  variant="highlight"
                  size="md"
                  label={content.primaryCtaLabel}
                  onClick={withTracking(
                    TRACKING_AREAS.HOME,
                    "hero_book_demo",
                    undefined,
                    { hero_variant: variant }
                  )}
                />
              </Link>
              <Button
                variant="ghost-secondary"
                size="md"
                label={content.secondaryCtaLabel}
                onClick={withTracking(
                  TRACKING_AREAS.HOME,
                  "hero_start_free",
                  openSignUpModal,
                  { hero_variant: variant }
                )}
              />
            </div>
          </HomeReveal>
        </div>

        <HomeReveal
          delay={80}
          className="relative hidden w-full lg:block lg:w-[58%]"
        >
          {content.heroVideo ? (
            <HeroVideo
              videoId={content.heroVideo.youtubeId}
              title={content.heroVideo.title}
            />
          ) : (
            <div
              ref={sceneRef}
              className="dust-floor-host w-full lg:h-[min(86vh,900px)]"
              aria-hidden="true"
            />
          )}
        </HomeReveal>
      </div>
    </section>
  );
}
