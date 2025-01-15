import { Hover3D } from "@dust-tt/sparkle";
import type { FC } from "react";

import { H2 } from "@app/components/home/ContentComponents";

export interface DemoVideo {
  sectionTitle?: string;
  videoUrl: string;
}

interface DemoVideoSectionProps {
  demoVideo: DemoVideo;
  fromColor: string;
  toColor: string;
}

export const DemoVideoSection: FC<DemoVideoSectionProps> = ({
  demoVideo,
  fromColor,
  toColor,
}) => (
  <div className="flex flex-col justify-center gap-8 pb-4">
    <div>
      <H2 from={fromColor} to={toColor}>
        {demoVideo.sectionTitle}
      </H2>
    </div>
    <div className="mx-auto w-[90%]">
      <Hover3D depth={-40} perspective={1000} className="relative w-full">
        <div className="relative w-full pt-[56.25%]">
          {/* 16:9 aspect ratio */}
          <iframe
            src={demoVideo.videoUrl}
            title="Dust product tour"
            allow="autoplay; fullscreen"
            frameBorder="0"
            className="absolute inset-0 h-full w-full rounded-lg"
          />
        </div>
      </Hover3D>
    </div>
  </div>
);
