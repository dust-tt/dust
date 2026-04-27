import { TeamFeatureSection } from "@app/components/home/ContentComponents";
import { HeroOfficeSection } from "@app/components/home/content/Product/HeroOfficeSection";
import { ScrollProgressSection } from "@app/components/home/content/Product/ScrollProgressSection";
import { ValuePropSection } from "@app/components/home/content/Product/ValuePropSection";
import { FunctionsSection } from "@app/components/home/FunctionsSection";
import TrustedBy from "@app/components/home/TrustedBy";

export function IntroSection() {
  return (
    <section className="w-full">
      <div className="flex flex-col gap-6 pt-24 sm:gap-6 md:gap-6 lg:gap-6">
        <HeroOfficeSection />
        <div className="mx-auto mt-8 max-w-5xl px-4">
          <TrustedBy logoSet="landing" />
        </div>
        <div className="mt-12">
          <FunctionsSection />
        </div>
        <div className="mt-12">
          <ScrollProgressSection />
        </div>
        <div className="mt-12">
          <TeamFeatureSection />
        </div>
        <div className="mt-12">
          <ValuePropSection />
        </div>
      </div>
    </section>
  );
}
