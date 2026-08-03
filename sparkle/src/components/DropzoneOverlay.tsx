import { Icon } from "@sparkle/components/Icon";
import { Upload01 } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib";
import anim from "@sparkle/lottie/dragArea";
import Lottie, { type LottieRefCurrentProps } from "lottie-react";
import React, { useEffect, useRef, useState } from "react";

export interface DropzoneOverlayProps {
  description: string;
  isDragActive: boolean;
  title: string;
  visual?: React.ReactNode;
}

export function DropzoneOverlay({
  description,
  isDragActive,
  title,
  visual = <Icon visual={Upload01} size="lg" className="text-background" />,
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
        "absolute inset-0 z-50 flex h-full w-full flex-col items-center justify-center gap-0",
        "bg-background/80",
        "text-foreground"
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
      <div className="relative">
        <Lottie
          lottieRef={lottieRef}
          animationData={anim}
          style={{ width: `200px`, height: `200px` }}
          loop={false}
          autoplay
        />
        <div className="absolute" style={{ top: `84px`, left: `84px` }}>
          {visual}
        </div>
      </div>
      <div className="heading-xl">{title}</div>
      <div className="text-base text-muted-foreground">{description}</div>
    </div>
  );
}
