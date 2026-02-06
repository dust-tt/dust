import {
  ArrowRightIcon,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  cn,
  Spinner,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import Image from "next/image";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useCookies } from "react-cookie";

import { P } from "@app/components/home/ContentComponents";
import { DUST_HAS_SESSION, hasSessionIndicator } from "@app/lib/cookies";
import { clientFetch } from "@app/lib/egress/client";
import {
  trackEvent,
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  withTracking,
} from "@app/lib/tracking";
import { appendUTMParams } from "@app/lib/utils/utm";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

interface VideoConfig {
  id: string;
  title: string;
  embedUrl: string;
}

interface TestimonialConfig {
  quote: string;
  name: string;
  title: string;
  logo: string;
}

interface SqAgentHeroSectionProps {
  chip: string;
  headline: ReactNode;
  subheadline: string;
  ctaButtonText: string;
  testimonials: TestimonialConfig[];
  videos: VideoConfig[];
  usersCount: string;
}

const TESTIMONIAL_ROTATION_INTERVAL_MS = 5000;

export function SqAgentHeroSection({
  chip,
  headline,
  subheadline,
  ctaButtonText,
  testimonials,
  videos,
  usersCount,
}: SqAgentHeroSectionProps) {
  const [activeVideo, setActiveVideo] = useState(0);
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cookies] = useCookies([DUST_HAS_SESSION], { doNotParse: true });
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(hasSessionIndicator(cookies[DUST_HAS_SESSION]));
  }, [cookies]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email");
      return;
    }

    trackEvent({
      area: TRACKING_AREAS.HOME,
      object: "sqagent_hero_email",
      action: TRACKING_ACTIONS.SUBMIT,
    });

    setIsLoading(true);

    try {
      const response = await clientFetch("/api/enrichment/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!data.success && data.error) {
        setError(data.error);
        return;
      }

      if (data.redirectUrl) {
        window.location.href = appendUTMParams(data.redirectUrl);
      }
    } catch (err) {
      logger.error({ error: normalizeError(err) }, "Enrichment error");
      window.location.href = appendUTMParams(
        `/api/workos/login?screenHint=sign-up&loginHint=${encodeURIComponent(email)}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const rotateTestimonial = useCallback(() => {
    setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
  }, [testimonials.length]);

  useEffect(() => {
    const interval = setInterval(
      rotateTestimonial,
      TESTIMONIAL_ROTATION_INTERVAL_MS
    );
    return () => clearInterval(interval);
  }, [rotateTestimonial]);

  const currentTestimonial = testimonials[activeTestimonial];

  return (
    <section className="w-full">
      <div
        className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen py-16 md:py-24"
        style={{
          background:
            "linear-gradient(180deg, #FFF 0%, #F0F9FF 40%, #F0F9FF 60%, #FFF 100%)",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
            {/* Left side - Content */}
            <div className="flex flex-col items-start lg:w-1/2">
              {/* Chip - only show if not empty */}
              {chip && (
                <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-sm font-medium text-blue-700">
                  <span className="flex h-2 w-2 rounded-full bg-blue-500" />
                  {chip}
                </div>
              )}

              {/* Headline */}
              <h1 className="mb-6 text-left text-4xl font-bold md:text-5xl lg:text-6xl">
                {headline}
              </h1>

              {/* Subheadline */}
              <P size="md" className="mb-8 text-muted-foreground">
                {subheadline}
              </P>

              {/* Email CTA */}
              <div className="w-full max-w-md">
                {hasSession ? (
                  <div className="flex flex-col items-start gap-3">
                    <Button
                      variant="highlight"
                      size="md"
                      label="Open Dust"
                      icon={ArrowRightIcon}
                      onClick={withTracking(
                        TRACKING_AREAS.HOME,
                        "sqagent_hero_open_dust",
                        () => {
                          window.location.href = "/api/login";
                        }
                      )}
                    />
                    <p className="text-sm text-muted-foreground">
                      Welcome back! Continue where you left off.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit}>
                    <div className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white p-1.5 shadow-md">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your work email"
                        className="flex-1 border-none bg-transparent px-3 py-2 text-base text-gray-700 placeholder-gray-400 outline-none focus:ring-0"
                        disabled={isLoading}
                      />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 font-semibold text-white shadow-sm transition-all hover:bg-blue-600 hover:shadow-md disabled:opacity-70"
                      >
                        {isLoading && <Spinner size="xs" />}
                        {ctaButtonText}
                        <ArrowRightIcon className="h-4 w-4" />
                      </button>
                    </div>
                    {error && (
                      <p className="mt-2 text-sm text-red-500">{error}</p>
                    )}
                  </form>
                )}
              </div>

              {/* Rotating Testimonial */}
              <div className="mt-10 w-full">
                <div className="relative min-h-[140px] overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div key={activeTestimonial} className="animate-fade-in-up">
                    <p className="mb-4 text-sm italic text-muted-foreground">
                      "{currentTestimonial.quote}"
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="relative h-10 w-20 overflow-hidden">
                        <Image
                          src={currentTestimonial.logo}
                          alt={`${currentTestimonial.name} company logo`}
                          fill
                          className="object-contain object-left"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {currentTestimonial.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {currentTestimonial.title}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Testimonial navigation */}
                <div className="mt-4 flex items-center justify-center gap-4">
                  <button
                    onClick={() =>
                      setActiveTestimonial(
                        (prev) =>
                          (prev - 1 + testimonials.length) % testimonials.length
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
                    aria-label="Previous testimonial"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  <div className="flex gap-2">
                    {testimonials.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setActiveTestimonial(index)}
                        className={cn(
                          "h-2 w-2 rounded-full transition-colors",
                          activeTestimonial === index
                            ? "bg-blue-500"
                            : "bg-slate-300 hover:bg-slate-400"
                        )}
                        aria-label={`View testimonial ${index + 1}`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() =>
                      setActiveTestimonial(
                        (prev) => (prev + 1) % testimonials.length
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
                    aria-label="Next testimonial"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Right side - Video Player */}
            <div className="flex-1">
              {/* Video embed area */}
              <div className="aspect-video overflow-hidden rounded-xl border border-border/50 bg-black/5 shadow-2xl">
                <iframe
                  key={videos[activeVideo].id}
                  width="100%"
                  height="100%"
                  src={videos[activeVideo].embedUrl}
                  title={videos[activeVideo].title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                />
              </div>

              {/* Video buttons - below video */}
              <div className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">
                {videos.map((video, index) => (
                  <button
                    key={video.id}
                    onClick={() => setActiveVideo(index)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-200",
                      activeVideo === index
                        ? "border-primary bg-primary text-white shadow-md"
                        : "border-border bg-white text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                  >
                    {video.title}
                  </button>
                ))}
              </div>

              {/* Users count badge */}
              <div className="mt-4 flex items-center justify-center gap-2 lg:justify-start">
                <UserGroupIcon className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium text-muted-foreground">
                  {usersCount}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
