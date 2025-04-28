import * as PopoverPrimitive from "@radix-ui/react-popover";
import React, { useEffect, useState } from "react";

import { Button } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib";

interface TourStep {
  ref?: React.RefObject<HTMLElement>;
  content: React.ReactNode;
  centered?: boolean;
  title?: React.ReactNode;
  visual?: React.ReactNode;
}

export interface TourGuideProps {
  steps: TourStep[];
  /** Automatically start the tour on mount (default: true) */
  autoStart?: boolean;
  /** Callback when tour is started/restarted */
  onStart?: () => void;
}

export function TourGuide({
  steps,
  autoStart = true,
  onStart,
}: TourGuideProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isActive, setIsActive] = useState(autoStart);
  const [position, setPosition] = useState({
    top: "50%",
    left: "50%",
    width: "0px",
    height: "0px",
    transform: "translate(-50%, -50%)",
  });

  useEffect(() => {
    if (autoStart) {
      setIsActive(true);
      setCurrentIndex(0);
      onStart?.();
    }
  }, [steps, autoStart, onStart]);

  useEffect(() => {
    const currentStep = steps[currentIndex];
    if (currentStep?.centered) {
      setPosition({
        top: "50%",
        left: "50%",
        width: "0px",
        height: "0px",
        transform: "translate(-50%, -50%)",
      });
    } else if (currentStep?.ref?.current) {
      const rect = currentStep.ref.current.getBoundingClientRect();
      setPosition({
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        transform: "none",
      });
    }
  }, [currentIndex, steps]);

  const handleNext = () => {
    if (currentIndex + 1 < steps.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsActive(false);
    }
  };

  const handleDismiss = () => {
    setIsActive(false);
  };

  if (!isActive || steps.length === 0) {
    return null;
  }

  const { content, title, visual } = steps[currentIndex];
  const isLastStep = currentIndex === steps.length - 1;

  return (
    <PopoverPrimitive.Root open modal={false}>
      <PopoverPrimitive.Anchor
        className="s-fixed s-transition-all s-duration-300"
        style={{
          top: position.top,
          left: position.left,
          width: position.width,
          height: position.height,
          transform: position.transform,
        }}
      />
      <PopoverPrimitive.Content
        className={cn(
          "s-max-w-xs s-overflow-hidden s-rounded-2xl s-border s-shadow-xl s-transition-all s-duration-300",
          "s-border-border s-bg-background s-text-foreground",
          "dark:s-border-border-night dark:s-bg-background-night dark:s-text-foreground-night"
        )}
      >
        <div className="s-aspect-video s-bg-brand-tea-green">{visual}</div>
        <div className="s-space-y-4 s-p-4">
          <div className="s-space-y-2">
            {title && <div className="s-heading-base">{title}</div>}
            <div className="s-copy-sm">{content}</div>
          </div>
          <div className="s-flex s-justify-end s-space-x-2">
            <Button variant="outline" label="Dismiss" onClick={handleDismiss} />
            <Button
              onClick={handleNext}
              variant="highlight"
              label={isLastStep ? "Finish" : "Next"}
            />
          </div>
        </div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Root>
  );
}
