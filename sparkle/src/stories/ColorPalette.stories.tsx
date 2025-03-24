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
  "info",
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
        "s-h-16 s-w-24 s-rounded-lg s-border s-border-border dark:s-border-border-night",
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

const brandColorFamilies = [
  {
    name: "green",
    shades: [
      { name: "hunter-green", shade: 600 },
      { name: "tea-green", shade: 200 },
      { name: "support-green", shade: 50 },
    ],
  },
  {
    name: "blue",
    shades: [
      { name: "electric-blue", shade: 500 },
      { name: "sky-blue", shade: 200 },
      { name: "support-blue", shade: 50 },
    ],
  },
  {
    name: "rose",
    shades: [
      { name: "red-rose", shade: 500 },
      { name: "pink-rose", shade: 200 },
      { name: "support-rose", shade: 50 },
    ],
  },
  {
    name: "golden",
    shades: [
      { name: "orange-golden", shade: 500 },
      { name: "sunshine-golden", shade: 200 },
      { name: "support-golden", shade: 50 },
    ],
  },
  {
    name: "gray",
    shades: [
      { name: "dark-gray", shade: 700 },
      { name: "light-gray", shade: 200 },
      { name: "support-gray", shade: 50 },
    ],
  },
];

export const BrandColorPalette = () => {
  return (
    <div className="s-flex s-flex-col s-gap-8">
      {brandColorFamilies.map((family) => (
        <div key={family.name} className="s-flex s-flex-col s-gap-4">
          <h3 className="s-text-lg s-font-semibold s-capitalize">
            {family.name}
          </h3>
          <div className="s-flex s-flex-wrap s-gap-4">
            {family.shades.map((shade) => (
              <div key={shade.name}>
                <ColorSwatch
                  colorClass={`s-bg-${family.name}-${shade.shade} dark:s-bg-${family.name}-${shade.shade}-night`}
                  label={shade.name}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
