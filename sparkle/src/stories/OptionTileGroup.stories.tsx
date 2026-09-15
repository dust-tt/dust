import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import {
  Monitor01,
  Moon01,
  type OptionTile,
  OptionTileGroup,
  SettingsList,
  Sun,
} from "../index_with_tw_base";

const THEME_OPTIONS: OptionTile<"light" | "dark" | "system">[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon01 },
  { value: "system", label: "Auto", icon: Monitor01 },
];

const specimen = (className: string) => (
  <span className={`${className} text-xl leading-none text-foreground`}>
    Aa
  </span>
);

const FONT_OPTIONS: OptionTile<"sans" | "serif" | "dyslexic">[] = [
  { value: "sans", label: "Sans serif", visual: specimen("font-sans") },
  { value: "serif", label: "Serif", visual: specimen("font-serif") },
  {
    value: "dyslexic",
    label: "Dyslexic-friendly",
    visual: specimen("font-dyslexic"),
  },
];

const meta = {
  title: "Components/OptionTileGroup",
  component: OptionTileGroup,
  parameters: {
    docs: {
      description: {
        component: `A single-select row of equal-width tiles, each with an \`icon\` (or a custom \`visual\`) above a \`label\`; the current \`value\` is outlined. Built on a radio group: arrow keys move the selection and the whole row announces as one control named by \`ariaLabel\`.

**When to use**
- For 2-4 mutually exclusive settings where a glyph makes the options scannable at a glance (theme, font, density).

**Guidelines**
- Keep labels to one or two words; tiles share the row width equally and truncate.
- Prefer \`icon\` for abstract choices and \`visual\` when the option can show itself (a type specimen, a swatch).
- For longer or descriptive options use **RadioGroup**; for agent-prompt answers use **OptionCard**.`,
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof OptionTileGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

function ThemeTiles() {
  const [value, setValue] = useState<"light" | "dark" | "system">("light");
  return (
    <div className="w-[480px]">
      <OptionTileGroup
        ariaLabel="Theme"
        options={THEME_OPTIONS}
        value={value}
        onValueChange={setValue}
      />
    </div>
  );
}

/**
 * Three icon tiles for a theme setting. Click a tile or use the arrow keys.
 * @summary Icon tiles (theme).
 */
export const Theme: Story = {
  args: {
    ariaLabel: "Theme",
    options: THEME_OPTIONS,
    value: "light",
    onValueChange: () => {},
  },
  render: () => <ThemeTiles />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dark = canvas.getByRole("radio", { name: "Dark" });
    await userEvent.click(dark);
    await expect(dark).toHaveAttribute("aria-checked", "true");
    await expect(canvas.getByRole("radio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  },
};

function FontTiles() {
  const [value, setValue] = useState<"sans" | "serif" | "dyslexic">("sans");
  return (
    <div className="w-[480px]">
      <OptionTileGroup
        ariaLabel="Conversation font"
        options={FONT_OPTIONS}
        value={value}
        onValueChange={setValue}
      />
    </div>
  );
}

/**
 * Tiles using `visual` to show a type specimen in each font instead of an icon.
 * @summary Custom visuals (font specimens).
 */
export const FontSpecimens: Story = {
  args: {
    ariaLabel: "Conversation font",
    options: FONT_OPTIONS,
    value: "sans",
    onValueChange: () => {},
  },
  render: () => <FontTiles />,
};

/**
 * Inside a `SettingsList.Row`, using the row's full-width `children` slot
 * because three tiles are too wide for the trailing `action` slot.
 * @summary In a settings row.
 */
export const InSettingsRow: Story = {
  args: {
    ariaLabel: "Theme",
    options: THEME_OPTIONS,
    value: "light",
    onValueChange: () => {},
  },
  render: () => (
    <div className="w-[560px]">
      <SettingsList>
        <SettingsList.Row title="Theme" description="Choose how Dust looks">
          <ThemeTiles />
        </SettingsList.Row>
        <SettingsList.Row
          title="Conversation font"
          description="Font used for agent answers"
        >
          <FontTiles />
        </SettingsList.Row>
      </SettingsList>
    </div>
  ),
};

/**
 * Whole group disabled.
 * @summary Disabled.
 */
export const Disabled: Story = {
  args: {
    ariaLabel: "Theme",
    options: THEME_OPTIONS,
    value: "dark",
    onValueChange: () => {},
    disabled: true,
  },
  render: (args) => (
    <div className="w-[480px]">
      <OptionTileGroup {...args} />
    </div>
  ),
};
