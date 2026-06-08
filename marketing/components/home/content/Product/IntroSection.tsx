import { HeroOfficeSection } from "@marketing/components/home/content/Product/HeroOfficeSection";
import { HomeAgentsImproveSection } from "@marketing/components/home/content/Product/HomeAgentsImproveSection";
import { HomeAIOperatorsCTASection } from "@marketing/components/home/content/Product/HomeAIOperatorsCTASection";
import { HomeCoordinatedSection } from "@marketing/components/home/content/Product/HomeCoordinatedSection";
import { HomeNewsSection } from "@marketing/components/home/content/Product/HomeNewsSection";
import { HomeQuotesSection } from "@marketing/components/home/content/Product/HomeQuotesSection";
import { HomeRevealStyles } from "@marketing/components/home/content/Product/HomeReveal";
import { HomeSecuritySection } from "@marketing/components/home/content/Product/HomeSecuritySection";
import { HomeTeamSportSection } from "@marketing/components/home/content/Product/HomeTeamSportSection";
import { HomeTeamUsageSection } from "@marketing/components/home/content/Product/HomeTeamUsageSection";
import { HomeTrustedSection } from "@marketing/components/home/content/Product/HomeTrustedSection";
import type { NewsItem } from "@marketing/lib/homepage_news";

const TESTIMONIAL_IMAGE = "/static/landing/people/quote-testimonial.png";

const QUOTES = [
  {
    quote:
      "Dust is the most impactful software we've adopted since building Clay.",
    authorName: "Everett Berry",
    authorRole: "Head of GTM Engineering at Clay",
    imageSrc: TESTIMONIAL_IMAGE,
    imageAlt: "Everett Berry, Head of GTM Engineering at Clay",
  },
  {
    quote: "We used to do the work. Now we build the agents that do it.",
    authorName: "Shashank Khanna",
    authorRole: "Founder in Residence of GTM Innovation at Vanta",
    imageSrc: "/static/landing/people/shashank-khanna.png",
    imageAlt: "Shashank Khanna, Founder in Residence at Vanta",
    bg: "bg-violet-50",
  },
];

interface IntroSectionProps {
  news?: NewsItem[];
}

export function IntroSection({ news }: IntroSectionProps = {}) {
  return (
    <section className="w-full">
      <HomeRevealStyles />
      <div className="flex flex-col">
        <HeroOfficeSection />
        <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] flex w-screen flex-col">
          <HomeTrustedSection />
          <HomeTeamSportSection />
          <HomeQuotesSection quotes={QUOTES} />
          <HomeCoordinatedSection />
          <HomeAgentsImproveSection />
          <HomeTeamUsageSection />
          <HomeNewsSection news={news} />
          <HomeSecuritySection />
          <HomeAIOperatorsCTASection />
        </div>
      </div>
    </section>
  );
}
