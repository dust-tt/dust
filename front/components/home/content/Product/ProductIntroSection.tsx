import { Button, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";

import { H1, P } from "@app/components/home/ContentComponents";
import TrustedBy from "@app/components/home/TrustedBy";

const VideoPlayer = () => {
  return (
    <div className="relative w-full rounded-2xl pt-[56.20%]">
      <iframe
        src="https://fast.wistia.net/embed/iframe/v90n8beuh9?web_component=true&seo=true"
        title="Dust demo"
        allow="fullscreen"
        frameBorder="0"
        className="absolute inset-0 h-full w-full overflow-hidden rounded-2xl"
      ></iframe>
    </div>
  );
};

export function ProductIntroSection() {
  return (
    <div className="w-full pt-[6vh] sm:pt-[8vh] xl:pt-[12vh] 2xl:pt-[18vh]">
      <div className="flex flex-col gap-16">
        <div className="flex flex-col items-center gap-16 md:flex-row">
          <div className="flex flex-col gap-8">
            <H1>Build your team of&nbsp;AI&nbsp;agents</H1>
            <div className="w-full md:hidden">
              <VideoPlayer />
            </div>
            <P size="lg" className="text-muted-foreground">
              Dust empowers all teams with agents with company context you can
              fully customize to match your unique requirements. Deploy
              seamlessly from simple workflows to complex enterprise
              integrations.
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
          <div className="hidden w-full max-w-2xl md:block">
            <VideoPlayer />
          </div>
        </div>
        <TrustedBy />
      </div>
    </div>
  );
}
