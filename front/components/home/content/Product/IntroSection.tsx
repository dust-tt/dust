import { Button, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";

import { ScrollProgressSection } from "@app/components/home/content/Product/ScrollProgressSection";
import { ValuePropSection } from "@app/components/home/content/Product/ValuePropSection";
import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import {
  H1,
  P,
  TeamFeatureSection,
} from "@app/components/home/ContentComponents";
import { FunctionsSection } from "@app/components/home/FunctionsSection";
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
    <div className="w-full pt-[8vh] sm:pt-[8vh] xl:pt-[8vh] 2xl:pt-[8vh]">
      <div className="flex flex-col gap-24">
        <div className="flex flex-col items-center">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
            <H1 className="text-center">
              Transform how work<br></br>gets done
            </H1>
            <P size="lg" className="text-muted-foreground">
              The platform to build AI agents, connected to your company
              knowledge,<br></br> powered by the best AI models.
            </P>
            <div className="flex justify-center gap-4">
              <Link href="/home/pricing" shallow={true}>
                <Button
                  variant="highlight"
                  size="md"
                  label="Get started"
                  icon={RocketIcon}
                />
              </Link>
              <Link href="/home/contact" shallow={true}>
                <Button variant="outline" size="md" label="Contact sales" />
              </Link>
            </div>
          </div>
          <div className="mt-16 w-full max-w-3xl overflow-hidden rounded-xl">
            <MainVisual />
          </div>
        </div>
        <TrustedBy />
        <FunctionsSection />
        <ScrollProgressSection />
        <TeamFeatureSection />
        <ValuePropSection />
      </div>
    </div>
  );
}
