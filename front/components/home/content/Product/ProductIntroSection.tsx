import { Button, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";

import { H1, P } from "@app/components/home/ContentComponents";
import TrustedBy from "@app/components/home/TrustedBy";

const VideoPlayer = () => {
  return (
    <div className="relative w-full pt-[56.25%]">
      <iframe
        src="https://fast.wistia.net/embed/iframe/v90n8beuh9?web_component=true&seo=true"
        title="Dust demo"
        allow="fullscreen"
        frameBorder="0"
        className="absolute inset-0 h-full w-full rounded-lg"
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
            <H1 className="text-red-400">
              Accelerate your entire organization with AI
            </H1>
            <div className="w-full md:hidden">
              <VideoPlayer />
            </div>
            <P size="lg" className="text-slate-50">
              Build your team of AI agents: secure, connected to your data and
              customizable to your needs.
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
