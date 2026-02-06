import { Button } from "@dust-tt/sparkle";

import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { appendUTMParams } from "@app/lib/utils/utm";

interface LandingCtaSectionProps {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  trackingLocation: string;
}

export function LandingCtaSection({
  title,
  subtitle,
  ctaText,
  ctaLink,
  trackingLocation,
}: LandingCtaSectionProps) {
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
          <Button
            variant="highlight"
            size="md"
            label={ctaText}
            onClick={withTracking(
              TRACKING_AREAS.HOME,
              `${trackingLocation}_bottom_cta`,
              () => {
                // eslint-disable-next-line react-hooks/immutability
                window.location.href = appendUTMParams(ctaLink);
              }
            )}
          />
        </div>
      </div>
    </section>
  );
}
