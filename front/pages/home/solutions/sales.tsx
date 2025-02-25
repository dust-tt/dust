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
} from "@app/components/home/content/Solutions/configs/salesConfig";
import { CustomerStoriesSection } from "@app/components/home/content/Solutions/CustomerStoriesSection";
import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import { HeroSection } from "@app/components/home/content/Solutions/HeroSection";
import { UseCasesSection } from "@app/components/home/content/Solutions/UseCasesSection";
import {
  CarousselContentBlock,
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
import { classNames } from "@app/lib/utils";

export async function getServerSideProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.octahedron),
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

const GRID_SECTION_CLASSES = classNames(
  "flex flex-col gap-8",
  "col-span-12",
  "lg:col-span-12 lg:col-start-1",
  "xl:col-span-12 xl:col-start-1",
  "2xl:col-start-1"
);

export default function Sales() {
  return (
    <>
      <div className="container flex w-full flex-col gap-0 px-2 py-2 pb-12">
        <HeroSection
          {...Hero}
          fromColor={pageSettings.from}
          toColor={pageSettings.to}
        />
        <Grid>
          <div className={GRID_SECTION_CLASSES}>
            <BenefitsSection
              benefits={Benefits}
              fromColor={pageSettings.from}
              toColor={pageSettings.to}
            />
            <MetricSection {...Metrics} />
          </div>
          <div className={GRID_SECTION_CLASSES}>
            <UseCasesSection
              useCase={UseCases}
              fromColor={pageSettings.from}
              toColor={pageSettings.to}
            />
          </div>
          <div className={GRID_SECTION_CLASSES}>
            <DemoVideoSection
              demoVideo={DemoVideo}
              fromColor={pageSettings.from}
              toColor={pageSettings.to}
            />
          </div>
          <div className={GRID_SECTION_CLASSES}>
            <QuoteSection {...Quote} />
            <CustomerStoriesSection
              title="Customer stories"
              stories={Stories}
              fromColor={pageSettings.from}
              toColor={pageSettings.to}
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
                    />
                  </Link>
                )}
                {Hero.ctaButtons.secondary && (
                  <Button
                    variant="outline"
                    size="md"
                    label={Hero.ctaButtons.secondary.label}
                    href={Hero.ctaButtons.secondary.href}
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

Sales.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};

export function SalesCaroussel() {
  return (
    <CarousselContentBlock
      image={pageSettings.image}
      title={pageSettings.uptitle}
      from={pageSettings.from}
      to={pageSettings.to}
      bulletPoints={pageSettings.bulletPoints}
      quote={Quote}
      border="border-pink-100/60"
      href="/home/solutions/sales"
    />
  );
}
