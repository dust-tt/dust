import type { ReactElement } from "react";

import { CapabilitySection } from "@app/components/home/content/Product/CapabilitySection";
import { InteractiveFeaturesSection } from "@app/components/home/content/Product/InteractiveFeaturesSection";
import { JustUseDustSection } from "@app/components/home/content/Product/JustUseDustSection";
import { ProductIntroSection } from "@app/components/home/content/Product/ProductIntroSection";
import { SecurityFeaturesSection } from "@app/components/home/content/Product/SecurityFeaturesSection";
import { TestimonialSection } from "@app/components/home/content/Product/TestimonialSection";
import { H2 } from "@app/components/home/ContentComponents";
import { FunctionsSection } from "@app/components/home/FunctionsSection";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      shape: 0,
    },
  };
}

export function Landing() {
  return (
    <>
      <ProductIntroSection />
      <div className="mt-16">
        <CapabilitySection />
      </div>
      <div className="mt-16">
        <InteractiveFeaturesSection />
      </div>
      <div className="mt-16">
        <SecurityFeaturesSection />
      </div>
      <div className="mt-16 w-full">
        <div className="mb-8 flex max-w-4xl flex-col gap-6 text-left sm:gap-2">
          <H2 className="text-left text-3xl font-medium md:text-4xl xl:text-5xl">
            Driving AI ROI Together
          </H2>
        </div>
        <TestimonialSection
          quote="Dust is the most impactful software we've adopted since building Clay. It delivers immediate value while continuously getting smarter and more valuable over time"
          author={{
            name: "Everett Berry",
            title: "Head of GTM Engineering at Clay",
          }}
          company={{
            logo: "/static/landing/logos/color/clay_white.png",
            alt: "Clay logo",
          }}
          bgColor="bg-green-600"
          textColor="text-white"
        />
      </div>
      <div className="mt-16">
        <FunctionsSection />
      </div>
      <div className="mt-16">
        <JustUseDustSection />
      </div>
    </>
  );
}

export default function Home() {
  return <Landing />;
}

Home.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
