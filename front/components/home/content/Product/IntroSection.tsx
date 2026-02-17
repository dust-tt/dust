import {
  H1,
  P,
  TeamFeatureSection,
} from "@app/components/home/ContentComponents";
import { LandingEmailSignup } from "@app/components/home/content/Landing/LandingEmailSignup";
import { ScrollProgressSection } from "@app/components/home/content/Product/ScrollProgressSection";
import { ValuePropSection } from "@app/components/home/content/Product/ValuePropSection";
import { FunctionsSection } from "@app/components/home/FunctionsSection";
import { OpenDustButton } from "@app/components/home/OpenDustButton";
import TrustedBy from "@app/components/home/TrustedBy";
import { BorderBeam } from "@app/components/magicui/border-beam";
import UTMButton from "@app/components/UTMButton";
import { DUST_HAS_SESSION, hasSessionIndicator } from "@app/lib/cookies";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { PlayIcon } from "@dust-tt/sparkle";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useCookies } from "react-cookie";

const HeroContent = () => {
  const [cookies] = useCookies([DUST_HAS_SESSION], { doNotParse: true });
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(hasSessionIndicator(cookies[DUST_HAS_SESSION]));
  }, [cookies]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center sm:gap-2 sm:px-6">
      <H1 className="text-center text-5xl font-medium text-foreground md:text-6xl lg:text-7xl">
        The Operating System<br></br>for AI Agents
      </H1>
      <P
        size="lg"
        className="text-xl leading-7 tracking-tight text-muted-foreground"
      >
        Deploy, orchestrate, and govern fleets of specialized AI agents
        <br />
        that work alongside your team, safely connected to your company's
        <br />
        knowledge and tools.
      </P>
      <div className="mt-12 w-full max-w-xl">
        {hasSession ? (
          <OpenDustButton
            size="md"
            trackingArea={TRACKING_AREAS.HOME}
            trackingObject="hero_open_dust"
            showWelcome
          />
        ) : (
          <LandingEmailSignup
            ctaButtonText="Get started"
            trackingLocation="hero"
            trackingArea={TRACKING_AREAS.HOME}
            placeholder="What's your work email?"
          >
            <p className="mt-3 text-sm text-muted-foreground">
              14-day free trial. Cancel anytime.
            </p>
          </LandingEmailSignup>
        )}
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
                  style={{ maxWidth: "100%", height: "auto" }}
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
            onClick={withTracking(
              TRACKING_AREAS.HOME,
              "hero_watch_video",
              () => {
                onWatch();
              }
            )}
            className="shadow-[0_8px_16px_-2px_rgba(0,0,0,0.3),0_4px_8px_-2px_rgba(255,255,255,0.1)] transition-all duration-300 hover:shadow-[0_16px_40px_-2px_rgba(255,255,255,0.2),0_8px_20px_-4px_rgba(255,255,255,0.15)]"
          />
        </div>
      )}
    </div>
  );
};

export function IntroSection() {
  return (
    <section className="w-full">
      <div className="flex flex-col gap-6 pt-24 sm:gap-6 md:gap-6 lg:gap-6">
        <div
          className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen pb-12"
          style={{
            background:
              "linear-gradient(180deg, #FFF 0%, #E9F7FF 40%, #E9F7FF 60%, #FFF 100%)",
          }}
        >
          <HeroContent />
          <div className="mx-auto mt-16 max-w-5xl px-4">
            <TrustedBy logoSet="landing" />
          </div>
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
