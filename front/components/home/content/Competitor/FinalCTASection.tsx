import { Button, RocketIcon } from "@dust-tt/sparkle";

import { H2, P } from "@app/components/home/ContentComponents";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";

import type { FinalCTAConfig } from "./types";

interface FinalCTASectionProps {
  config: FinalCTAConfig;
  trackingPrefix?: string;
}

export function FinalCTASection({
  config,
  trackingPrefix = "competitor",
}: FinalCTASectionProps) {
  return (
    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-blue-50 py-12 md:py-16">
      <div className="mx-auto max-w-3xl px-6 py-16 text-center md:py-20">
        <H2 className="mb-4 text-center text-3xl font-semibold text-foreground md:text-4xl lg:text-5xl">
          {config.title}
        </H2>
        {config.subtitle && (
          <P size="lg" className="mb-8 text-muted-foreground">
            {config.subtitle}
          </P>
        )}

        <div className="mb-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button
            variant="highlight"
            size="md"
            label={config.primaryCTA.label}
            icon={RocketIcon}
            href={config.primaryCTA.href}
            onClick={withTracking(
              TRACKING_AREAS.HOME,
              `${trackingPrefix}_final_cta_primary`
            )}
          />
          <Button
            variant="outline"
            size="md"
            label={config.secondaryCTA.label}
            href={config.secondaryCTA.href}
            onClick={withTracking(
              TRACKING_AREAS.HOME,
              `${trackingPrefix}_final_cta_secondary`
            )}
          />
        </div>

        {config.trustText && (
          <P size="sm" className="text-muted-foreground">
            {config.trustText}
          </P>
        )}
      </div>
    </div>
  );
}
