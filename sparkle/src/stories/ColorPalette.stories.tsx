import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  TokenTable,
  type TokenRow,
  semanticFamilyTokens,
  structuralTokens,
  useColorFamilies,
  useThemeColorTokens,
  withThemedSurface,
} from "./foundations-helpers";

const meta = {
  title: "Foundations/Colors",
  tags: ["!manifest", "autodocs"],
  decorators: [withThemedSurface],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `The Sparkle color system: UI primitives, semantic tokens (\`primary\`, \`highlight\`, \`success\`, \`warning\`, \`info\`), an extended product palette, brand/marketing colors, and structural backgrounds. Reference these via Tailwind classes (e.g. \`bg-primary-500\`) rather than hard-coded hex values, and prefer semantic tokens over raw families so components stay theme-aware. Each token is shown as a reference row: swatch, a click-to-copy \`bg-*\` chip, its live value (read from the compiled CSS variables), and — for structural and brand tokens — a description. Toggle the theme in the toolbar to see semantic tokens resolve to their dark values; hover a swatch for its best text-contrast grade.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// Build the rows for a shade ramp, resolving each to `--color-{family}-{shade}`
// and copying `bg-{family}-{shade}`.
const rampRows = (family: string, shades: readonly string[]): TokenRow[] =>
  shades.map((shade) => ({
    varName: `--color-${family}-${shade}`,
    name: `${family}-${shade}`,
    copyValue: `bg-${family}-${shade}`,
  }));

const Section = ({
  title,
  description,
  children,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-8">
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description}
    </div>
    {children}
  </div>
);

const FamilyTables = ({
  families,
  shades,
}: {
  families: readonly string[];
  shades: readonly string[];
}) => (
  <div className="flex flex-col gap-10">
    {families.map((family) => (
      <div key={family} className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold capitalize">{family}</h3>
        <TokenTable rows={rampRows(family, shades)} />
      </div>
    ))}
  </div>
);

const uiColorFamilies = ["gray", "rose", "green", "blue", "golden"] as const;
const semanticColorFamilies = [
  "primary",
  "highlight",
  "success",
  "warning",
  "info",
] as const;
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

// Build table rows from a list of token names (e.g. `primary-500`, `foreground`).
const tokenRows = (
  names: string[],
  describe?: (name: string) => React.ReactNode
): TokenRow[] =>
  names.map((name) => ({
    varName: `--color-${name}`,
    name,
    copyValue: `bg-${name}`,
    description: describe?.(name),
  }));

export const UIColorPalette: Story = {
  render: () => (
    <Section
      title="UI Color Palette"
      description={
        <p className="text-sm text-primary-600">
          Colors to use in the UI for all direct color references.
        </p>
      }
    >
      <FamilyTables families={uiColorFamilies} shades={shades} />
    </Section>
  ),
};

export const SemanticColorPalette: Story = {
  render: () => {
    const tokens = useThemeColorTokens();
    return (
      <Section
        title="Semantic Color Palette"
        description={
          <p className="text-sm text-primary-600">
            Colors to use in the UI for all functional elements — the base
            token, its light / dark / muted / on variants, and the full shade
            ramp. Toggle the theme to preview their dark values.
          </p>
        }
      >
        <div className="flex flex-col gap-10">
          {semanticColorFamilies.map((family) => (
            <div key={family} className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold capitalize">{family}</h3>
              <TokenTable
                rows={tokenRows(semanticFamilyTokens(tokens, family))}
              />
            </div>
          ))}
        </div>
      </Section>
    );
  },
};

// Brand tokens are named colors (not ramps); each resolves to its own
// `--color-brand-{name}` variable. Descriptions make this table read like the
// design-system reference.
const brandRows: TokenRow[] = [
  {
    name: "hunter-green",
    description: "Primary brand green — dark, high-emphasis blocks.",
  },
  { name: "tea-green", description: "Light brand green for softer blocks." },
  {
    name: "support-green",
    description: "Lightest green tint for backgrounds.",
  },
  { name: "electric-blue", description: "Primary brand blue." },
  { name: "sky-blue", description: "Light brand blue for softer blocks." },
  { name: "support-blue", description: "Lightest blue tint for backgrounds." },
  { name: "red-rose", description: "Primary brand rose/red." },
  { name: "pink-rose", description: "Light brand rose for softer blocks." },
  { name: "support-rose", description: "Lightest rose tint for backgrounds." },
  { name: "orange-golden", description: "Primary brand golden/orange." },
  {
    name: "sunshine-golden",
    description: "Light brand golden for softer blocks.",
  },
  {
    name: "support-golden",
    description: "Lightest golden tint for backgrounds.",
  },
  { name: "dark-gray", description: "Dark brand neutral." },
  { name: "light-gray", description: "Light brand neutral." },
  {
    name: "support-gray",
    description: "Lightest neutral tint for backgrounds.",
  },
].map(({ name, description }) => ({
  varName: `--color-brand-${name}`,
  name,
  copyValue: `bg-brand-${name}`,
  description,
}));

export const BrandColorPalette: Story = {
  render: () => (
    <Section
      title="Brand Color Palette"
      description={
        <>
          <p className="text-sm text-primary-600">
            Colors to use in Marketing / Brand situations:
          </p>
          <ul className="ml-4 list-disc text-sm text-primary-600">
            <li>Block colors on the website</li>
            <li>Communication in the product</li>
          </ul>
        </>
      }
    >
      <TokenTable rows={brandRows} />
    </Section>
  ),
};

export const ExtendedColorPalette: Story = {
  render: () => {
    // Discovered from the compiled CSS (minus the semantic families, which have
    // their own section), so every raw palette — stone, slate, cyan, … — shows
    // up automatically with the exact shades it defines.
    const families = useColorFamilies(semanticColorFamilies);
    return (
      <Section
        title="Extended Color Palette"
        description={
          <>
            <p className="text-sm text-primary-600">
              The complete set of raw color palettes, available for
              product-specific use cases where semantic colors might not be
              appropriate. Use them when you need to create visual distinctions,
              such as:
            </p>
            <ul className="ml-4 list-disc text-sm text-primary-600">
              <li>Avatar background colors</li>
              <li>Data visualization</li>
            </ul>
          </>
        }
      >
        <div className="flex flex-col gap-10">
          {families.map(({ family, shades: familyShades }) => (
            <div key={family} className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold capitalize">{family}</h3>
              <TokenTable rows={rampRows(family, familyShades)} />
            </div>
          ))}
        </div>
      </Section>
    );
  },
};

// Descriptions for the named structural/surface tokens. Tokens without an
// entry still render (with a "—" description) — this map only enriches the
// ones whose intent is well established.
const structuralDescriptions: Record<string, string> = {
  background: "Default app/page background.",
  "app-background": "App shell background behind panels.",
  "panel-background": "Background for panels and cards.",
  "overlay-background":
    "Raised surface for tooltips, popovers, and dropdowns (elevated above panels).",
  "modal-background": "Surface for dialogs and sheets — the highest elevation.",
  "muted-background": "Subtle background for muted or secondary surfaces.",
  muted: "Muted surface fill.",
  faint: "Faintest surface tint.",
  foreground: "Default text color.",
  "muted-foreground": "Lower-emphasis text (captions, hints).",
  "foreground-warning": "Text color for warning states.",
  border: "Default border color.",
  "border-dark": "Higher-contrast border.",
  "border-focus": "Border color for focused elements.",
  "border-warning": "Border color for warning states.",
  hover: "Translucent tint for hovered elements — composites over any surface.",
  selected:
    "Translucent tint for selected elements — a stronger step than hover.",
  loading:
    "Translucent fill for skeleton placeholders (LoadingBlock) — reads on any surface.",
  ring: "Focus ring color.",
  "ring-warning": "Focus ring for warning states.",
  separator: "Divider line color.",
  "sidebar-foreground": "Sidebar text color.",
  "sidebar-primary": "Sidebar primary / active accent.",
};

export const SurfaceAndStructural: Story = {
  render: () => {
    const tokens = useThemeColorTokens();
    // Structural tokens are used across many properties (bg / text / border),
    // so the chip copies the CSS variable rather than a single `bg-*` class.
    const rows: TokenRow[] = structuralTokens(tokens).map((name) => ({
      varName: `--color-${name}`,
      name,
      copyValue: `--color-${name}`,
      description: structuralDescriptions[name],
    }));
    return (
      <Section
        title="Surface & Structural"
        description={
          <p className="text-sm text-primary-600">
            Structural tokens for backgrounds, text, borders, and other UI
            surfaces. These flip with the theme — toggle it to preview dark
            values.
          </p>
        }
      >
        <TokenTable rows={rows} />
      </Section>
    );
  },
};
