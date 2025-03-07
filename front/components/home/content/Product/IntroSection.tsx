import { Button, RocketIcon } from "@dust-tt/sparkle";
import Link from "next/link";

import { ValuePropSection } from "@app/components/home/content/Product/ValuePropSection";
// import { MetricSection } from "@app/components/home/ContentBlocks";
import { H1, P } from "@app/components/home/ContentComponents";
import TrustedBy from "@app/components/home/TrustedBy";

// const METRICS = {
//   metrics: [
//     {
//       value: "90%",
//       description: <>Weekly active users at Alan</>,
//     },
//     {
//       value: "50,000",
//       description: <>Annual hours saved at Qonto</>,
//     },
//   ],
//   from: "from-amber-200",
//   to: "to-amber-500",
// };

const VideoPlayer = () => {
  return (
    <div className="relative w-full pt-[56.25%]">
      {" "}
      {/* 16:9 aspect ratio */}
      <iframe
        src="https://fast.wistia.net/embed/iframe/7ynip6mgfx?seo=true&videoFoam=true&autoPlay=true"
        title="Dust product tour"
        allow="autoplay; fullscreen"
        frameBorder="0"
        className="absolute inset-0 h-full w-full rounded-lg"
      ></iframe>
    </div>
  );
};

export function IntroSection() {
  const MainVisual = () => <VideoPlayer />;

  return (
    <div className="w-full pt-[6vh] sm:pt-[8vh] xl:pt-[12vh] 2xl:pt-[18vh]">
      <div className="flex flex-col gap-16">
        <div className="flex flex-col items-center gap-16 md:flex-row">
          <div className="flex flex-col gap-8">
            <H1 className="text-red-400">Transform how work gets done</H1>
            <div className="w-full md:hidden">
              <MainVisual />
            </div>
            <P size="lg" className="text-slate-50">
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
          <div className="hidden w-full max-w-2xl md:block">
            <MainVisual />
          </div>
        </div>
        <TrustedBy />
        <ValuePropSection />
        {/* <MetricSection {...METRICS}></MetricSection> */}
      </div>
    </div>
  );
}
