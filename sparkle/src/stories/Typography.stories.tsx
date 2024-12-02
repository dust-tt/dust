// TextStyles.stories.tsx
import { Meta } from "@storybook/react";
import React from "react";

import { classNames } from "@sparkle/lib/utils";

// Define the text sizes and weights
const textSizes = {
  xs: "s-text-xs",
  sm: "s-text-sm",
  md: "s-text-base",
  lg: "s-text-lg",
  xl: "s-text-xl",
};

const extraTextSizes = {
  "2xl": "s-text-2xl",
  "3xl": "s-text-3xl",
  "4xl": "s-text-4xl",
  "5xl": "s-text-5xl",
  "6xl": "s-text-6xl",
  "7xl": "s-text-7xl",
  "8xl": "s-text-8xl",
  "9xl": "s-text-9xl",
};

const fontWeights = {
  normal: "s-font-normal",
  medium: "s-font-medium",
  semibold: "s-font-semibold",
  bold: "s-font-bold",
};

const loremIpsum = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";

// SVG Pattern as a background image
const svgBackground = `
  <svg width="4" height="8" xmlns="http://www.w3.org/2000/svg">
    <rect width="4" height="4" fill="red" fill-opacity="0.05"/>
  </svg>
`;

// Create a component to display the text styles
const TextStylesDisplay: React.FC = () => {
  return (
    <div>
      <div
        className="s-grid s-gap-4 s-bg-repeat s-py-8"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svgBackground)}")`,
          gridTemplateColumns: `repeat(${Object.keys(fontWeights).length}, minmax(0, 1fr))`,
        }}
      >
        {Object.entries(textSizes).map(([sizeKey, sizeClass]) =>
          Object.entries(fontWeights).map(([weightKey, weightClass]) => (
            <div
              key={`${sizeKey}-${weightKey}`}
              className={classNames(sizeClass, weightClass)}
            >
              <div>{`${sizeKey} ${weightKey}`}</div>
              <p>{loremIpsum}</p>
            </div>
          ))
        )}
      </div>
      <div
        className="s-mt-6 s-grid s-gap-16 s-bg-repeat s-py-8"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svgBackground)}")`,
        }}
      >
        {Object.entries(extraTextSizes).map(([sizeKey, sizeClass]) => (
          <div key={sizeKey} className={classNames(sizeClass, "s-font-medium")}>
            <div>{`${sizeKey} medium`}</div>
            <p>{loremIpsum}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// Storybook metadata
export default {
  title: "Styles/Typography",
  component: TextStylesDisplay,
} as Meta;

// Define a template for the story
const Template = () => <TextStylesDisplay />;

// Export the default story
export const Default = Template.bind({});
