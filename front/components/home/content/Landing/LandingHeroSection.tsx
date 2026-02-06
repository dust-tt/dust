import { cn } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

import { LandingEmailSignup } from "@app/components/home/content/Landing/LandingEmailSignup";
import { P } from "@app/components/home/ContentComponents";

interface LandingHeroSectionProps {
  headline: ReactNode;
  subheadline: string;
  ctaButtonText: string;
  welcomeBackText?: string;
  trackingLocation: string;
  chip?: string;
  layout?: "centered" | "split";
  rightContent?: ReactNode;
  bottomContent?: ReactNode;
}

export function LandingHeroSection({
  headline,
  subheadline,
  ctaButtonText,
  welcomeBackText,
  trackingLocation,
  chip,
  layout = "centered",
  rightContent,
  bottomContent,
}: LandingHeroSectionProps) {
  const isCentered = layout === "centered";

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
          <div
            className={
              isCentered
                ? "mx-auto max-w-3xl text-center"
                : "flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-16"
            }
          >
            {/* Left/Main content */}
            <div
              className={isCentered ? "" : "flex flex-col items-start lg:w-1/2"}
            >
              {/* Chip */}
              {chip && (
                <div
                  className={cn(
                    "mb-6 inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-sm font-medium text-blue-700",
                    isCentered && "mx-auto"
                  )}
                >
                  <span className="flex h-2 w-2 rounded-full bg-blue-500" />
                  {chip}
                </div>
              )}

              {/* Headline */}
              <h1
                className={cn(
                  "mb-6 text-4xl font-bold md:text-5xl lg:text-6xl",
                  !isCentered && "text-left"
                )}
              >
                {headline}
              </h1>

              {/* Subheadline */}
              <P
                size="md"
                className={cn(
                  "mb-10 text-muted-foreground",
                  isCentered && "mx-auto max-w-2xl"
                )}
              >
                {subheadline}
              </P>

              {/* Email CTA */}
              <div className={cn("w-full max-w-md", isCentered && "mx-auto")}>
                <LandingEmailSignup
                  ctaButtonText={ctaButtonText}
                  welcomeBackText={welcomeBackText}
                  trackingLocation={trackingLocation}
                />
              </div>

              {/* Bottom content (testimonials, etc.) */}
              {bottomContent && isCentered && (
                <div className="mt-10 w-full">{bottomContent}</div>
              )}

              {bottomContent && !isCentered && (
                <div className="mt-10 w-full">{bottomContent}</div>
              )}
            </div>

            {/* Right content (video, image, etc.) */}
            {rightContent && !isCentered && (
              <div className="flex-1">{rightContent}</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
