// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { H1, P } from "@marketing/components/home/ContentComponents";
import { HeroVisual } from "@marketing/components/home/content/Product/HeroVisual";
import {
  HomeReveal,
  HomeRevealStyles,
} from "@marketing/components/home/content/Product/HomeReveal";
import TrustedBy from "@marketing/components/home/TrustedBy";
import { LegacyButton as Button, Rocket02 } from "@dust-tt/sparkle";
import Link from "next/link";
import { useState } from "react";

export function ProductIntroSection() {
  const [showHeroVideo, setShowHeroVideo] = useState(false);
  return (
    <div className="sm:pt-18 w-full pt-12 lg:pt-36">
      <HomeRevealStyles />
      <div className="flex flex-col gap-16">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center sm:gap-2 lg:px-6">
          <HomeReveal>
            <H1
              className="text-center text-5xl font-semibold md:text-6xl lg:text-7xl"
              style={{
                textAlign: "center",
                fontFamily: "var(--font-sans, inherit)",
              }}
            >
              The multiplayer, multi-model AI system that compounds
              organizational intelligence
            </H1>
          </HomeReveal>
          <HomeReveal delay={80}>
            <P size="lg" className="text-base text-muted-foreground sm:text-lg">
              Dust gives AI Operators at the world&apos;s fastest-moving
              companies the power to rewire how work gets done, connecting any
              model, any tool, any team.
            </P>
          </HomeReveal>
          <HomeReveal delay={160}>
            <div className="mt-4 flex flex-row justify-center gap-4">
              <Link href="/home/pricing" shallow={true}>
                <Button
                  variant="highlight"
                  size="md"
                  label="Try Dust Now"
                  icon={Rocket02}
                />
              </Link>
              <Link href="/home/contact" shallow={true}>
                <Button variant="outline" size="md" label="Contact Sales" />
              </Link>
            </div>
          </HomeReveal>
        </div>
        <HomeReveal variant="photo" delay={120}>
          <HeroVisual
            showVideo={showHeroVideo}
            onWatch={() => setShowHeroVideo(true)}
          />
        </HomeReveal>
        <div className="mt-16">
          <TrustedBy />
        </div>
      </div>
    </div>
  );
}
