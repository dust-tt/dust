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
    const cleanup = mountFloorScene(host, {
      avatarPool: TEAM_POOL,
      scenarios: homeScenarios,
    });
    return cleanup;
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
            className="m-0 text-balance text-[clamp(40px,4.8vw,76px)] font-medium leading-[1.02] tracking-[-0.04em] text-foreground"
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
                variant="primary"
                size="md"
                label="Book a demo"
                onClick={withTracking(TRACKING_AREAS.HOME, "hero_book_demo")}
              />
            </Link>
            <Link href="/sign-up">
              <Button
                variant="outline"
                size="md"
                label="Start free →"
                onClick={withTracking(TRACKING_AREAS.HOME, "hero_start_free")}
              />
            </Link>
          </div>
        </div>

        <div className="relative w-full lg:w-[58%]">
          <div
            ref={sceneRef}
            className="dust-floor-host h-[clamp(360px,80vw,520px)] w-full sm:h-[clamp(420px,60vw,720px)] lg:h-[min(86vh,900px)]"
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  );
}
