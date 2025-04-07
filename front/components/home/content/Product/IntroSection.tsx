import { Button, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";

import { ScrollProgressSection } from "@app/components/home/content/Product/ScrollProgressSection";
import { ValuePropSection } from "@app/components/home/content/Product/ValuePropSection";
import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import { H1, P } from "@app/components/home/ContentComponents";
import TrustedBy from "@app/components/home/TrustedBy";

const VideoPlayer = () => {
  return (
    <DemoVideoSection
      demoVideo={{
        videoUrl: "https://fast.wistia.net/embed/iframe/7ynip6mgfx",
        autoPlay: true,
        showCaptions: false,
      }}
    />
  );
};

export function IntroSection() {
  const MainVisual = () => <VideoPlayer />;

  return (
    <div className="w-full pt-[6vh] sm:pt-[8vh] xl:pt-[12vh] 2xl:pt-[18vh]">
      <div className="flex flex-col gap-16">
        <div className="flex flex-col items-center gap-16 rounded-2xl md:flex-row">
          <div className="flex flex-col gap-8 rounded-xl">
            <H1>Transform how work gets done</H1>
            <div className="w-full overflow-hidden rounded-xl md:hidden">
              <MainVisual />
            </div>
            <P size="lg" className="text-muted-foreground">
              Build custom AI agents: secure, connected to your company
              knowledge, and powered by the best AI models.
            </P>
            <div className="flex justify-center gap-4 sm:justify-start">
              <Link href="/home/pricing" shallow={true}>
                <Button
                  variant="highlight"
                  size="md"
                  label="Try Dust Now"
                  icon={RocketIcon}
                />
              </Link>
              <Link href="/home/contact" shallow={true}>
                <Button variant="outline" size="md" label="Contact Sales" />
              </Link>
            </div>
          </div>
          <div className="hidden w-full max-w-2xl overflow-hidden rounded-xl md:block">
            <MainVisual />
          </div>
        </div>
        <TrustedBy />
        <ScrollProgressSection />
        <ValuePropSection />
      </div>
    </div>
  );
}
