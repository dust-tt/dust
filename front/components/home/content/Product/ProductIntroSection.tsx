import { Button, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";
import { useState } from "react";

import { HeroVisual } from "@app/components/home/content/Product/IntroSection";
import { H1, P } from "@app/components/home/ContentComponents";
import TrustedBy from "@app/components/home/TrustedBy";

export function ProductIntroSection() {
  const [showHeroVideo, setShowHeroVideo] = useState(false);
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
            Dust empowers teams to create agents that actually understand your
            company context,&nbsp; fully customized to match how you actually
            work. Deploy everything from simple workflows to complex enterprise
            integrations.
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
        <HeroVisual
          showVideo={showHeroVideo}
          onWatch={() => setShowHeroVideo(true)}
        />
        <div className="mt-16">
          <TrustedBy />
        </div>
      </div>
    </div>
  );
}
