import { AgentBuilderVisual } from "@app/components/home/content/Skip/AgentBuilderVisual";
import { CareerAdvantageVisual } from "@app/components/home/content/Skip/CareerAdvantageVisual";
import { skipConfig } from "@app/components/home/content/Skip/config/skipConfig";
import { FeatureSection } from "@app/components/home/content/SqAgent/FeatureSection";
import { SqAgentHeroSection } from "@app/components/home/content/SqAgent/SqAgentHeroSection";
import { SqCtaSection } from "@app/components/home/content/SqAgent/SqCtaSection";
import { SqTestimonialsSection } from "@app/components/home/content/SqAgent/SqTestimonialsSection";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import type { ReactElement } from "react";

const SECTION_VISUALS = [<CareerAdvantageVisual />, <AgentBuilderVisual />];

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function getStaticProps() {
  return {
    props: {
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      hideNavigation: true,
    },
  };
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function SkipLandingPage() {
  return (
    <>
      <PageMetadata
        title="Welcome Skip Listeners | Dust"
        description="Build AI agents in minutes, not months. Dust lets you create custom AI teammates that work across all your tools—no code required."
        pathname="/landing/skip"
      />

      {/* Hero Section */}
      <SqAgentHeroSection
        chip={skipConfig.hero.chip}
        headline={skipConfig.hero.headline}
        subheadline={skipConfig.hero.subheadline}
        ctaButtonText={skipConfig.hero.ctaButtonText}
        testimonials={skipConfig.hero.testimonials}
        videos={skipConfig.hero.videos}
        usersCount={skipConfig.hero.usersCount}
      />

      {/* Feature Sections */}
      {skipConfig.sections.map((section, index) => (
        <FeatureSection
          key={index}
          title={section.title}
          titleHighlight={section.titleHighlight}
          description={section.description}
          features={section.features}
          image={section.image}
          imagePosition={section.imagePosition}
          backgroundColor={section.backgroundColor}
          colorIndex={index}
          visualComponent={SECTION_VISUALS[index]}
        />
      ))}

      {/* Testimonials Section */}
      <SqTestimonialsSection
        title={skipConfig.bottomTestimonials.title}
        subtitle={skipConfig.bottomTestimonials.subtitle}
        testimonials={skipConfig.bottomTestimonials.testimonials}
      />

      {/* CTA Section */}
      <SqCtaSection
        title={skipConfig.cta.title}
        subtitle={skipConfig.cta.subtitle}
        ctaText={skipConfig.cta.ctaText}
        ctaLink={skipConfig.cta.ctaLink}
      />
    </>
  );
}

SkipLandingPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
