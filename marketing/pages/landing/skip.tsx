import { AgentBuilderVisual } from "@marketing/components/home/content/Skip/AgentBuilderVisual";
import { CareerAdvantageVisual } from "@marketing/components/home/content/Skip/CareerAdvantageVisual";
import { skipConfig } from "@marketing/components/home/content/Skip/config/skipConfig";
import { FeatureSection } from "@marketing/components/home/content/SqAgent/FeatureSection";
import { SqAgentHeroSection } from "@marketing/components/home/content/SqAgent/SqAgentHeroSection";
import { SqCtaSection } from "@marketing/components/home/content/SqAgent/SqCtaSection";
import { SqTestimonialsSection } from "@marketing/components/home/content/SqAgent/SqTestimonialsSection";
import type { LandingLayoutProps } from "@marketing/components/home/LandingLayout";
import LandingLayout from "@marketing/components/home/LandingLayout";
import { PageMetadata } from "@marketing/components/home/PageMetadata";
import type { ReactElement } from "react";

const SECTION_VISUALS = [<CareerAdvantageVisual />, <AgentBuilderVisual />];

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
      <div className="pb-24">
        <SqCtaSection
          title={skipConfig.cta.title}
          subtitle={skipConfig.cta.subtitle}
          ctaText={skipConfig.cta.ctaText}
          ctaLink={skipConfig.cta.ctaLink}
        />
      </div>
    </>
  );
}

SkipLandingPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
