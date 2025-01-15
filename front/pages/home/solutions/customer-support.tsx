import { Button } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";

import { BenefitsSection } from "@app/components/home/content/Solutions/BenefitsSection";
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

// Import from new config location
import {
  pageSettings,
  supportHero,
  supportBenefits,
  supportMetrics,
  supportUseCases,
  supportQuote,
  supportDemoVideo,
  supportStories,
  supportAssistantExamples,
} from "@app/components/home/content/Solutions/configs/supportConfig";

export async function getServerSideProps() {
  return {
    props: {
      shape: getParticleShapeIndexByName(shapeNames.octahedron),
    },
  };
}

export default function CustomerSupport() {
  return (
    <>
      <div className="container flex w-full flex-col gap-0 bg-slate-900/50 px-6 pb-12">
        <HeroSection
          {...supportHero}
          fromColor={pageSettings.from}
          toColor={pageSettings.to}
        />
        <Grid>
          <div
            className={classNames(
              "flex flex-col gap-8",
              "col-span-12",
              "lg:col-span-12 lg:col-start-1",
              "xl:col-span-12 xl:col-start-1",
              "2xl:col-start-1"
            )}
          >
            <BenefitsSection
              benefits={supportBenefits}
              fromColor={pageSettings.from}
              toColor={pageSettings.to}
            />
            <MetricSection {...supportMetrics} />
          </div>
          <div
            className={classNames(
              "flex flex-col gap-8",
              "col-span-12",
              "lg:col-span-12 lg:col-start-1",
              "xl:col-span-12 xl:col-start-1",
              "2xl:col-start-1"
            )}
          >
            <UseCasesSection
              useCase={supportUseCases}
              fromColor={pageSettings.from}
              toColor={pageSettings.to}
            />
          </div>
          <div
            className={classNames(
              "flex flex-col justify-center gap-8 pb-4",
              "col-span-12",
              "lg:col-span-12 lg:col-start-1",
              "xl:col-span-12 xl:col-start-1",
              "2xl:col-start-1"
            )}
          >
            <DemoVideoSection
              demoVideo={supportDemoVideo}
              fromColor={pageSettings.from}
              toColor={pageSettings.to}
            />
          </div>
          <div
            className={classNames(
              "flex flex-col gap-8 pb-12",
              "col-span-12",
              "lg:12 lg:col-start-1",
              "xl:col-span-12 xl:col-start-1",
              "2xl:col-start-1"
            )}
          >
            <QuoteSection {...supportQuote} />
            <CustomerStoriesSection
              title="Customer stories"
              stories={supportStories}
              fromColor={pageSettings.from}
              toColor={pageSettings.to}
            />
          </div>
          <TrustedBy />
          <div
            className={classNames(
              "col-span-12 flex flex-col items-center",
              "lg:col-span-12 lg:col-start-1",
              "xl:col-span-10 xl:col-start-2"
            )}
          >
            {supportHero.ctaButtons && (
              <div className="mt-4 flex justify-center gap-4">
                {supportHero.ctaButtons.primary && (
                  <Link
                    href={supportHero.ctaButtons.primary.href}
                    shallow={true}
                  >
                    <Button
                      variant="highlight"
                      size="md"
                      label={supportHero.ctaButtons.primary.label}
                      icon={supportHero.ctaButtons.primary.icon}
                    />
                  </Link>
                )}
                {supportHero.ctaButtons.secondary && (
                  <Button
                    variant="outline"
                    size="md"
                    label={supportHero.ctaButtons.secondary.label}
                    href={supportHero.ctaButtons.secondary.href}
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

export function CustomerCaroussel() {
  return (
    <CarousselContentBlock
      title={pageSettings.uptitle}
      subtitle={pageSettings.title}
      description={pageSettings.description}
      assistants={supportAssistantExamples}
      from={pageSettings.from}
      to={pageSettings.to}
      border="border-pink-100/60"
      href="/home/solutions/customer-support"
    />
  );
}
