import { classNames } from "@dust-tt/sparkle";
import type { FC } from "react";

import { H2 } from "@app/components/home/ContentComponents";

export interface DemoVideoProps {
  sectionTitle?: string;
  videoUrl: string;
  autoPlay?: boolean;
  showCaptions?: boolean;
}

interface DemoVideoSectionProps {
  demoVideo: DemoVideoProps;
}

export const DemoVideoSection: FC<DemoVideoSectionProps> = ({ demoVideo }) => {
  // Construct the video URL with consistent parameters
  const videoUrl = new URL(demoVideo.videoUrl);
  videoUrl.searchParams.set("seo", "true");
  videoUrl.searchParams.set("videoFoam", "true");
  if (demoVideo.autoPlay) {
    videoUrl.searchParams.set("autoPlay", "true");
  }
  if (demoVideo.showCaptions) {
    videoUrl.searchParams.set("captions", "on");
  }

  return (
    <div className="flex flex-col justify-center gap-8 pb-4">
      {demoVideo.sectionTitle && (
        <div>
          <H2>{demoVideo.sectionTitle}</H2>
        </div>
      )}
      <div className={classNames("mx-auto w-full")}>
        <div className="relative w-full rounded-2xl pt-[56.25%]">
          {/* 16:9 aspect ratio */}
          <iframe
            src={videoUrl.toString()}
            title="Dust product tour"
            allow="autoplay; fullscreen"
            frameBorder="0"
            className="absolute inset-0 h-full w-full overflow-hidden rounded-2xl"
          />
        </div>
      </div>
    </div>
  );
};
