import { Button, RocketIcon } from "@dust-tt/sparkle";
import Image from "next/image";
import Link from "next/link";

import { Grid, H1, P } from "@app/components/home/ContentComponents";
import TrustedBy from "@app/components/home/TrustedBy";
import { cn } from "@app/components/poke/shadcn/lib/utils";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";

import type { HeroConfig } from "./types";

interface CompetitorHeroSectionProps {
  config: HeroConfig;
  competitorName?: string;
  competitorLogo?: string;
  trackingPrefix?: string;
}

export function CompetitorHeroSection({
  config,
  competitorLogo,
  competitorName,
  trackingPrefix = "competitor",
}: CompetitorHeroSectionProps) {
  return (
    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-blue-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col px-6 pb-12 pt-16 md:pb-16 md:pt-24">
        <Grid>
          <div
            className={cn(
              "col-span-12 flex flex-col items-center justify-center text-center",
              "lg:col-span-10 lg:col-start-2",
              "xl:col-span-8 xl:col-start-3"
            )}
          >
            {/* Logo comparison */}
            <div className="mb-8 flex items-center gap-6">
              <Image
                src="/static/landing/logos/dust/Dust_Logo.svg"
                alt="Dust"
                width={100}
                height={32}
                className="h-8 w-auto"
              />
              <span className="text-2xl font-light text-muted-foreground">
                vs
              </span>
              {competitorLogo ? (
                <Image
                  src={competitorLogo}
                  alt={competitorName ?? "Competitor"}
                  width={100}
                  height={32}
                  className="h-8 w-auto"
                />
              ) : (
                <span className="text-2xl font-semibold text-foreground">
                  {competitorName}
                </span>
              )}
            </div>

            <H1
              mono
              className="mb-6 text-center text-4xl font-medium leading-tight text-foreground md:text-5xl lg:text-6xl"
            >
              {config.title}
            </H1>
            <P size="lg" className="mb-10 max-w-2xl text-muted-foreground">
              {config.subtitle}
            </P>

            {/* CTAs */}
            <div className="flex flex-col gap-4 sm:flex-row">
              <Link href={config.primaryCTA.href} shallow>
                <Button
                  variant="highlight"
                  size="md"
                  label={config.primaryCTA.label}
                  icon={RocketIcon}
                  onClick={withTracking(
                    TRACKING_AREAS.HOME,
                    `${trackingPrefix}_hero_cta_primary`
                  )}
                />
              </Link>
              <Link href={config.secondaryCTA.href} shallow>
                <Button
                  variant="outline"
                  size="md"
                  label={config.secondaryCTA.label}
                  onClick={withTracking(
                    TRACKING_AREAS.HOME,
                    `${trackingPrefix}_hero_cta_secondary`
                  )}
                />
              </Link>
            </div>
          </div>

          {/* Trusted By - using existing component */}
          <TrustedBy logoSet="default" size="large" />
        </Grid>
      </div>
    </div>
  );
}
