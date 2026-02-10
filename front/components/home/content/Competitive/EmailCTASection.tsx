import { CheckIcon, Icon } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";
import { useCookies } from "react-cookie";

import { LandingEmailSignup } from "@app/components/home/content/Landing/LandingEmailSignup";
import { OpenDustButton } from "@app/components/home/OpenDustButton";
import { DUST_HAS_SESSION, hasSessionIndicator } from "@app/lib/cookies";
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
  const [cookies] = useCookies([DUST_HAS_SESSION], { doNotParse: true });
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(hasSessionIndicator(cookies[DUST_HAS_SESSION]));
  }, [cookies]);

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

          <div className="mx-auto max-w-lg">
            {hasSession ? (
              <OpenDustButton
                variant="highlight"
                size="md"
                trackingArea={TRACKING_AREAS.COMPETITIVE}
                trackingObject={`${trackingObject}_open_dust`}
                showWelcome
              />
            ) : (
              <LandingEmailSignup
                variant="dark"
                ctaButtonText={buttonText}
                trackingLocation={trackingObject}
                trackingArea={TRACKING_AREAS.COMPETITIVE}
              />
            )}
          </div>

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
