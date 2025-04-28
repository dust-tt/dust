import * as PopoverPrimitive from "@radix-ui/react-popover";
import React, { useEffect, useState } from "react";

import { Button } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib";

interface TourStep {
  ref?: React.RefObject<HTMLElement>;
  content: React.ReactNode;
  title?: string;
  visual?: React.ReactNode;
}

export interface TourGuideProps {
  steps: TourStep[];
  autoStart?: boolean;
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
  });

  // Only run on mount and when autoStart changes
  useEffect(() => {
    if (autoStart) {
      setIsActive(true);
      setCurrentIndex(0);
      onStart?.();
    }
  }, [autoStart, onStart]);

  // Handle position updates
  useEffect(() => {
    const currentStep = steps[currentIndex];
    if (!currentStep?.ref) {
      setPosition({
        top: "50%",
        left: "50%",
        width: "0px",
        height: "0px",
      });
      return;
    }

    const element = currentStep.ref.current;
    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    setPosition({
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
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

  const currentStep = steps[currentIndex];
  const { content, title, visual } = currentStep;
  const isLastStep = currentIndex === steps.length - 1;

  return (
    <PopoverPrimitive.Root open modal={false}>
      <PopoverPrimitive.Anchor
        className="s-fixed s-transition-all s-duration-300 s-ease-in-out"
        style={{
          top: position.top,
          left: position.left,
          width: position.width,
          height: position.height,
        }}
      />
      <PopoverPrimitive.Content
        className={cn(
          "s-w-96 s-max-w-xs s-overflow-hidden s-rounded-2xl s-border s-shadow-xl s-transition-all s-duration-300 s-ease-in-out",
          !currentStep.ref && "s-translate-y-[-50%]",
          "s-border-highlight-400 s-bg-background s-text-foreground s-ring-2 s-ring-highlight-400/30",
          "dark:s-border-border-night dark:s-bg-background-night dark:s-text-foreground-night"
        )}
      >
        <div className="s-aspect-video s-bg-muted-background">{visual}</div>
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
