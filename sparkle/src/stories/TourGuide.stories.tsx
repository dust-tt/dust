import { Meta, StoryFn } from "@storybook/react";
import React, { useRef, useState } from "react";

import { ConfettiBackground } from "@sparkle/components";
import { Button } from "@sparkle/components/Button";

import {
  TourGuide,
  TourGuideCard,
  TourGuideCardActions,
  TourGuideCardContent,
  TourGuideCardTitle,
  TourGuideCardVisual,
} from "../components/TourGuide";

export default {
  title: "Components/TourGuide",
  component: TourGuide,
  parameters: {
    layout: "fullscreen",
  },
} as Meta;

const Template: StoryFn = () => {
  const topRightRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const bottomLeftRef = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState(0);

  const handleRestart = () => {
    setKey((k) => k + 1);
  };
  const referentRef = useRef<HTMLDivElement>(null);
  return (
    <div className="s-relative s-min-h-screen s-w-full">
      <div className="s-absolute s-left-3 s-top-3">
        <Button label="Restart Tour" onClick={handleRestart} />
      </div>
      <div
        ref={topRightRef}
        className="s-absolute s-right-6 s-top-6 s-cursor-pointer s-rounded-lg s-border s-border-blue-100 s-bg-blue-50 s-p-4 s-transition-colors hover:s-bg-blue-100"
      >
        Top Right Element
      </div>
      <div
        ref={centerRef}
        className="s-absolute s-left-1/2 s-top-1/2 s--translate-x-1/2 s--translate-y-1/2 s-cursor-pointer s-rounded-lg s-border s-border-green-100 s-bg-green-50 s-p-4 s-transition-colors hover:s-bg-green-100"
      >
        Centered Element
      </div>
      <div
        ref={bottomLeftRef}
        className="s-absolute s-bottom-6 s-left-6 s-cursor-pointer s-rounded-lg s-border s-border-red-100 s-bg-red-50 s-p-4 s-transition-colors hover:s-bg-red-100"
      >
        Bottom Left Element
      </div>
      <TourGuide key={key} autoStart>
        <TourGuideCard>
          <TourGuideCardVisual
            ref={referentRef}
            className="s-bg-support-rose s-flex s-items-center s-justify-center s-text-center"
          >
            <ConfettiBackground variant="confetti" referentSize={referentRef} />
            <span className="s-heading-3xl">Rise and shine, Edouard! 🌅</span>
          </TourGuideCardVisual>
          <TourGuideCardTitle>
            Welcome to the{" "}
            <span className="s-font-semibold s-text-rose-400">Qonto</span>{" "}
            workspace.
          </TourGuideCardTitle>
          <TourGuideCardContent>
            {" "}
            Discover Dust’s basics in 3 steps.
          </TourGuideCardContent>
        </TourGuideCard>
        <TourGuideCard anchorRef={topRightRef}>
          <TourGuideCardVisual>
            <div className="s-flex s-h-full s-items-center s-justify-center s-text-muted-foreground">
              Custom Visual Content
            </div>
          </TourGuideCardVisual>
          <TourGuideCardTitle>Top Right Element</TourGuideCardTitle>
          <TourGuideCardContent>
            This element is anchored to the top right corner. The popover will
            automatically position itself to stay in view.
          </TourGuideCardContent>
        </TourGuideCard>
        <TourGuideCard anchorRef={centerRef}>
          <TourGuideCardVisual>
            <div className="s-flex s-h-full s-items-center s-justify-center s-text-muted-foreground">
              Custom Visual Content
            </div>
          </TourGuideCardVisual>
          <TourGuideCardTitle>Centered Element</TourGuideCardTitle>
          <TourGuideCardContent>
            This element is perfectly centered in the container using transform
            translate.
          </TourGuideCardContent>
        </TourGuideCard>
        <TourGuideCard anchorRef={bottomLeftRef}>
          <TourGuideCardVisual>
            <div className="s-flex s-h-full s-items-center s-justify-center s-text-muted-foreground">
              Custom Visual Content
            </div>
          </TourGuideCardVisual>
          <TourGuideCardTitle>Bottom Left Element</TourGuideCardTitle>
          <TourGuideCardContent>
            This element is anchored to the bottom left corner, demonstrating
            the tour's ability to handle different positions.
          </TourGuideCardContent>
        </TourGuideCard>
      </TourGuide>
    </div>
  );
};

export const Default = Template.bind({});

// Example of using individual subcomponents
export const TourGuideSubcomponents = () => {
  return (
    <div className="s-flex s-min-h-screen s-w-full s-items-center s-justify-center">
      <TourGuideCard>
        <TourGuideCardVisual>
          <div className="s-flex s-h-full s-items-center s-justify-center s-text-muted-foreground">
            Custom Visual Content
          </div>
        </TourGuideCardVisual>
        <TourGuideCardTitle>Custom Title</TourGuideCardTitle>
        <TourGuideCardContent>
          This is an example of using the individual subcomponents.
        </TourGuideCardContent>
        <TourGuideCardActions>
          <Button variant="outline" label="Cancel" />
          <Button variant="highlight" label="Confirm" />
        </TourGuideCardActions>
      </TourGuideCard>
    </div>
  );
};
