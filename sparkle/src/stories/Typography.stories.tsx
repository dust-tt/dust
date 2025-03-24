// TextStyles.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
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

const copySizes = {
  xs: "s-copy-xs",
  sm: "s-copy-sm",
  base: "s-copy-base",
  lg: "s-copy-lg",
  xl: "s-copy-xl",
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

const headingSizes = {
  lg: "s-heading-lg",
  xl: "s-heading-xl",
  "2xl": "s-heading-2xl",
  "3xl": "s-heading-3xl",
  "4xl": "s-heading-4xl",
  "5xl": "s-heading-5xl",
  "6xl": "s-heading-6xl",
  "7xl": "s-heading-7xl",
  "8xl": "s-heading-8xl",
  "9xl": "s-heading-9xl",
};

const headingMonoSizes = {
  lg: "s-heading-mono-lg",
  xl: "s-heading-mono-xl",
  "2xl": "s-heading-mono-2xl",
  "3xl": "s-heading-mono-3xl",
  "4xl": "s-heading-mono-4xl",
  "5xl": "s-heading-mono-5xl",
  "6xl": "s-heading-mono-6xl",
  "7xl": "s-heading-mono-7xl",
  "8xl": "s-heading-mono-8xl",
  "9xl": "s-heading-mono-9xl",
};

const fontWeights = {
  normal: "s-font-normal",
  medium: "s-font-medium",
  semibold: "s-font-semibold",
  bold: "s-font-bold",
};

const loremIpsum =
  "Geist. Lorem ipsum dolor sit amet, consectetur adipiscing elit.";

const copyLoremIpsum = `Geist. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`;

interface TypographyProps {
  variant: "font-size" | "heading" | "heading-mono" | "copy";
}

const Typography: React.FC<TypographyProps> = ({ variant }) => {
  if (variant === "font-size") {
    return (
      <div>
        <div
          className="s-grid s-gap-4 s-bg-repeat s-py-8"
          style={{
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
        <div className="s-mt-6 s-grid s-gap-16 s-bg-repeat s-py-8">
          {Object.entries(extraTextSizes).map(([sizeKey, sizeClass]) => (
            <div
              key={sizeKey}
              className={classNames(sizeClass, "s-font-medium")}
            >
              <div>{`${sizeKey} medium`}</div>
              <p>{loremIpsum}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "copy") {
    return (
      <div className="s-space-y-12 s-bg-repeat s-py-8">
        {Object.entries(copySizes).map(([sizeKey, copyClass]) => (
          <div key={sizeKey} className="s-space-y-4">
            <div className={copyClass}>
              <div>{`Copy ${sizeKey}`}</div>
              <div
                className="s-mt-2"
                style={{
                  maxWidth:
                    sizeKey === "xs"
                      ? "20rem"
                      : sizeKey === "sm"
                        ? "24rem"
                        : sizeKey === "base"
                          ? "32rem"
                          : sizeKey === "lg"
                            ? "40rem"
                            : "48rem",
                }}
              >
                <p>{copyLoremIpsum}</p>
              </div>
            </div>
            <div className={classNames(copyClass, "s-italic")}>
              <div>{`Copy ${sizeKey} Italic`}</div>
              <div
                className="s-mt-2"
                style={{
                  maxWidth:
                    sizeKey === "xs"
                      ? "20rem"
                      : sizeKey === "sm"
                        ? "24rem"
                        : sizeKey === "base"
                          ? "32rem"
                          : sizeKey === "lg"
                            ? "40rem"
                            : "48rem",
                }}
              >
                <p>{copyLoremIpsum}</p>
              </div>
            </div>
            <div className={classNames(copyClass, "s-font-mono")}>
              <div>{`Copy ${sizeKey} Mono`}</div>
              <div
                className="s-mt-2"
                style={{
                  maxWidth:
                    sizeKey === "xs"
                      ? "20rem"
                      : sizeKey === "sm"
                        ? "24rem"
                        : sizeKey === "base"
                          ? "32rem"
                          : sizeKey === "lg"
                            ? "40rem"
                            : "48rem",
                }}
              >
                <p>{copyLoremIpsum}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "heading-mono") {
    return (
      <div className="s-space-y-8 s-bg-repeat s-py-8">
        {Object.entries(headingMonoSizes).map(([sizeKey, headingClass]) => (
          <div key={sizeKey} className={headingClass}>
            <div>{`Heading Mono ${sizeKey}`}</div>
            <p>{loremIpsum}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="s-space-y-8 s-bg-repeat s-py-8">
      {Object.entries(headingSizes).map(([sizeKey, headingClass]) => (
        <div key={sizeKey} className={headingClass}>
          <div>{`Heading ${sizeKey}`}</div>
          <p>{loremIpsum}</p>
        </div>
      ))}
    </div>
  );
};

const meta: Meta<typeof Typography> = {
  title: "Theme/Typography",
  component: Typography,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    variant: "font-size",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Add a Default story that matches the expected ID
export const Default: Story = {
  args: {
    variant: "font-size",
  },
};

export const FontSize: Story = {
  args: {
    variant: "font-size",
  },
};

export const Heading: Story = {
  args: {
    variant: "heading",
  },
};

export const HeadingMono: Story = {
  args: {
    variant: "heading-mono",
  },
};

export const Copy: Story = {
  args: {
    variant: "copy",
  },
};
