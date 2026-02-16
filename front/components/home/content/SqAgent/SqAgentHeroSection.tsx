// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { P } from "@app/components/home/ContentComponents";
import { LandingEmailSignup } from "@app/components/home/content/Landing/LandingEmailSignup";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  cn,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import Image from "next/image";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

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
        className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen py-8 md:py-24"
        style={{
          background:
            "linear-gradient(180deg, #FFF 0%, #F0F9FF 40%, #F0F9FF 60%, #FFF 100%)",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-16">
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
              <LandingEmailSignup
                ctaButtonText={ctaButtonText}
                trackingLocation="sqagent_hero"
                className="w-full max-w-md"
              />

              {/* Rotating Testimonial */}
              <div className="mt-6 w-full md:mt-10">
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
