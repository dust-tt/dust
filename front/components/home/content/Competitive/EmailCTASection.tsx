import { CheckIcon, Icon } from "@dust-tt/sparkle";

import { LandingEmailSignup } from "@app/components/home/content/Landing/LandingEmailSignup";
import { TRACKING_AREAS } from "@app/lib/tracking";

interface EmailCTASectionProps {
  title: string;
  subtitle: string;
  buttonText: string;
  trustBadges: string[];
  trackingObject?: string;
}

export function EmailCTASection({
  title,
  subtitle,
  buttonText,
  trustBadges,
  trackingObject = "glean_cta_bottom",
}: EmailCTASectionProps) {
  return (
    <section className="w-full">
      <div
        className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen py-16 md:py-20"
        style={{
          background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
        }}
      >
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl">
            {title}
          </h2>
          <p className="mb-8 text-lg text-blue-100">{subtitle}</p>

          <LandingEmailSignup
            variant="dark"
            ctaButtonText={buttonText}
            trackingLocation={trackingObject}
            trackingArea={TRACKING_AREAS.COMPETITIVE}
            className="mx-auto max-w-lg"
          />

          {/* Trust badges */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-blue-100">
            {trustBadges.map((badge, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <Icon visual={CheckIcon} className="h-4 w-4 text-emerald-400" />
                <span>{badge}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
