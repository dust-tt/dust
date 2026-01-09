import { Button, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import type { FC } from "react";

import { Grid, H2, P } from "@app/components/home/ContentComponents";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";

import type { FinalCTAConfig } from "./types";

interface FinalCTASectionProps {
  config: FinalCTAConfig;
  competitorName?: string;
  trackingPrefix?: string;
}

export const FinalCTASection: FC<FinalCTASectionProps> = ({
  config,
  trackingPrefix = "competitor",
}) => {
  return (
    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-blue-50 py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-6">
        <Grid>
          <div className="col-span-12">
            <div className="px-6 py-16 md:px-12 md:py-20">
              <div className="mx-auto max-w-3xl text-center">
                <H2 className="mb-4 text-center text-3xl font-semibold text-foreground md:text-4xl lg:text-5xl">
                  {config.title}
                </H2>
                {config.subtitle && (
                  <P size="lg" className="mb-8 text-muted-foreground">
                    {config.subtitle}
                  </P>
                )}

                <div className="mb-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Link href={config.primaryCTA.href} shallow={true}>
                    <Button
                      variant="highlight"
                      size="md"
                      label={config.primaryCTA.label}
                      icon={RocketIcon}
                      onClick={withTracking(
                        TRACKING_AREAS.HOME,
                        `${trackingPrefix}_final_cta_primary`
                      )}
                    />
                  </Link>
                  <Link href={config.secondaryCTA.href} shallow={true}>
                    <Button
                      variant="outline"
                      size="md"
                      label={config.secondaryCTA.label}
                      onClick={withTracking(
                        TRACKING_AREAS.HOME,
                        `${trackingPrefix}_final_cta_secondary`
                      )}
                    />
                  </Link>
                </div>

                {config.trustText && (
                  <P size="sm" className="text-muted-foreground">
                    {config.trustText}
                  </P>
                )}
              </div>
            </div>
          </div>
        </Grid>
      </div>
    </div>
  );
};
