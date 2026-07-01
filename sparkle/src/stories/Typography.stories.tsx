// Typography.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { cn } from "@sparkle/lib/utils";

import {
  Copyable,
  useComputedStyle,
  withThemedSurface,
} from "./foundations-helpers";

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

// Readable line length per copy size, keyed by size token.
const copyMaxWidth: Record<string, string> = {
  xs: "20rem",
  sm: "24rem",
  base: "32rem",
  lg: "40rem",
  xl: "48rem",
};

const loremIpsum =
  "Geist. Lorem ipsum dolor sit amet, consectetur adipiscing elit.";

const copyLoremIpsum = `Geist. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`;

const MEASURED = ["font-size", "line-height", "font-weight"] as const;

// One type specimen: click the label to copy its utility class(es), and read
// the live computed size / line-height / weight so the numbers never drift from
// the compiled CSS.
const TypeSpecimen = ({
  label,
  className,
  sample,
  style,
}: {
  label: string;
  className: string;
  sample: string;
  style?: React.CSSProperties;
}) => {
  const ref = React.useRef<HTMLParagraphElement>(null);
  const measured = useComputedStyle(ref, MEASURED);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <Copyable value={className}>
          <span className="font-mono text-xs text-foreground">{label}</span>
        </Copyable>
        {measured["font-size"] && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {measured["font-size"]} / {measured["line-height"]} ·{" "}
            {measured["font-weight"]}
          </span>
        )}
      </div>
      <p ref={ref} className={className} style={style}>
        {sample}
      </p>
    </div>
  );
};

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
              <TypeSpecimen
                key={`${sizeKey}-${weightKey}`}
                label={`${sizeKey} ${weightKey}`}
                className={cn(sizeClass, weightClass)}
                sample={loremIpsum}
              />
            ))
          )}
        </div>
        <div className="mt-6 grid gap-16 bg-repeat py-8">
          {Object.entries(extraTextSizes).map(([sizeKey, sizeClass]) => (
            <TypeSpecimen
              key={sizeKey}
              label={`${sizeKey} medium`}
              className={cn(sizeClass, "font-medium")}
              sample={loremIpsum}
            />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "copy") {
    return (
      <div className="space-y-12 bg-repeat py-8">
        {Object.entries(copySizes).map(([sizeKey, copyClass]) => {
          const maxWidth = copyMaxWidth[sizeKey] ?? "48rem";
          return (
            <div key={sizeKey} className="space-y-4">
              {[
                { suffix: "", modifier: "" },
                { suffix: " Italic", modifier: "italic" },
                { suffix: " Mono", modifier: "font-mono" },
              ].map(({ suffix, modifier }) => (
                <TypeSpecimen
                  key={suffix || "regular"}
                  label={`Copy ${sizeKey}${suffix}`}
                  className={cn(copyClass, modifier)}
                  sample={copyLoremIpsum}
                  style={{ maxWidth }}
                />
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === "heading-mono") {
    return (
      <div className="space-y-8 bg-repeat py-8">
        {Object.entries(headingMonoSizes).map(([sizeKey, headingClass]) => (
          <TypeSpecimen
            key={sizeKey}
            label={`Heading Mono ${sizeKey}`}
            className={headingClass}
            sample={loremIpsum}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8 bg-repeat py-8">
      {Object.entries(headingSizes).map(([sizeKey, headingClass]) => (
        <TypeSpecimen
          key={sizeKey}
          label={`Heading ${sizeKey}`}
          className={headingClass}
          sample={loremIpsum}
        />
      ))}
    </div>
  );
};

const meta: Meta<typeof Typography> = {
  title: "Foundations/Typography",
  component: Typography,
  tags: ["autodocs"],
  decorators: [withThemedSurface],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `The Sparkle type scale, rendered in Geist. Covers font sizes (\`text-xs\` to \`text-9xl\`) with weights, heading styles (\`heading-*\` and monospace \`heading-mono-*\`), and copy/body styles (\`copy-*\`, including italic and mono). Use the **variant** control to switch between the font-size, heading, heading-mono, and copy specimens. Click any label to copy its utility class; the caption shows the live computed size / line-height / weight. Reach for these utilities instead of ad-hoc font sizing.`,
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
