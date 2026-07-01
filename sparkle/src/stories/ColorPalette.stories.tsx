import type { Meta } from "@storybook/react";
import React from "react";
import tailwindColors from "tailwindcss/colors";

import { customColors } from "@sparkle/lib/colors";

const meta = {
  title: "Foundations/Colors",
  parameters: {
    docs: {
      description: {
        component: `The Sparkle color system: UI primitives, semantic tokens (\`primary\`, \`highlight\`, \`success\`, \`warning\`, \`info\`), an extended product palette, brand/marketing colors, and structural backgrounds. Reference these via Tailwind classes (e.g. \`bg-primary-500\`) rather than hard-coded hex values, and prefer semantic tokens over raw families so components stay theme-aware. Toggle the theme in the toolbar to preview light and dark (\`-night\`) values.`,
      },
    },
  },
} satisfies Meta;

export default meta;

// The swatches below build their class names dynamically (e.g.
// `bg-${family}-${shade}`), which Tailwind's JIT scanner cannot see, so the
// corresponding `bg-*` utilities are never generated and the swatches render
// blank. Instead we resolve each token to its hex value and apply it via an
// inline style — independent of Tailwind utility generation.
//
// Families mirror the design-system theme: Sparkle overrides gray/blue/green/
// rose/golden (from `customColors`); the remaining product families fall back
// to Tailwind's defaults.
type Palette = Record<string, string>;
const families: Record<string, Palette> = {
  gray: customColors.gray,
  blue: customColors.blue,
  green: customColors.green,
  rose: customColors.rose,
  golden: customColors.golden,
  violet: tailwindColors.violet,
  pink: tailwindColors.pink,
  red: tailwindColors.red,
  orange: tailwindColors.orange,
  lime: tailwindColors.lime,
  emerald: tailwindColors.emerald,
};

// Semantic tokens map onto a base family; in dark mode their shade is inverted
// (matching the theme's auto-generated `-night` values). `muted` is a fixed tint.
const semanticBase: Palette = {
  primary: "gray",
  highlight: "blue",
  success: "green",
  warning: "rose",
  info: "golden",
};
const semanticMuted: Palette = {
  primary: customColors.gray[500],
  highlight: "#8EB2D3",
  success: "#A9B8A9",
  warning: "#D5AAA1",
  info: "#E1C99B",
};

const resolveColor = (token: string, isDark: boolean): string | undefined => {
  if (token === "background") {
    return isDark ? customColors.gray[950] : "#FFFFFF";
  }
  if (token === "muted-background") {
    return isDark ? customColors.gray[900] : customColors.gray[50];
  }

  const dash = token.lastIndexOf("-");
  const family = token.slice(0, dash);
  const shade = token.slice(dash + 1);

  if (family in semanticBase) {
    if (shade === "muted") {
      return semanticMuted[family];
    }
    const base = families[semanticBase[family]];
    const nightShade = Math.min(950, 1000 - Number(shade));
    return base[isDark ? String(nightShade) : shade];
  }

  // Raw and extended palettes are absolute colors; show the same value in both
  // themes.
  return families[family]?.[shade];
};

// Track the active theme so semantic swatches can preview their dark value.
const useIsDark = () => {
  const [isDark, setIsDark] = React.useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
  );
  React.useEffect(() => {
    const el = document.documentElement;
    const update = () => setIsDark(el.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
};

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

const ColorSwatch = ({ token, label }: { token: string; label: string }) => {
  const isDark = useIsDark();
  const color = resolveColor(token, isDark);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative h-16 w-24 rounded-lg border border-border"
        style={{ backgroundColor: color }}
      >
        <div className="absolute bottom-1 left-1 font-mono text-[10px] text-foreground opacity-50">
          {color ?? "—"}
        </div>
      </div>
      <div className="font-mono text-xs">{label}</div>
    </div>
  );
};

export const UIColorPalette = () => {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">UI Color Palette</h2>
        <p className="text-sm text-primary-600">
          Colors to use in the UI for all direct color references.
        </p>
      </div>
      {colorFamilies.map((family) => (
        <div key={family} className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold capitalize">{family}</h3>
          <div className="flex flex-wrap gap-4">
            {shades.map((shade) => (
              <div key={shade}>
                <ColorSwatch
                  token={`${family}-${shade}`}
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Semantic Color Palette</h2>
        <p className="text-sm text-primary-600">
          Colors to use in the UI for all functional elements.
        </p>
      </div>
      {semanticColorFamilies.map((family) => (
        <div key={family} className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold capitalize">{family}</h3>
          <div className="flex flex-wrap gap-4">
            {semanticShades.map((shade) => (
              <div key={shade}>
                <ColorSwatch
                  token={`${family}-${shade}`}
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Brand Color Palette</h2>
        <p className="text-sm text-primary-600">
          Colors to use in Marketing / Brand situations:
        </p>
        <ul className="ml-4 list-disc text-sm text-primary-600">
          <li>Block colors on the website</li>
          <li>Communication in the product</li>
        </ul>
      </div>
      {brandColorFamilies.map((family) => (
        <div key={family.name} className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold capitalize">{family.name}</h3>
          <div className="flex flex-wrap gap-4">
            {family.shades.map((shade) => (
              <div key={shade.name}>
                <ColorSwatch
                  token={`${family.name}-${shade.shade}`}
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Extended Color Palette</h2>
        <p className="text-sm text-primary-600">
          These colors are available for product-specific use cases where
          semantic colors might not be appropriate. Use them when you need to
          create visual distinctions, such as:
        </p>
        <ul className="ml-4 list-disc text-sm text-primary-600">
          <li>Avatar background colors</li>
          <li>Data visualization</li>
        </ul>
      </div>
      {extendedColorFamilies.map((family) => (
        <div key={family} className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold capitalize">{family}</h3>
          <div className="flex flex-wrap gap-4">
            {shades.map((shade) => (
              <div key={shade}>
                <ColorSwatch
                  token={`${family}-${shade}`}
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Background Colors</h2>
        <p className="text-sm text-primary-600">
          Background colors used for structural elements in the UI.
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        {backgroundColors.map((bg) => (
          <div key={bg}>
            <ColorSwatch token={bg} label={bg} />
          </div>
        ))}
      </div>
    </div>
  );
};
