import * as PopoverPrimitive from "@radix-ui/react-popover";
import React, { useEffect, useState } from "react";

import { Button } from "@sparkle/components/Button";

interface TourStep {
  ref: React.RefObject<HTMLElement>;
  content: React.ReactNode;
}

export interface TourGuideProps {
  steps: TourStep[];
  /** Automatically start the tour on mount (default: true) */
  autoStart?: boolean;
  /** Callback when tour is started/restarted */
  onStart?: () => void;
}

interface TourPopoverProps {
  targetRef: React.RefObject<HTMLElement>;
  content: React.ReactNode;
  onNext: () => void;
  onDismiss: () => void;
  isLastStep: boolean;
}

export function TourPopover({
  targetRef,
  content,
  onNext,
  onDismiss,
  isLastStep,
}: TourPopoverProps) {
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (targetRef.current) {
      const rect = targetRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    }
  }, [targetRef.current]);

  return (
    <PopoverPrimitive.Root open modal={false}>
      <PopoverPrimitive.Anchor
        className="s-fixed"
        style={{
          top: position.top,
          left: position.left,
          width: position.width,
          height: position.height,
        }}
      />
      <PopoverPrimitive.Content
        className="s-max-w-xs s-rounded-lg s-border s-border-gray-200 s-bg-white s-p-4 s-shadow-lg"
        sideOffset={5}
        align="center"
        side="bottom"
        avoidCollisions
      >
        <div className="s-text-sm">{content}</div>
        <div className="s-mt-4 s-flex s-justify-end s-space-x-2">
          <Button onClick={onNext} label={isLastStep ? "Finish" : "Next"} />
          <Button variant="ghost" label="Dismiss" onClick={onDismiss} />
        </div>
        <PopoverPrimitive.Arrow className="s-fill-white s-stroke-gray-200" />
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Root>
  );
}

export function TourGuide({
  steps,
  autoStart = true,
  onStart,
}: TourGuideProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isActive, setIsActive] = useState(autoStart);

  useEffect(() => {
    if (autoStart) {
      setIsActive(true);
      setCurrentIndex(0);
      onStart?.();
    }
  }, [steps, autoStart, onStart]);

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

  const { ref, content } = steps[currentIndex];
  const isLastStep = currentIndex === steps.length - 1;

  return (
    <TourPopover
      targetRef={ref}
      content={content}
      onNext={handleNext}
      onDismiss={handleDismiss}
      isLastStep={isLastStep}
    />
  );
}
