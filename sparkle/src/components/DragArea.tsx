import Lottie, { LottieRefCurrentProps } from "lottie-react";
import React, { useRef } from "react";

import { ArrowUpOnSquareIcon, Icon } from "@sparkle/_index";
import anim from "@sparkle/lottie/dragArea";

export interface DragZoneProps {
  title?: string;
  description?: string;
  visual?: React.ReactNode;
}

const DragArea: React.FC<DragZoneProps> = ({
  title = "Drag and drop",
  description = "Drag and drop your files here",
  visual = (
    <Icon visual={ArrowUpOnSquareIcon} size="lg" className="s-text-white" />
  ),
}) => {
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);

  return (
    <div
      className="s-flex s-h-full s-w-full s-flex-col s-items-center s-justify-center s-gap-0 s-bg-white/80 s-text-element-800"
      onMouseLeave={() => {
        lottieRef.current?.setDirection(-1);
        lottieRef.current?.play();
      }}
      onDrop={() => {
        lottieRef.current?.setDirection(-1);
        lottieRef.current?.play();
      }}
    >
      <div className="s-relative">
        <Lottie
          lottieRef={lottieRef}
          animationData={anim}
          style={{ width: `200px`, height: `200px` }}
          loop={false}
          autoplay
        />
        <div className="s-absolute" style={{ top: `84px`, left: `84px` }}>
          {visual}
        </div>
      </div>
      <div className="s-text-xl s-font-bold">{title}</div>
      <div className="s-font-base s-text-base">{description}</div>
    </div>
  );
};

export default DragArea;
