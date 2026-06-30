// TextStyles.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { cn } from "@sparkle/lib/utils";

// Define the text sizes and weights
const textSizes = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
};

const copySizes = {
  xs: "copy-xs",
  sm: "copy-sm",
  base: "copy-base",
  lg: "copy-lg",
  xl: "copy-xl",
};

const extraTextSizes = {
  "2xl": "text-2xl",
  "3xl": "text-3xl",
  "4xl": "text-4xl",
  "5xl": "text-5xl",
  "6xl": "text-6xl",
  "7xl": "text-7xl",
  "8xl": "text-8xl",
  "9xl": "text-9xl",
};

const headingSizes = {
  base: "heading-base",
  lg: "heading-lg",
  xl: "heading-xl",
  "2xl": "heading-2xl",
  "3xl": "heading-3xl",
  "4xl": "heading-4xl",
  "5xl": "heading-5xl",
  "6xl": "heading-6xl",
  "7xl": "heading-7xl",
  "8xl": "heading-8xl",
  "9xl": "heading-9xl",
};

const headingMonoSizes = {
  lg: "heading-mono-lg",
  xl: "heading-mono-xl",
  "2xl": "heading-mono-2xl",
  "3xl": "heading-mono-3xl",
  "4xl": "heading-mono-4xl",
  "5xl": "heading-mono-5xl",
  "6xl": "heading-mono-6xl",
  "7xl": "heading-mono-7xl",
  "8xl": "heading-mono-8xl",
  "9xl": "heading-mono-9xl",
};

const fontWeights = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
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
          className="grid gap-4 bg-repeat py-8"
          style={{
            gridTemplateColumns: `repeat(${Object.keys(fontWeights).length}, minmax(0, 1fr))`,
          }}
        >
          {Object.entries(textSizes).map(([sizeKey, sizeClass]) =>
            Object.entries(fontWeights).map(([weightKey, weightClass]) => (
              <div
                key={`${sizeKey}-${weightKey}`}
                className={cn(sizeClass, weightClass)}
              >
                <div>{`${sizeKey} ${weightKey}`}</div>
                <p>{loremIpsum}</p>
              </div>
            ))
          )}
        </div>
        <div className="mt-6 grid gap-16 bg-repeat py-8">
          {Object.entries(extraTextSizes).map(([sizeKey, sizeClass]) => (
            <div key={sizeKey} className={cn(sizeClass, "font-medium")}>
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
      <div className="space-y-12 bg-repeat py-8">
        {Object.entries(copySizes).map(([sizeKey, copyClass]) => (
          <div key={sizeKey} className="space-y-4">
            <div className={copyClass}>
              <div>{`Copy ${sizeKey}`}</div>
              <div
                className="mt-2"
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
            <div className={cn(copyClass, "italic")}>
              <div>{`Copy ${sizeKey} Italic`}</div>
              <div
                className="mt-2"
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
            <div className={cn(copyClass, "font-mono")}>
              <div>{`Copy ${sizeKey} Mono`}</div>
              <div
                className="mt-2"
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
      <div className="space-y-8 bg-repeat py-8">
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
    <div className="space-y-8 bg-repeat py-8">
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
  title: "Foundations/Typography",
  component: Typography,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `The Sparkle type scale, rendered in Geist. Covers font sizes (\`text-xs\` to \`text-9xl\`) with weights, heading styles (\`heading-*\` and monospace \`heading-mono-*\`), and copy/body styles (\`copy-*\`, including italic and mono). Use the **variant** control to switch between the font-size, heading, heading-mono, and copy specimens, and reach for these utilities instead of ad-hoc font sizing.`,
      },
    },
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
