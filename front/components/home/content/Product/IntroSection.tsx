import { Button, PlayIcon, RocketIcon } from "@dust-tt/sparkle";
import Image from "next/image";
import Link from "next/link";

import { ScrollProgressSection } from "@app/components/home/content/Product/ScrollProgressSection";
import { ValuePropSection } from "@app/components/home/content/Product/ValuePropSection";
import {
  H1,
  P,
  TeamFeatureSection,
} from "@app/components/home/ContentComponents";
import { FunctionsSection } from "@app/components/home/FunctionsSection";
import TrustedBy from "@app/components/home/TrustedBy";

const HeroContent = () => {
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center sm:gap-2 sm:px-6">
      <H1 className="text-center font-sans text-4xl font-bold leading-[1.15] sm:text-5xl sm:leading-[1.15] md:text-6xl md:leading-[1.1] lg:text-[72px] lg:leading-[1.1]">
        Transform how work
        <br />
        gets done
      </H1>
      <P size="lg" className="text-base text-muted-foreground sm:text-lg">
        The platform to build AI agents, connected to your company knowledge,
        <br className="hidden sm:block" /> powered by the best AI models.
      </P>
      <div className="mt-4 flex flex-row justify-center gap-4">
        <Link href="/home/pricing" shallow={true}>
          <Button
            variant="highlight"
            size="md"
            label="Get started"
            icon={RocketIcon}
          />
        </Link>
        <Link href="/home/contact" shallow={true}>
          <Button variant="outline" size="md" label="Book a demo" />
        </Link>
      </div>
    </div>
  );
};

const CustomPlayButton = () => (
  <button className="flex items-center gap-3 rounded-2xl border-[1px] border-white/20 bg-slate-900/95 px-6 py-3 text-white transition-all hover:border-white/30 hover:bg-slate-900">
    <PlayIcon className="h-6 w-6" />
    <span className="text-base font-medium">Watch Dust in motion</span>
  </button>
);

const HeroVisual = () => {
  return (
    <div className="relative mt-12 w-full sm:-mt-6 md:mt-0">
      <div className="relative mx-auto aspect-video w-full max-w-[2000px] px-4">
        <Image
          src="/static/landing/header/header.png"
          alt="Dust Platform"
          fill
          className="rounded-xl object-contain"
          priority
          sizes="(max-width: 2000px) 100vw, 2000px"
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <Link
          href="#demo-video"
          className="z-10"
          onClick={(e) => {
            e.preventDefault();
            const element = document.getElementById("demo-video");
            if (element) {
              element.scrollIntoView({ behavior: "smooth" });
            }
          }}
        >
          <CustomPlayButton />
        </Link>
      </div>
    </div>
  );
};

export function IntroSection() {
  return (
    <section className="w-full">
      <div className="flex flex-col gap-12 pt-8 md:gap-16 md:pt-16 lg:gap-20 lg:pt-20">
        <div className="flex flex-col gap-16 pt-16">
          <HeroContent />
          <HeroVisual />
        </div>
        <div className="mt-12">
          <TrustedBy />
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
