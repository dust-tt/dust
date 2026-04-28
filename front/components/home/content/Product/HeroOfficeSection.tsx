// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file

import { homeScenarios } from "@app/components/home/content/Product/heroOfficeScenario";
import { mountFloorScene } from "@app/components/home/content/Product/heroOfficeScene";
import { PEOPLE } from "@app/components/home/content/shared/team";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { Button } from "@dust-tt/sparkle";
import Link from "next/link";
import { useEffect, useRef } from "react";

const HEADLINE_LINE_1 = "AI for the people";
const HEADLINE_LINE_2 = "who run the work.";
const LEAD_COPY =
  "Turn scattered knowledge into coordinated execution. AI agents your team builds, owns, and runs — alongside the humans who know the work.";
const EYEBROW_COPY = "Run on Dust · live in 47 companies right now";

const TEAM_POOL = Object.values(PEOPLE);

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
    // Pause the scene's CSS animations + chat-card typewriter when the hero
    // scrolls out of view OR the tab loses focus. Keeps the GPU/CPU idle
    // while the user is reading the rest of the page. The conductor itself
    // (setTimeout-driven beat scheduler) keeps ticking — that's a few µs per
    // beat — but every active CSS keyframe is gated by `[data-paused="true"]`.
    const setPaused = (paused: boolean) => {
      if (paused) {
        host.setAttribute("data-paused", "true");
      } else {
        host.removeAttribute("data-paused");
      }
      // CSS `animation-play-state` only catches pure CSS keyframes. The chat
      // card uses Web Animations API (`element.animate(...)`) for its enter/
      // exit, and the floor scene's character bobs are also WAAPI in places —
      // pause those explicitly via `Element.getAnimations({ subtree: true })`.
      // This catches every running animation in the host's tree, regardless
      // of whether it was started via CSS or JS.
      const hostWithAnims = host as HTMLDivElement & {
        getAnimations?: (opts?: { subtree?: boolean }) => Animation[];
      };
      if (typeof hostWithAnims.getAnimations === "function") {
        const anims = hostWithAnims.getAnimations({ subtree: true });
        for (const anim of anims) {
          if (paused) {
            anim.pause();
          } else {
            anim.play();
          }
        }
      }
    };
    let viewportInView = true;
    let tabVisible =
      typeof document === "undefined" || document.visibilityState === "visible";
    const sync = () => setPaused(!(viewportInView && tabVisible));
    const observer = new IntersectionObserver(
      ([entry]) => {
        viewportInView = entry.isIntersecting;
        sync();
      },
      { threshold: 0.05 }
    );
    observer.observe(host);
    const onVisibility = () => {
      tabVisible = document.visibilityState === "visible";
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      cleanup?.();
    };
  }, []);

  return (
    <section className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-background pb-12">
      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col-reverse items-stretch gap-10 px-6 pt-16 lg:flex-row lg:items-center lg:gap-0 lg:px-10 lg:pt-24">
        <div className="z-10 flex w-full flex-col items-start gap-6 lg:w-[42%] lg:pr-8">
          <span className="label-xs inline-flex h-8 items-center gap-2 rounded-full border border-border bg-background/85 px-3 text-muted-foreground backdrop-blur-md">
            <span
              className="h-1.5 w-1.5 rounded-full bg-success-dark"
              style={{ boxShadow: "0 0 0 3px rgba(65,139,92,0.18)" }}
            />
            <span>{EYEBROW_COPY}</span>
          </span>
          <h1
            className="m-0 text-balance text-[clamp(40px,4.8vw,76px)] font-semibold leading-[90%] tracking-[-0.04em] text-foreground"
            style={{ fontFamily: "var(--font-sans, inherit)" }}
          >
            {HEADLINE_LINE_1}
            <br />
            {HEADLINE_LINE_2}
          </h1>
          <p className="copy-lg max-w-[520px] text-pretty leading-[1.55] text-muted-foreground">
            {LEAD_COPY}
          </p>
          <div className="flex flex-row flex-wrap justify-start gap-3">
            <Link href="/home/contact">
              <Button
                variant="highlight"
                size="md"
                label="Try for free"
                onClick={withTracking(TRACKING_AREAS.HOME, "hero_book_demo")}
              />
            </Link>
            <Link href="/sign-up">
              <Button
                variant="ghost-secondary"
                size="md"
                label="See how it works →"
                onClick={withTracking(TRACKING_AREAS.HOME, "hero_start_free")}
              />
            </Link>
          </div>
        </div>

        <div className="relative hidden w-full lg:block lg:w-[58%]">
          <div
            ref={sceneRef}
            className="dust-floor-host w-full lg:h-[min(86vh,900px)]"
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  );
}
