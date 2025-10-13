import { Button, Chip } from "@dust-tt/sparkle";
import Link from "next/link";
import type { ReactElement } from "react";

import { CustomerStoriesSection } from "@app/components/home/content/Solutions/CustomerStoriesSection";
import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import { Grid, H1, H2, H3, P } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import TrustedBy from "@app/components/home/TrustedBy";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { classNames } from "@app/lib/utils";

import type { IndustryPageConfig, SectionType } from "./configs/utils";
import { getEnabledSections } from "./configs/utils";

const GRID_SECTION_CLASSES = classNames(
  "flex flex-col gap-16",
  "col-span-12",
  "lg:col-span-12 lg:col-start-1",
  "xl:col-span-12 xl:col-start-1",
  "2xl:col-start-1"
);

interface IndustryTemplateProps {
  config: IndustryPageConfig;
  trackingPrefix?: string;
}

// Hero Section Component
const HeroSection = ({
  config,
  trackingPrefix,
}: {
  config: NonNullable<IndustryPageConfig["hero"]>;
  trackingPrefix?: string;
}) => (
  <div className="container flex w-full flex-col px-6 pt-8 md:px-4 md:pt-24">
    <Grid className="gap-x-4 lg:gap-x-8">
      <div className="col-span-12 flex flex-col justify-center py-4 text-left lg:col-span-6 lg:col-start-1">
        <div className="mb-4">
          <Chip
            label={config.chip.label}
            color={config.chip.color}
            size="sm"
            icon={config.chip.icon}
          />
        </div>
        <H1
          mono
          className="mb-4 text-4xl font-medium leading-tight md:text-5xl lg:text-6xl xl:text-7xl"
        >
          {config.title}
        </H1>
        <P size="lg" className="pb-6 text-muted-foreground md:max-w-lg md:pb-8">
          {config.description}
        </P>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Link href={config.ctaButtons.primary.href} shallow={true}>
            <Button
              variant="highlight"
              size="md"
              label={config.ctaButtons.primary.label}
              className="w-full sm:w-auto"
              onClick={withTracking(
                TRACKING_AREAS.INDUSTRY,
                `${trackingPrefix ?? "default"}_hero_cta_primary`
              )}
            />
          </Link>
          <Button
            variant="outline"
            size="md"
            label={config.ctaButtons.secondary.label}
            href={config.ctaButtons.secondary.href}
            className="w-full sm:w-auto"
            onClick={withTracking(
              TRACKING_AREAS.INDUSTRY,
              `${trackingPrefix ?? "default"}_hero_cta_secondary`
            )}
          />
        </div>
      </div>

      {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
      {(config.testimonialCard || config.heroImage) && (
        <div className="relative col-span-12 mt-8 py-2 lg:col-span-6 lg:col-start-7 lg:mt-0">
          {config.decorativeShapes?.topRight && (
            <div className="absolute -right-6 -top-10 -z-10 hidden h-24 w-24 lg:block">
              <img
                src={config.decorativeShapes.topRight}
                alt="Decorative shape"
                className="h-full w-full"
              />
            </div>
          )}
          {config.decorativeShapes?.bottomLeft && (
            <div className="absolute -bottom-10 left-8 -z-20 hidden h-48 w-48 lg:block">
              <img
                src={config.decorativeShapes.bottomLeft}
                alt="Decorative shape"
                className="h-full w-full"
              />
            </div>
          )}

          <div className="flex h-full w-full items-center justify-center">
            <div className="relative w-full max-w-xl xl:max-w-2xl">
              {config.heroImage ? (
                <div className="relative z-10 mx-auto flex w-full items-center justify-center">
                  <img
                    src={config.heroImage.src}
                    alt={config.heroImage.alt}
                    className="h-auto w-full max-w-lg rounded-2xl object-contain lg:max-w-xl xl:max-w-2xl"
                  />
                </div>
              ) : config.testimonialCard ? (
                <div
                  className={classNames(
                    "relative z-10 mx-auto flex w-full flex-col justify-between rounded-2xl p-8 sm:p-10 lg:p-12",
                    config.testimonialCard.bgColor
                  )}
                >
                  <div className="flex flex-1 flex-col justify-center">
                    <H2
                      mono
                      className={classNames(
                        "mb-6 text-xl leading-relaxed sm:mb-8 sm:text-2xl lg:text-3xl xl:text-4xl",
                        config.testimonialCard.textColor
                      )}
                    >
                      "{config.testimonialCard.quote}"
                    </H2>
                  </div>
                  <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                    <div className="flex flex-col gap-1">
                      <P
                        size="md"
                        className={classNames(
                          "font-medium",
                          config.testimonialCard.textColor
                        )}
                      >
                        {config.testimonialCard.author.name}
                      </P>
                      <P
                        size="md"
                        className={
                          config.testimonialCard.textColor === "text-white"
                            ? "text-green-100"
                            : "text-muted-foreground"
                        }
                      >
                        {config.testimonialCard.author.title}
                      </P>
                    </div>
                    <div className="flex sm:justify-end">
                      <img
                        src={config.testimonialCard.company.logo}
                        alt={config.testimonialCard.company.alt}
                        className="h-14 w-auto sm:h-16 lg:h-20"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Grid>
  </div>
);

// AI Agents Section Component
const AIAgentsSection = ({
  config,
}: {
  config: NonNullable<IndustryPageConfig["aiAgents"]>;
}) => (
  <div
    className={classNames(
      "rounded-2xl py-12 md:py-16",
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      config.bgColor || "bg-gray-50"
    )}
  >
    <div className="container mx-auto max-w-4xl px-6">
      <div className="flex flex-col items-center gap-6 text-center">
        <H2
          mono
          className="text-center text-3xl sm:text-4xl md:text-5xl lg:text-6xl"
        >
          {config.title}
        </H2>
        <P size="lg" className="max-w-3xl text-center text-muted-foreground">
          {config.description}
        </P>
      </div>
    </div>
  </div>
);

// Pain Points Section Component
const PainPointsSection = ({
  config,
}: {
  config: NonNullable<IndustryPageConfig["painPoints"]>;
}) => (
  <div className="py-12 md:py-16">
    <div className="container mx-auto px-6">
      <H2 className="mb-8 text-left text-3xl sm:text-4xl md:mb-12 md:text-5xl lg:text-6xl">
        {config.title}
      </H2>
      <div className="grid gap-6 sm:gap-8 md:grid-cols-3">
        {config.painPoints.map((point, index) => (
          <div key={index} className="rounded-2xl bg-gray-50 p-8">
            <div className="mb-6 flex h-12 w-12 items-center justify-center">
              <img
                src={point.icon}
                alt={`${point.color} geometric shape`}
                className="h-full w-full object-contain"
              />
            </div>
            <H3 className="mb-4">{point.title}</H3>
            <P size="sm" className="text-muted-foreground">
              {point.description}
            </P>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Use Case Block Component
const UseCaseBlock = ({
  useCase,
  imageFirst = true,
}: {
  useCase: NonNullable<IndustryPageConfig["dustInAction"]>["useCases"][0];
  imageFirst?: boolean;
}) => (
  <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
    {/* Image Block */}
    <div
      className={classNames(
        "flex items-center justify-center",
        imageFirst ? "order-1 lg:order-1" : "order-1 lg:order-2"
      )}
    >
      <div className="w-full">
        <div
          className={classNames(
            "relative w-full overflow-hidden rounded-lg",
            useCase.bgColor
          )}
        >
          <img
            src={useCase.image}
            alt={`${useCase.title} Features`}
            className="h-auto w-full object-contain"
          />
        </div>
      </div>
    </div>

    {/* Content Block */}
    <div
      className={classNames(
        "flex flex-col justify-center",
        imageFirst ? "order-2 lg:order-2" : "order-2 lg:order-1"
      )}
    >
      <H3 className="mb-6">{useCase.title}</H3>
      <div className="space-y-6">
        {useCase.features.map((feature, index) => (
          <div key={index}>
            <div className="flex items-start gap-3">
              <div
                className={classNames(
                  "mt-1 h-6 w-6 flex-shrink-0",
                  feature.icon
                )}
              ></div>
              <div>
                <P size="sm" className="font-medium">
                  {feature.title}
                </P>
                <P size="sm" className="text-muted-foreground">
                  {feature.description}
                </P>
              </div>
            </div>
            {index < useCase.features.length - 1 && (
              <hr className="mt-6 border-gray-200" />
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Dust in Action Section Component
const DustInActionSection = ({
  config,
}: {
  config: NonNullable<IndustryPageConfig["dustInAction"]>;
}) => (
  <div className="py-12 md:py-16">
    <div className="container mx-auto px-6">
      <div className="mb-12 flex flex-col text-left">
        <H2 className="mb-2 text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
          {config.title}
        </H2>
      </div>

      <div className="space-y-16">
        {config.useCases.map((useCase, index) => (
          <UseCaseBlock
            key={index}
            useCase={useCase}
            imageFirst={index % 2 === 0}
          />
        ))}
      </div>
    </div>
  </div>
);

// Impact Metrics Section Component
const ImpactMetricsSection = ({
  config,
}: {
  config: NonNullable<IndustryPageConfig["impactMetrics"]>;
}) => (
  <div
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    className={classNames("rounded-xl py-20", config.bgColor || "bg-blue-50")}
  >
    <div className="container mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
      <div
        className={`flex flex-col flex-wrap items-start justify-center md:flex-row ${
          config.metrics.length === 2
            ? "gap-8 md:gap-20 lg:gap-32"
            : "gap-6 md:gap-12 lg:gap-20"
        }`}
      >
        {config.metrics.map((metric, index) => (
          <div
            key={index}
            className="flex w-full flex-col items-center justify-center md:flex-1 lg:items-start"
          >
            <div className="text-center lg:text-left">
              <div className="text-5xl font-bold text-gray-900 md:text-8xl">
                {metric.value}
                {metric.unit}
              </div>
              <H3 className="mb-2 text-xl md:text-2xl">{metric.type}</H3>
              <P className="text-sm text-muted-foreground md:text-base">
                {metric.description}
              </P>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Testimonial Section Component
const TestimonialSection = ({
  config,
}: {
  config: NonNullable<IndustryPageConfig["testimonial"]>;
}) => (
  <div
    className={classNames(
      "rounded-xl py-8 md:py-16",
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      config.bgColor || "bg-green-600"
    )}
  >
    <div className="container mx-auto px-6 md:px-8 lg:px-12">
      <div className="flex flex-col justify-center">
        <H1
          className={classNames(
            "mb-10 text-3xl !font-normal sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl",
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            config.textColor || "text-white"
          )}
        >
          "{config.quote}"
        </H1>
        <div className="flex flex-col gap-4 pt-8 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
          <div>
            <P
              size="lg"
              className={classNames(
                "font-medium",
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                config.textColor || "text-white"
              )}
            >
              {config.author.name}
            </P>
            <P
              size="lg"
              className={
                config.textColor === "text-white"
                  ? "text-green-100"
                  : "text-muted-foreground"
              }
            >
              {config.author.title}
            </P>
          </div>
          <div className="flex sm:flex-shrink-0 sm:justify-end">
            <img
              src={config.company.logo}
              alt={config.company.alt}
              className="h-16 w-auto sm:h-20"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Just Use Dust Section Component
const JustUseDustSection = ({
  config,
  trackingPrefix,
}: {
  config: NonNullable<IndustryPageConfig["justUseDust"]>;
  trackingPrefix?: string;
}) => (
  <div
    className={classNames(
      "relative overflow-hidden rounded-xl py-16 md:py-20",
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      config.bgColor || "bg-blue-50"
    )}
  >
    {config.decorativeShapes && (
      <>
        <div className="absolute left-0 top-0 h-48 w-48 -translate-x-1/3 -translate-y-1/3 rounded-full bg-brand-pink-rose" />
        <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/3 translate-x-1/3 rotate-45 bg-brand-electric-blue" />
        <div className="absolute bottom-0 left-0 h-40 w-40 -translate-x-1/3 translate-y-1/3 rounded-full bg-brand-hunter-green" />
        <div className="absolute bottom-0 right-0 h-40 w-40 translate-x-1/3 translate-y-1/3 bg-brand-red-rose" />
      </>
    )}

    <div className="container mx-auto max-w-4xl px-6">
      <div className="relative flex flex-col items-center justify-center py-12 text-center md:py-16">
        <H2
          className={classNames(
            "mb-8 text-4xl sm:text-5xl md:text-6xl",
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            config.titleColor || "text-blue-600"
          )}
        >
          {config.title}
        </H2>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Link href={config.ctaButtons.primary.href} passHref legacyBehavior>
            <Button
              variant="highlight"
              size="md"
              label={config.ctaButtons.primary.label}
              className="w-full sm:w-auto"
              onClick={withTracking(
                TRACKING_AREAS.INDUSTRY,
                `${trackingPrefix ?? "default"}_footer_cta_primary`
              )}
            />
          </Link>
          <Link href={config.ctaButtons.secondary.href} passHref legacyBehavior>
            <Button
              variant="outline"
              size="md"
              label={config.ctaButtons.secondary.label}
              className="w-full sm:w-auto"
              onClick={withTracking(
                TRACKING_AREAS.INDUSTRY,
                `${trackingPrefix ?? "default"}_footer_cta_secondary`
              )}
            />
          </Link>
        </div>
      </div>
    </div>
  </div>
);

// Main Industry Template Component
export default function IndustryTemplate({
  config,
  trackingPrefix,
}: IndustryTemplateProps) {
  // Get the list of enabled sections in the specified order
  const enabledSections = getEnabledSections(config.layout);

  // Function to render a section based on its type
  const renderSection = (sectionType: SectionType) => {
    switch (sectionType) {
      case "hero":
        return config.hero ? (
          <HeroSection
            key="hero"
            config={config.hero}
            trackingPrefix={trackingPrefix}
          />
        ) : null;

      case "aiAgents":
        return config.aiAgents ? (
          <AIAgentsSection key="aiAgents" config={config.aiAgents} />
        ) : null;

      case "trustedBy":
        return config.trustedBy ? (
          <TrustedBy
            key="trustedBy"
            title={config.trustedBy.title}
            logoSet={config.trustedBy.logoSet as any}
          />
        ) : null;

      case "painPoints":
        return config.painPoints ? (
          <PainPointsSection key="painPoints" config={config.painPoints} />
        ) : null;

      case "dustInAction":
        return config.dustInAction ? (
          <DustInActionSection
            key="dustInAction"
            config={config.dustInAction}
          />
        ) : null;

      case "impactMetrics":
        return config.impactMetrics ? (
          <ImpactMetricsSection
            key="impactMetrics"
            config={config.impactMetrics}
          />
        ) : null;

      case "demoVideo":
        return config.demoVideo ? (
          <Grid key="demoVideo">
            <div className={GRID_SECTION_CLASSES}>
              <DemoVideoSection
                demoVideo={{
                  ...config.demoVideo,
                  showCaptions: config.demoVideo.showCaptions ?? false,
                }}
              />
            </div>
          </Grid>
        ) : null;

      case "trustedBySecond":
        return config.trustedBySecond ? (
          <TrustedBy
            key="trustedBySecond"
            title={config.trustedBySecond.title}
            logoSet={config.trustedBySecond.logoSet as any}
          />
        ) : null;

      case "testimonial":
        return config.testimonial ? (
          <TestimonialSection key="testimonial" config={config.testimonial} />
        ) : null;

      case "customerStories":
        return config.customerStories ? (
          <Grid key="customerStories">
            <div className={GRID_SECTION_CLASSES}>
              <CustomerStoriesSection
                title={config.customerStories.title}
                stories={config.customerStories.stories}
              />
            </div>
          </Grid>
        ) : null;

      case "justUseDust":
        return config.justUseDust ? (
          <JustUseDustSection
            key="justUseDust"
            config={config.justUseDust}
            trackingPrefix={trackingPrefix}
          />
        ) : null;

      default:
        console.warn(`Unknown section type: ${sectionType}`);
        return null;
    }
  };

  return (
    <div className="container flex w-full flex-col gap-16 px-2 py-2 pb-12">
      {enabledSections.map(renderSection).filter(Boolean)}
    </div>
  );
}

IndustryTemplate.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
