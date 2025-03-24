import Lottie, { LottieRefCurrentProps } from "lottie-react";
import React, { useEffect, useRef, useState } from "react";

import { Icon } from "@sparkle/components/Icon";
import { ArrowUpOnSquareIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib";
import anim from "@sparkle/lottie/dragArea";

export interface DropzoneOverlayProps {
  description: string;
  isDragActive: boolean;
  title: string;
  visual?: React.ReactNode;
}

export default function DropzoneOverlay({
  description,
  isDragActive,
  title,
  visual = (
    <Icon
      visual={ArrowUpOnSquareIcon}
      size="lg"
      className="s-text-white dark:s-text-slate-950"
    />
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
      }, 400);
      return () => clearTimeout(timeoutId);
    }
  }, [isDragActive]);

  if (!isActiveDelayed) {
    return null;
  }

  return (
    <div
      className={cn(
        "s-absolute s-inset-0 s-z-50 s-flex s-h-full s-w-full s-flex-col s-items-center s-justify-center s-gap-0",
        "s-bg-background/80 dark:s-bg-background-night/80",
        "s-text-foreground dark:s-text-foreground-night"
      )}
      onMouseLeave={() => {
        lottieRef.current?.setDirection(-1);
        lottieRef.current?.setSpeed(2);
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
      <div className="s-font-base s-text-base s-text-muted-foreground dark:s-text-muted-foreground-night">
        {description}
      </div>
    </div>
  );
}
