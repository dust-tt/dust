import { PlayIcon, Spinner } from "@dust-tt/sparkle";
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
import { clientFetch } from "@app/lib/egress/client";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { appendUTMParams } from "@app/lib/utils/utm";

const HeroContent = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email");
      return;
    }

    setIsLoading(true);

    try {
      const response = await clientFetch("/api/enrichment/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.redirectUrl) {
        window.location.href = appendUTMParams(data.redirectUrl);
      }
    } catch (err) {
      console.error("Enrichment error:", err);
      // Fallback to signup on error
      window.location.href = appendUTMParams(
        `/api/workos/login?screenHint=sign-up&loginHint=${encodeURIComponent(email)}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center sm:gap-2 sm:px-6">
      <H1 className="text-center text-5xl font-medium md:text-6xl lg:text-7xl">
        The operating system
        <br />
        for{" "}
        <span
          className="pr-1"
          style={{
            background:
              "linear-gradient(90deg, #1C91FF 0%, #8B5CF6 35%, #E14322 65%, #6AA668 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          AI Agents
        </span>
      </H1>
      <P
        size="lg"
        className="text-xl leading-7 tracking-tight text-muted-foreground"
      >
        Deploy, orchestrate, and govern fleets of specialized AI agents that
        work alongside your team, safely connected to your company's knowledge
        and tools.
      </P>
      {/* Email input */}
      <form onSubmit={handleSubmit} className="mt-12 w-full max-w-xl">
        <div className="flex w-full items-center gap-2 rounded-2xl border border-gray-100 bg-white py-1.5 pl-6 pr-1.5 shadow-sm">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="What's your work email?"
            className="flex-1 border-none bg-transparent text-base text-gray-700 placeholder-gray-400 outline-none focus:ring-0"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-70"
          >
            {isLoading && <Spinner size="xs" />}
            Start with Dust
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </form>
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
      <div className="flex flex-col gap-6 pt-16 sm:gap-6 md:gap-6 lg:gap-6">
        <div
          className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen pb-12"
          style={{
            background:
              "linear-gradient(180deg, #FFF 0%, #E9F7FF 40%, #E9F7FF 60%, #FFF 100%)",
          }}
        >
          <HeroContent />
          <div className="mx-auto mt-12 max-w-5xl px-4">
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
