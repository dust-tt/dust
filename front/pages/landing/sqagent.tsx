import type { ReactElement } from "react";

import { sqAgentConfig } from "@app/components/home/content/SqAgent/config/sqAgentConfig";
import { FeatureSection } from "@app/components/home/content/SqAgent/FeatureSection";
import { SqAgentHeroSection } from "@app/components/home/content/SqAgent/SqAgentHeroSection";
import { SqCtaSection } from "@app/components/home/content/SqAgent/SqCtaSection";
import { SqTestimonialsSection } from "@app/components/home/content/SqAgent/SqTestimonialsSection";
import { H4 } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import TrustedBy from "@app/components/home/TrustedBy";

export async function getStaticProps() {
  return {
    props: {
      shape: 0,
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

      {/* Trusted By Section */}
      <div className="mt-8">
        <H4 className="mb-6 w-full text-center text-muted-foreground">
          {sqAgentConfig.trustedByTitle}
        </H4>
        <TrustedBy showTitle={false} logoSet="landing" />
      </div>

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
