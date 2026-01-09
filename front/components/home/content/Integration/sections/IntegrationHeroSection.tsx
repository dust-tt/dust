import { Button, ExternalLinkIcon, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";

import { Grid, H1, P } from "@app/components/home/ContentComponents";
import { cn } from "@app/components/poke/shadcn/lib/utils";
import {
  getIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";

import type { IntegrationBase } from "../types";

interface IntegrationHeroSectionProps {
  integration: IntegrationBase;
  seoTitle: string;
  seoSubtitle: string;
}

export function IntegrationHeroSection({
  integration,
  seoTitle,
  seoSubtitle,
}: IntegrationHeroSectionProps) {
  const IconComponent = getIcon(integration.icon);
  const typeLabel =
    integration.type === "both"
      ? "Tools & Data Connection"
      : integration.type === "mcp_server"
        ? "Tools"
        : "Data Connection";

  return (
    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col px-6 pb-12 pt-16 md:pb-16 md:pt-24">
        <Grid>
          <div
            className={cn(
              "col-span-12 flex flex-col items-center justify-center text-center",
              "lg:col-span-10 lg:col-start-2",
              "xl:col-span-8 xl:col-start-3"
            )}
          >
            {/* Integration icon and type badge */}
            <div className="mb-6 flex flex-col items-center gap-4">
              <ResourceAvatar icon={IconComponent} size="lg" />
              <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                {typeLabel}
              </span>
            </div>

            <H1
              mono
              className="mb-4 text-center text-4xl font-medium leading-tight text-foreground md:text-5xl"
            >
              {seoTitle}
            </H1>

            <P size="lg" className="mb-4 max-w-2xl text-muted-foreground">
              {seoSubtitle}
            </P>

            {integration.authorizationRequired && (
              <P size="sm" className="mb-8 text-muted-foreground">
                Requires authorization to connect
              </P>
            )}

            {/* CTAs */}
            <div className="flex flex-col gap-4 sm:flex-row">
              <Link href="/home" shallow>
                <Button
                  variant="highlight"
                  size="md"
                  label="Get started with Dust"
                  icon={RocketIcon}
                  onClick={withTracking(
                    TRACKING_AREAS.HOME,
                    `integration_${integration.slug}_hero_cta_primary`
                  )}
                />
              </Link>
              {integration.documentationUrl && (
                <Link
                  href={integration.documentationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    variant="outline"
                    size="md"
                    label="View documentation"
                    icon={ExternalLinkIcon}
                    onClick={withTracking(
                      TRACKING_AREAS.HOME,
                      `integration_${integration.slug}_hero_cta_docs`
                    )}
                  />
                </Link>
              )}
            </div>
          </div>
        </Grid>
      </div>
    </div>
  );
}
