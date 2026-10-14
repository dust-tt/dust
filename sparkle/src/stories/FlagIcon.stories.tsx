import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { FLAG_SIZES } from "@sparkle/components/FlagIcon";

import {
  FLAG_CODES,
  FLAG_COUNTRY_NAMES,
  FlagIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Assets/Flags/FlagIcon",
  component: FlagIcon,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `Renders a country or region flag from its **code** as a disc, at a consistent **size**. Flags are coloured artwork: unlike stroke icons they ignore the text colour, so there is nothing to theme.

**When to use**
- Country or language selectors, locale badges, phone-number prefixes, and anywhere a region needs a visual anchor next to its name.

**Guidelines**
- The flag carries the country name as its accessible name. Pass \`label=""\` when the name is already visible right next to it, so screen readers do not announce it twice.
- Codes are mostly ISO 3166-1 alpha-2; the full list, with names, is \`FLAG_COUNTRY_NAMES\`.`,
      },
    },
  },
  argTypes: {
    code: {
      description: "Country or region code",
      options: FLAG_CODES,
      control: { type: "select" },
    },
    size: {
      description: "The size of the flag",
      options: FLAG_SIZES,
      control: { type: "select" },
    },
    label: {
      description:
        "Accessible name; defaults to the country name, empty hides it from assistive tech",
      control: { type: "text" },
    },
  },
} satisfies Meta<typeof FlagIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A single flag resolved from its code. Use the controls to switch country and
 * size.
 * @summary Args-driven flag with code and size controls.
 */
export const Default: Story = {
  args: {
    code: "FR",
    size: "sm",
  },
};

/**
 * Every size step, from the 16px list-row glyph to the 48px hero mark.
 * @summary Size scale from xs to xl.
 */
export const Sizes: Story = {
  args: {
    code: "BR",
  },
  render: (args) => (
    <div className="flex items-end gap-4">
      {FLAG_SIZES.map((size) => (
        <div key={size} className="flex flex-col items-center gap-2">
          <FlagIcon {...args} size={size} />
          <span className="text-xs text-muted-foreground">{size}</span>
        </div>
      ))}
    </div>
  ),
};

/**
 * A flag composed in a selector row next to the country name — the documented
 * use case. The visible name carries the meaning, so the flag is hidden from
 * assistive tech with an empty label.
 * @summary Flag paired with its country name in a row.
 */
export const InSelectorRow: Story = {
  args: {
    code: "DE",
    size: "sm",
    label: "",
  },
  render: (args) => (
    <div className="flex items-center gap-2 text-sm text-foreground">
      <FlagIcon {...args} />
      <span>{FLAG_COUNTRY_NAMES[args.code]}</span>
    </div>
  ),
};
