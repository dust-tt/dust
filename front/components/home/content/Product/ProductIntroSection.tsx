import { Button, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";

import { DemoVideoSection } from "@app/components/home/content/Solutions/DemoVideoSection";
import { H1, P } from "@app/components/home/ContentComponents";
import TrustedBy from "@app/components/home/TrustedBy";

const VideoPlayer = () => {
  return (
    <DemoVideoSection
      demoVideo={{
        videoUrl:
          "https://fast.wistia.net/embed/iframe/3eqngftomq?seo=true&videoFoam=true",
        autoPlay: false,
        showCaptions: false,
      }}
    />
  );
};

export function ProductIntroSection() {
  return (
    <div className="sm:pt-18 w-full pt-12 lg:pt-36">
      <div className="flex flex-col gap-16">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center sm:gap-2 sm:px-6">
          <H1
            mono
            className="text-center text-5xl font-medium md:text-6xl lg:text-7xl"
          >
            Build your team of&nbsp;AI&nbsp;agents
          </H1>
          <P size="lg" className="text-base text-muted-foreground sm:text-lg">
            Dust empowers all teams with agents with company context you can
            fully customize to match your unique requirements. Deploy seamlessly
            from simple workflows to complex enterprise integrations.
          </P>
          <div className="mt-4 flex flex-row justify-center gap-4">
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
        <div className="w-full">
          <VideoPlayer />
        </div>
        <div className="mt-16">
          <TrustedBy />
        </div>
      </div>
    </div>
  );
}
