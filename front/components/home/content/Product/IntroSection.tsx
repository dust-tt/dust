import { HeroOfficeSection } from "@app/components/home/content/Product/HeroOfficeSection";
import { HomeAgentsImproveSection } from "@app/components/home/content/Product/HomeAgentsImproveSection";
import { HomeAIOperatorsCTASection } from "@app/components/home/content/Product/HomeAIOperatorsCTASection";
import { HomeCoordinatedSection } from "@app/components/home/content/Product/HomeCoordinatedSection";
import { HomeCustomerStatsSection } from "@app/components/home/content/Product/HomeCustomerStatsSection";
import { HomeNewsSection } from "@app/components/home/content/Product/HomeNewsSection";
import { HomeQuotesSection } from "@app/components/home/content/Product/HomeQuotesSection";
import { HomeSecuritySection } from "@app/components/home/content/Product/HomeSecuritySection";
import { HomeTeamSportSection } from "@app/components/home/content/Product/HomeTeamSportSection";
import { HomeTeamUsageSection } from "@app/components/home/content/Product/HomeTeamUsageSection";
import { HomeTrustedSection } from "@app/components/home/content/Product/HomeTrustedSection";

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
  },
];

const HOME_REVEAL_CSS = `
  .home-reveal {
    opacity: 0;
    transition-property: opacity, transform, letter-spacing;
    transition-duration: 500ms;
    transition-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
  }
  .home-reveal-up { transform: translate3d(0, 14px, 0); }
  .home-reveal-right { transform: translate3d(-6px, 0, 0); }
  .home-reveal-photo { opacity: 0; transform: scale(1.04); transition-duration: 700ms; }
  .home-reveal-running { opacity: 0.35; letter-spacing: 0.06em; transition-duration: 700ms; transition-timing-function: cubic-bezier(0.165, 0.84, 0.44, 1); }
  .home-reveal-in.home-reveal-up,
  .home-reveal-in.home-reveal-right,
  .home-reveal-in.home-reveal-photo { opacity: 1; transform: none; }
  .home-reveal-in.home-reveal-running { opacity: 1; letter-spacing: normal; }
  @media (prefers-reduced-motion: reduce) {
    .home-reveal,
    .home-reveal-up,
    .home-reveal-right,
    .home-reveal-photo,
    .home-reveal-running {
      opacity: 1 !important;
      transform: none !important;
      letter-spacing: normal !important;
      transition: none !important;
    }
  }
`;

export function IntroSection() {
  return (
    <section className="w-full">
      <style dangerouslySetInnerHTML={{ __html: HOME_REVEAL_CSS }} />
      <div className="flex flex-col">
        <HeroOfficeSection />
        <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] flex w-screen flex-col">
          <HomeTrustedSection />
          <HomeCoordinatedSection />
          <HomeQuotesSection quotes={QUOTES} />
          <HomeTeamSportSection />
          <HomeAgentsImproveSection />
          <HomeTeamUsageSection />
          <HomeCustomerStatsSection />
          <HomeNewsSection />
          <HomeSecuritySection />
          <HomeAIOperatorsCTASection />
        </div>
      </div>
    </section>
  );
}
