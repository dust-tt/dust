import { Meta, StoryFn } from "@storybook/react";
import React, { useRef, useState } from "react";

import { Button } from "@sparkle/components/Button";

import { TourGuide, TourGuideProps } from "../components/TourGuide";

export default {
  title: "Components/TourGuide",
  component: TourGuide,
  parameters: {
    layout: "fullscreen",
  },
} as Meta;

const Template: StoryFn<TourGuideProps> = (args: TourGuideProps) => {
  const topRightRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const bottomLeftRef = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState(0);

  const handleRestart = () => {
    setKey((k) => k + 1);
  };

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
      <TourGuide
        key={key}
        {...args}
        steps={[
          {
            title: "You're all set!",
            content: "Welcome to the <strong>Qonto</strong> workspace.",
          },
          {
            ref: topRightRef,
            title: "Top Right Element",
            content:
              "This element is anchored to the top right corner. The popover will automatically position itself to stay in view.",
          },
          {
            ref: centerRef,
            title: "Centered Element",
            content:
              "This element is perfectly centered in the container using transform translate.",
          },
          {
            ref: bottomLeftRef,
            title: "Bottom Left Element",
            content:
              "This element is anchored to the bottom left corner, demonstrating the tour's ability to handle different positions.",
          },
        ]}
      />
    </div>
  );
};

export const Default = Template.bind({});
Default.args = {
  autoStart: true,
};
