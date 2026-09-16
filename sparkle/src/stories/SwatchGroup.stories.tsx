import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import {
  Button,
  OptionTileGroup,
  SettingsList,
  Sun,
  type SwatchOption,
  SwatchGroup,
} from "../index_with_tw_base";

const ACCENTS = [
  "blue",
  "violet",
  "pink",
  "rose",
  "red",
  "orange",
  "golden",
  "lime",
  "green",
  "emerald",
] as const;
type Accent = (typeof ACCENTS)[number];

const OPTIONS: SwatchOption<Accent>[] = ACCENTS.map((c) => ({
  value: c,
  label: c[0].toUpperCase() + c.slice(1),
  className: `bg-${c}-500`,
}));

const meta = {
  title: "Components/SwatchGroup",
  component: SwatchGroup,
  parameters: {
    docs: {
      description: {
        component: `A single-select row of round color swatches; the current \`value\` is ringed in the foreground color. Built on a radio group: arrow keys move the selection and each swatch is named by its \`label\` (also shown as a hover title).

**When to use**
- When the option *is* a color: accent color, tag or label color.

**Guidelines**
- Paint each swatch with a palette \`className\` such as \`bg-rose-500\`; keep one step (500) across the row so the swatches compare fairly.
- For options that need a visible label or a glyph, use **OptionTileGroup** instead.`,
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof SwatchGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

function Swatches() {
  const [value, setValue] = useState<Accent>("blue");
  return (
    <SwatchGroup
      ariaLabel="Accent color"
      options={OPTIONS}
      value={value}
      onValueChange={setValue}
    />
  );
}

/**
 * The ten palette scales as swatches. Click or use arrow keys.
 * @summary Palette swatches.
 */
export const Palette: Story = {
  args: {
    ariaLabel: "Accent color",
    options: OPTIONS,
    value: "blue",
    onValueChange: () => {},
  },
  render: () => <Swatches />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rose = canvas.getByRole("radio", { name: "Rose" });
    await userEvent.click(rose);
    await expect(rose).toHaveAttribute("aria-checked", "true");
  },
};

/**
 * In a `SettingsList.Row` action slot, the way the accent color setting uses it.
 * @summary In a settings row.
 */
export const InSettingsRow: Story = {
  args: {
    ariaLabel: "Accent color",
    options: OPTIONS,
    value: "blue",
    onValueChange: () => {},
  },
  render: () => (
    <div className="w-[640px]">
      <SettingsList>
        <SettingsList.Row
          title="Accent color"
          description="Used for highlights, selection and links"
          action={<Swatches />}
        />
      </SettingsList>
    </div>
  ),
};

function AccentPreview({ accent }: { accent: Accent }) {
  const [tile, setTile] = useState<"a" | "b">("a");
  return (
    <div
      data-accent={accent === "blue" ? undefined : accent}
      className="flex flex-col gap-3 rounded-2xl border border-border dark:border-border-dark p-4"
    >
      <span className="label-sm text-muted-foreground">{accent}</span>
      <div className="flex items-center gap-3">
        <Button variant="highlight" size="sm" label="Highlight" />
        <span className="text-highlight heading-sm">Link text</span>
        <span className="rounded-lg bg-highlight-50 px-2 py-1 copy-sm text-highlight-dark">
          Tinted
        </span>
      </div>
      <OptionTileGroup
        ariaLabel={`Preview ${accent}`}
        options={[
          { value: "a", label: "Selected", icon: Sun },
          { value: "b", label: "Other", icon: Sun },
        ]}
        value={tile}
        onValueChange={setTile}
      />
    </div>
  );
}

/**
 * What the `highlight` tokens become under each accent: every block is
 * wrapped in `data-accent`, which `tokens.css` remaps to that palette scale
 * (mirrored in dark mode). The real app sets the attribute on <html>.
 * @summary Highlight tokens under each accent.
 */
export const AccentTokens: Story = {
  args: {
    ariaLabel: "Accent color",
    options: OPTIONS,
    value: "blue",
    onValueChange: () => {},
  },
  render: () => (
    <div className="grid w-[960px] grid-cols-2 gap-4">
      {ACCENTS.map((a) => (
        <AccentPreview key={a} accent={a} />
      ))}
    </div>
  ),
};
