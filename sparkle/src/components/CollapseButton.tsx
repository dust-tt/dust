import Lottie, { LottieRefCurrentProps } from "lottie-react";
import React, { useEffect, useRef } from "react";

import collapseBar from "@sparkle/lottie/collapseBar";

export interface CollapseButtonProps {
  direction: "left" | "right";
}

// Constant to store frame numbers
const FRAMES = {
  INITIAL: 0,
  IDLE: 13,
  LEFT_START: 1,
  RIGHT_END: 25,
};

const CollapseButton: React.FC<CollapseButtonProps> = ({ direction }) => {
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);

  // Function to handle hover event
  const handleMouseEnter = () => {
    if (lottieRef.current?.animationItem) {
      if (direction === "left") {
        lottieRef.current.animationItem.playSegments(
          [FRAMES.IDLE, FRAMES.LEFT_START],
          true
        );
      } else if (direction === "right") {
        lottieRef.current.animationItem.playSegments(
          [FRAMES.IDLE, FRAMES.RIGHT_END],
          true
        );
      }
    }
  };

  // Function to reset animation to idle state
  const handleMouseLeave = () => {
    if (lottieRef.current?.animationItem) {
      if (direction === "left") {
        lottieRef.current.animationItem.playSegments(
          [FRAMES.LEFT_START, FRAMES.IDLE],
          true
        );
      } else if (direction === "right") {
        lottieRef.current.animationItem.playSegments(
          [FRAMES.RIGHT_END, FRAMES.IDLE],
          true
        );
      }
    }
  };

  useEffect(() => {
    // Ensure the animation starts from the initial state
    const initializeAnimation = () => {
      if (lottieRef.current?.animationItem) {
        lottieRef.current.animationItem.goToAndStop(FRAMES.INITIAL, true);
        // Set to idle state after initial load
        setTimeout(() => {
          lottieRef.current?.animationItem?.goToAndStop(FRAMES.IDLE, true);
        }, 100);
      }
    };

    // Adding a small delay to ensure the animation is ready
    const timeoutId = setTimeout(initializeAnimation, 100);

    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ width: `24px`, height: `36px` }}
      className="s-cursor-pointer"
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={collapseBar}
        loop={false}
        autoplay={false}
      />
    </div>
  );
};

export default CollapseButton;
