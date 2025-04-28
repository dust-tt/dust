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
    <div className="s-flex s-min-h-screen s-flex-col s-items-center s-justify-center s-bg-gray-50 s-p-8">
      <div className="s-relative s-h-[500px] s-w-[800px] s-rounded-lg s-border s-border-gray-200 s-bg-white s-shadow-sm">
        {/* Top right element */}
        <div
          ref={topRightRef}
          className="s-absolute s-right-6 s-top-6 s-cursor-pointer s-rounded-lg s-border s-border-blue-100 s-bg-blue-50 s-p-4 s-transition-colors hover:s-bg-blue-100"
        >
          Top Right Element
        </div>

        {/* Centered element */}
        <div
          ref={centerRef}
          className="s-absolute s-left-1/2 s-top-1/2 s--translate-x-1/2 s--translate-y-1/2 s-cursor-pointer s-rounded-lg s-border s-border-green-100 s-bg-green-50 s-p-4 s-transition-colors hover:s-bg-green-100"
        >
          Centered Element
        </div>

        {/* Bottom left element */}
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
              ref: topRightRef,
              content:
                "This element is anchored to the top right corner. The popover will automatically position itself to stay in view.",
            },
            {
              ref: centerRef,
              content:
                "This element is perfectly centered in the container using transform translate.",
            },
            {
              ref: bottomLeftRef,
              content:
                "This element is anchored to the bottom left corner, demonstrating the tour's ability to handle different positions.",
            },
          ]}
        />
      </div>

      <div className="s-mt-8">
        <Button
          label="Restart Tour"
          onClick={handleRestart}
          variant="outline"
        />
      </div>
    </div>
  );
};

export const Default = Template.bind({});
Default.args = {
  autoStart: true,
};
