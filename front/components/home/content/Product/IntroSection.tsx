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
      <H1
        mono
        className="text-center text-5xl font-medium leading-tight md:text-6xl lg:text-7xl"
      >
        Transform how work
        <br />
        gets done
      </H1>
      <P size="lg" className="text-base text-muted-foreground sm:text-lg">
        The platform to build AI agents in minutes, connected to your company
        knowledge,
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
          <Button
            variant="primary"
            size="md"
            label="Watch Dust in motion"
            icon={PlayIcon}
            className="shadow-[0_8px_16px_-2px_rgba(0,0,0,0.3),0_4px_8px_-2px_rgba(255,255,255,0.1)] transition-all duration-300 hover:shadow-[0_16px_40px_-2px_rgba(255,255,255,0.2),0_8px_20px_-4px_rgba(255,255,255,0.15)]"
          />
        </Link>
      </div>
    </div>
  );
};

export function IntroSection() {
  return (
    <section className="w-full">
      <div className="sm:pt-18 flex flex-col gap-12 pt-12 md:gap-16 lg:gap-20 lg:pt-36">
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
