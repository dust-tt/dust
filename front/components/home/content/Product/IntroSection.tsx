import { PlayIcon, RocketIcon } from "@dust-tt/sparkle";
import Image from "next/image";
import { useState } from "react";

import { ScrollProgressSection } from "@app/components/home/content/Product/ScrollProgressSection";
import { ValuePropSection } from "@app/components/home/content/Product/ValuePropSection";
import {
  H1,
  P,
  TeamFeatureSection,
} from "@app/components/home/ContentComponents";
import { FunctionsSection } from "@app/components/home/FunctionsSection";
import TrustedBy from "@app/components/home/TrustedBy";
import { BorderBeam } from "@app/components/magicui/border-beam";
import UTMButton from "@app/components/UTMButton";
import { trackClick, TRACKING_AREAS } from "@app/lib/tracking";

const HeroContent = () => {
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center sm:gap-2 sm:px-6">
      <H1
        mono
        className="text-center text-5xl font-medium md:text-6xl lg:text-7xl"
      >
        Transform how work
        <br />
        gets done
      </H1>
      <P size="lg" className="text-base text-muted-foreground sm:text-lg">
        The platform to build AI agents in minutes, connected to your company
        knowledge and tools,
        <br className="hidden sm:block" /> powered by the best AI models.
      </P>
      <div className="mt-4 flex flex-row justify-center gap-4">
        <UTMButton
          variant="highlight"
          size="md"
          label="Get started"
          icon={RocketIcon}
          href="/home/pricing"
          {...trackClick(TRACKING_AREAS.HOME, "hero_get_started")}
        />
        <UTMButton
          variant="outline"
          size="md"
          label="Book a demo"
          href="/home/contact"
          {...trackClick(TRACKING_AREAS.HOME, "hero_book_demo")}
        />
      </div>
    </div>
  );
};

export const HeroVisual = ({
  onWatch,
  showVideo,
}: {
  onWatch: () => void;
  showVideo: boolean;
}) => {
  // Keep the outer shell & border animation consistent, swap inner content on click
  const videoUrl = new URL(
    "https://fast.wistia.net/embed/iframe/3eqngftomq?seo=true&videoFoam=true"
  );
  if (showVideo) {
    videoUrl.searchParams.set("autoPlay", "true");
    videoUrl.searchParams.set("muted", "true");
    videoUrl.searchParams.set("playsinline", "true");
  }

  return (
    <div className="relative w-full sm:-mt-6 md:mt-0 lg:mt-12">
      <div className="relative mx-auto w-full max-w-[2000px]">
        <div className="overflow-hidden rounded-4xl bg-gray-100 p-1 sm:p-2 md:p-3 lg:p-4">
          <div className="relative flex aspect-[16/9] items-center justify-center">
            <div className="relative h-full w-full overflow-hidden rounded-lg sm:rounded-xl md:rounded-2xl lg:rounded-3xl">
              {showVideo ? (
                <iframe
                  src={videoUrl.toString()}
                  title="Dust product tour"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full overflow-hidden rounded-lg sm:rounded-xl md:rounded-2xl lg:rounded-3xl"
                />
              ) : (
                <Image
                  src="/static/landing/header/header.jpg"
                  alt="Dust Platform"
                  width={1920}
                  height={1080}
                  className="rounded-lg sm:rounded-xl md:rounded-2xl lg:rounded-3xl"
                  style={{
                    maxWidth: "100%",
                    height: "auto",
                  }}
                  priority
                />
              )}
            </div>
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg sm:rounded-xl md:rounded-2xl lg:rounded-3xl">
              <BorderBeam
                size={400}
                duration={10}
                colorFrom="#CDCDCD"
                colorTo="#CDCDCD"
              />
            </div>
          </div>
        </div>
      </div>
      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <UTMButton
            variant="primary"
            size="md"
            label="Watch Dust in motion"
            icon={PlayIcon}
            onClick={() => onWatch()}
            className="shadow-[0_8px_16px_-2px_rgba(0,0,0,0.3),0_4px_8px_-2px_rgba(255,255,255,0.1)] transition-all duration-300 hover:shadow-[0_16px_40px_-2px_rgba(255,255,255,0.2),0_8px_20px_-4px_rgba(255,255,255,0.15)]"
            {...trackClick(TRACKING_AREAS.HOME, "hero_watch_video")}
          />
        </div>
      )}
    </div>
  );
};

export function IntroSection() {
  const [showHeroVideo, setShowHeroVideo] = useState(false);
  return (
    <section className="w-full">
      <div className="flex flex-col gap-6 pt-16 sm:gap-6 md:gap-6 lg:gap-6">
        <div className="flex flex-col gap-16 sm:gap-16">
          <HeroContent />
          <HeroVisual
            showVideo={showHeroVideo}
            onWatch={() => setShowHeroVideo(true)}
          />
        </div>
        <div className="mt-12">
          <TrustedBy logoSet="landing" />
        </div>
        <div className="mt-12">
          <FunctionsSection />
        </div>
        <div className="mt-12">
          <ScrollProgressSection />
        </div>
        <div className="mt-12">
          <TeamFeatureSection />
        </div>
        <div className="mt-12">
          <ValuePropSection />
        </div>
      </div>
    </section>
  );
}
