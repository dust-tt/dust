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
const extendedColorFamilies = [
  "blue",
  "violet",
  "pink",
  "red",
  "orange",
  "golden",
  "lime",
  "emerald",
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

const semanticShades = [
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
  "muted",
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
      <div className="s-absolute s-bottom-1 s-left-1 s-font-mono s-text-[10px] s-opacity-50">
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

export const UIColorPalette = () => {
  return (
    <div className="s-flex s-flex-col s-gap-8">
      <div className="s-flex s-flex-col s-gap-2">
        <h2 className="s-text-xl s-font-semibold">UI Color Palette</h2>
        <p className="s-text-sm s-text-primary-600 dark:s-text-primary-400">
          Colors to use in the UI for all direct color references.
        </p>
      </div>
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
      <div className="s-flex s-flex-col s-gap-2">
        <h2 className="s-text-xl s-font-semibold">Semantic Color Palette</h2>
        <p className="s-text-sm s-text-primary-600 dark:s-text-primary-400">
          Colors to use in the UI for all functional elements.
        </p>
      </div>
      {semanticColorFamilies.map((family) => (
        <div key={family} className="s-flex s-flex-col s-gap-4">
          <h3 className="s-text-lg s-font-semibold s-capitalize">{family}</h3>
          <div className="s-flex s-flex-wrap s-gap-4">
            {semanticShades.map((shade) => (
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
      <div className="s-flex s-flex-col s-gap-2">
        <h2 className="s-text-xl s-font-semibold">Brand Color Palette</h2>
        <p className="s-text-sm s-text-primary-600 dark:s-text-primary-400">
          Colors to use in Marketing / Brand situations:
        </p>
        <ul className="s-ml-4 s-list-disc s-text-sm s-text-primary-600 dark:s-text-primary-400">
          <li>Block colors on the website</li>
          <li>Communication in the product</li>
        </ul>
      </div>
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

export const ExtendedColorPalette = () => {
  return (
    <div className="s-flex s-flex-col s-gap-8">
      <div className="s-flex s-flex-col s-gap-2">
        <h2 className="s-text-xl s-font-semibold">Extended Color Palette</h2>
        <p className="s-text-sm s-text-primary-600 dark:s-text-primary-400">
          These colors are available for product-specific use cases where
          semantic colors might not be appropriate. Use them when you need to
          create visual distinctions, such as:
        </p>
        <ul className="s-ml-4 s-list-disc s-text-sm s-text-primary-600 dark:s-text-primary-400">
          <li>Avatar background colors</li>
          <li>Data visualization</li>
        </ul>
      </div>
      {extendedColorFamilies.map((family) => (
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

const backgroundColors = ["background", "muted-background"] as const;

export const BackgroundColors = () => {
  return (
    <div className="s-flex s-flex-col s-gap-8">
      <div className="s-flex s-flex-col s-gap-2">
        <h2 className="s-text-xl s-font-semibold">Background Colors</h2>
        <p className="s-text-sm s-text-primary-600 dark:s-text-primary-400">
          Background colors used for structural elements in the UI.
        </p>
      </div>
      <div className="s-flex s-flex-wrap s-gap-4">
        {backgroundColors.map((bg) => (
          <div key={bg}>
            <ColorSwatch
              colorClass={`s-bg-${bg} dark:s-bg-${bg}-night`}
              label={bg}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
