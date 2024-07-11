import Lottie, { LottieRefCurrentProps } from "lottie-react";
import React, { useEffect, useRef, useState } from "react";

import { ArrowUpOnSquareIcon, Icon } from "@sparkle/_index";
import anim from "@sparkle/lottie/dragArea";

export interface DropzoneOverlayProps {
  description?: string;
  isDragActive: boolean;
  title?: string;
  visual?: React.ReactNode;
}

export default function DropzoneOverlay({
  isDragActive,
  title = "Drag and drop",
  description = "Drag and drop your files here",
  visual = (
    <Icon visual={ArrowUpOnSquareIcon} size="lg" className="s-text-white" />
  ),
}: DropzoneOverlayProps) {
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);

  const [isActiveDelayed, setIsActiveDelayed] = useState(false);

  // This is used to delay the removal of the overlay when the user stops dragging.
  useEffect(() => {
    if (isDragActive) {
      setIsActiveDelayed(true);
    } else {
      const timeoutId = setTimeout(() => {
        setIsActiveDelayed(false);
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [isDragActive]);

  if (!isActiveDelayed) {
    return null;
  }

  return (
    <div
      className="s-absolute s-inset-0 s-z-50 s-flex s-h-full s-w-full s-flex-col s-items-center s-justify-center s-gap-0 s-bg-white/80 s-text-element-800"
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
}
