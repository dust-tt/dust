import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import { CHIP_COLORS, CHIP_SIZES } from "@sparkle/components/Chip";

import { Chip, Users01 } from "../index_with_tw_base";

const ICONS = {
  none: null,
  Users01: Users01,
} as const;

const meta = {
  title: "Data Display/Chip",
  component: Chip,
  tags: ["a11y-issues", "autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `A compact, mostly read-only label for surfacing a status, category, or short piece of metadata. Chips come in several **sizes** and **colors** and can show a leading **icon**, a breathing "busy" animation (**isBusy**), become clickable, or expose a remove affordance (**onRemove**).

**When to use**
- To display statuses, tags, categories, or active filters.
- To represent a transient processing state (e.g. "Thinking, Searching") with **isBusy**.

**Guidelines**
- Keep labels to one or two words.
- Use **color** meaningfully — \`success\`, \`warning\`, and \`info\` should match their intent.
- Add **onRemove** only when the chip represents something the user can dismiss (like a filter).
- For a primary action, use a **Button**, not a chip.`,
      },
    },
  },
  argTypes: {
    size: {
      options: CHIP_SIZES,
      control: { type: "select" },
      description: "Size of the chip",
      defaultValue: "xs",
    },
    color: {
      options: CHIP_COLORS,
      control: { type: "select" },
      description: "Color variant of the chip",
      defaultValue: "slate",
    },
    label: {
      control: "text",
      description: "Text to display in the chip",
    },
    isBusy: {
      control: "boolean",
      description: "Whether to show the breathing animation",
      defaultValue: false,
    },
    icon: {
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
      description: "Optional icon to display",
      defaultValue: "none",
    },
  },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The resting chip: a short, read-only label for a status or category.
 *
 * @summary Resting read-only chip.
 */
export const Default: Story = {
  args: {
    label: "Marketing",
    size: "sm",
    color: "primary",
    isBusy: false,
  },
};

/**
 * `isBusy` adds a breathing animation for transient processing states, such
 * as an agent that is thinking or searching.
 *
 * @summary Breathing busy animation.
 */
export const Busy: Story = {
  args: {
    label: "Thinking, Searching",
    size: "sm",
    color: "primary",
    isBusy: true,
  },
};

/**
 * A leading `icon` reinforces what the chip represents (here, a group of
 * users).
 *
 * @summary Chip with a leading icon.
 */
export const WithIcon: Story = {
  args: {
    label: "Team",
    size: "sm",
    color: "primary",
    icon: Users01,
  },
};

/**
 * `onRemove` adds a dismiss affordance — use it when the chip represents
 * something the user can clear, like an active filter.
 *
 * @summary Dismissible chip with a remove button.
 */
export const Removable: Story = {
  args: {
    label: "Active filter",
    size: "sm",
    color: "info",
    onRemove: fn(),
  },
};

/**
 * Every chip size side by side, from `mini` (dense inline metadata) up.
 *
 * @summary All sizes side by side.
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      {CHIP_SIZES.map((size) => (
        <Chip key={size} size={size} color="primary" label={size} />
      ))}
    </div>
  ),
};

/**
 * Visual reference: every color, plain and with click/remove affordances. For
 * design review — not a usage example.
 *
 * @summary Visual reference of all colors.
 */
export const AllColors: Story = {
  tags: ["!manifest"],
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {CHIP_COLORS.map((color) => (
          <Chip key={color} size="sm" color={color} label={color} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {CHIP_COLORS.map((color) => (
          <Chip
            key={color}
            size="sm"
            color={color}
            label={color}
            onClick={fn()}
            onRemove={fn()}
          />
        ))}
      </div>
    </div>
  ),
};
