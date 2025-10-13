import { Button } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";

import { BenefitsSection } from "@app/components/home/content/Solutions/BenefitsSection";
import {
  Benefits,
  DemoVideo,
  Hero,
  Metrics,
  pageSettings,
  Quote,
  Stories,
  UseCases,
} from "@app/components/home/content/Solutions/configs/supportConfig";
import { CustomerStoriesSection } from "@app/components/home/content/Solutions/CustomerStoriesSection";
import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import { HeroSection } from "@app/components/home/content/Solutions/HeroSection";
import { UseCasesSection } from "@app/components/home/content/Solutions/UseCasesSection";
import {
  MetricSection,
  QuoteSection,
} from "@app/components/home/ContentBlocks";
import { Grid } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import {
  getParticleShapeIndexByName,
  shapeNames,
} from "@app/components/home/Particles";
import TrustedBy from "@app/components/home/TrustedBy";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { classNames } from "@app/lib/utils";

export async function getStaticProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.octahedron),
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

const GRID_SECTION_CLASSES = classNames(
  "flex flex-col gap-16",
  "col-span-12",
  "lg:col-span-12 lg:col-start-1",
  "xl:col-span-12 xl:col-start-1",
  "2xl:col-start-1"
);

export default function CustomerSupport() {
  return (
    <>
      <div className="container flex w-full flex-col gap-16 px-2 py-2 pb-12">
        <HeroSection
          {...Hero}
          accentColor={pageSettings.accentColor}
          trackingPrefix="support_hero"
        />
        <Grid>
          <div className={GRID_SECTION_CLASSES}>
            <BenefitsSection benefits={Benefits} />
          </div>
          <div className={classNames(GRID_SECTION_CLASSES, "mt-16")}>
            <MetricSection {...Metrics} />
          </div>
          <div className={GRID_SECTION_CLASSES}>
            <UseCasesSection useCase={UseCases} />
          </div>
          <div className={GRID_SECTION_CLASSES}>
            <DemoVideoSection demoVideo={DemoVideo} />
          </div>
          <div className={GRID_SECTION_CLASSES}>
            <QuoteSection {...Quote} />
          </div>
          <div className={GRID_SECTION_CLASSES}>
            <CustomerStoriesSection
              title="Customer stories"
              stories={Stories}
            />
          </div>
          <TrustedBy />
          <div className={GRID_SECTION_CLASSES}>
            {Hero.ctaButtons && (
              <div className="mt-4 flex justify-center gap-4">
                {Hero.ctaButtons.primary && (
                  <Link href={Hero.ctaButtons.primary.href} shallow={true}>
                    <Button
                      variant="highlight"
                      size="md"
                      label={Hero.ctaButtons.primary.label}
                      icon={Hero.ctaButtons.primary.icon}
                      onClick={withTracking(
                        TRACKING_AREAS.SOLUTIONS,
                        "support_footer_cta_primary"
                      )}
                    />
                  </Link>
                )}
                {Hero.ctaButtons.secondary && (
                  <Button
                    variant="outline"
                    size="md"
                    label={Hero.ctaButtons.secondary.label}
                    href={Hero.ctaButtons.secondary.href}
                    onClick={withTracking(
                      TRACKING_AREAS.SOLUTIONS,
                      "support_footer_cta_secondary"
                    )}
                  />
                )}
              </div>
            )}
          </div>
        </Grid>
      </div>
    </>
  );
}

CustomerSupport.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
