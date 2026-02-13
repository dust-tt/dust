import { sqAgentConfig } from "@app/components/home/content/SqAgent/config/sqAgentConfig";
import { FeatureSection } from "@app/components/home/content/SqAgent/FeatureSection";
import { SqAgentHeroSection } from "@app/components/home/content/SqAgent/SqAgentHeroSection";
import { SqCtaSection } from "@app/components/home/content/SqAgent/SqCtaSection";
import { SqTestimonialsSection } from "@app/components/home/content/SqAgent/SqTestimonialsSection";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import type { ReactElement } from "react";

export async function getStaticProps() {
  return {
    props: {
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      hideNavigation: true,
    },
  };
}

export default function SqAgentLandingPage() {
  return (
    <>
      <PageMetadata
        title="Squarespace for AI Agents | Dust"
        description="Build AI agents in minutes, not months. Dust lets you create custom AI teammates that work across all your tools—no code required."
        pathname="/landing/sqagent"
      />

      {/* Hero Section */}
      <SqAgentHeroSection
        chip={sqAgentConfig.hero.chip}
        headline={sqAgentConfig.hero.headline}
        subheadline={sqAgentConfig.hero.subheadline}
        ctaButtonText={sqAgentConfig.hero.ctaButtonText}
        testimonials={sqAgentConfig.hero.testimonials}
        videos={sqAgentConfig.hero.videos}
        usersCount={sqAgentConfig.hero.usersCount}
      />

      {/* Feature Sections */}
      {sqAgentConfig.sections.map((section, index) => (
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
        />
      ))}

      {/* Testimonials Section */}
      <SqTestimonialsSection
        title={sqAgentConfig.bottomTestimonials.title}
        subtitle={sqAgentConfig.bottomTestimonials.subtitle}
        testimonials={sqAgentConfig.bottomTestimonials.testimonials}
      />

      {/* CTA Section */}
      <SqCtaSection
        title={sqAgentConfig.cta.title}
        subtitle={sqAgentConfig.cta.subtitle}
        ctaText={sqAgentConfig.cta.ctaText}
        ctaLink={sqAgentConfig.cta.ctaLink}
      />
    </>
  );
}

SqAgentLandingPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
