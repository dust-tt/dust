import type { Meta } from "@storybook/react";
import React from "react";

import { cn } from "@sparkle/lib";

const meta = {
  title: "Theme/Colors",
} satisfies Meta;

export default meta;

// Color families to display
const colorFamilies = ["gray", "rose", "green", "blue", "golden"] as const;
const semanticColorFamilies = [
  "primary",
  "highlight",
  "success",
  "warning",
] as const;

// Shades to display for each color
const shades = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
] as const;

const ColorSwatch = ({
  colorClass,
  label,
}: {
  colorClass: string;
  label: string;
}) => (
  <div className="s-flex s-flex-col s-gap-2">
    <div
      className={cn(
        "s-h-16 s-w-24 s-rounded-lg s-border s-border-border",
        colorClass
      )}
      style={{
        position: "relative",
      }}
    >
      <div className="s-font-mono s-absolute s-bottom-1 s-left-1 s-text-[10px] s-opacity-50">
        {getComputedStyle(document.documentElement)
          .getPropertyValue(
            `--${colorClass.replace("s-bg-", "").replace(":", "-")}`
          )
          .trim()}
      </div>
    </div>
    <div className="s-font-mono s-text-xs">{label}</div>
  </div>
);

export const ColorPalette = () => {
  return (
    <div className="s-flex s-flex-col s-gap-8">
      {colorFamilies.map((family) => (
        <div key={family} className="s-flex s-flex-col s-gap-4">
          <h3 className="s-text-lg s-font-semibold s-capitalize">{family}</h3>
          <div className="s-flex s-flex-wrap s-gap-4">
            {shades.map((shade) => (
              <div key={shade}>
                <ColorSwatch
                  colorClass={`s-bg-${family}-${shade} dark:s-bg-${family}-${shade}-night`}
                  label={`${family}-${shade}`}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export const SemanticColorPalette = () => {
  return (
    <div className="s-flex s-flex-col s-gap-8">
      {semanticColorFamilies.map((family) => (
        <div key={family} className="s-flex s-flex-col s-gap-4">
          <h3 className="s-text-lg s-font-semibold s-capitalize">{family}</h3>
          <div className="s-flex s-flex-wrap s-gap-4">
            {shades.map((shade) => (
              <div key={shade}>
                <ColorSwatch
                  colorClass={`s-bg-${family}-${shade} dark:s-bg-${family}-${shade}-night`}
                  label={`${family}-${shade}`}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
