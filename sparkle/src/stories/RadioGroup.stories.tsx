import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Download01,
  Folder,
  Icon,
  Label,
  Lock01,
  RadioGroup,
  RadioGroupCustomItem,
  RadioGroupItem,
} from "@sparkle/index_with_tw_base";

const meta = {
  title: "Forms & Inputs/RadioGroup",
  component: RadioGroup,
  parameters: {
    docs: {
      description: {
        component: `Presents a set of mutually exclusive options where exactly one can be selected at a time. Use **RadioGroupItem** for standard labelled options (with optional icon, tooltip, and sizes), or **RadioGroupCustomItem** to render richer custom content per option.

**When to use**
- To choose a single value from a small set (roughly 2–6 options) that are all worth showing at once.

**Guidelines**
- For many options, or to save space, use a **Dropdown** instead.
- To select more than one value, use **Checkbox**.
- Give the group a sensible **defaultValue** so one option is always selected.
- Keep option labels parallel in length and phrasing.`,
      },
    },
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A standard group of labelled options with a **defaultValue** so one option
 * is always selected.
 * @summary Standard labelled radio group.
 */
export const Default: Story = {
  args: {
    defaultValue: "all-messages",
  },
  render: (args) => (
    <RadioGroup {...args}>
      <RadioGroupItem
        value="all-messages"
        id="all-messages"
        label="All new messages"
      />
      <RadioGroupItem
        value="mentions-only"
        id="mentions-only"
        label="Mentions only"
      />
      <RadioGroupItem value="nothing" id="nothing" label="Nothing" />
    </RadioGroup>
  ),
};

/**
 * Each **RadioGroupItem** accepts an optional **icon** rendered next to its
 * label, useful when options map to distinct destinations or modes.
 * @summary Options with leading icons.
 */
export const WithIcons: Story = {
  args: {
    defaultValue: "workspace",
  },
  render: (args) => (
    <RadioGroup {...args}>
      <RadioGroupItem
        value="workspace"
        id="workspace"
        label="Workspace folder"
        icon={Folder}
      />
      <RadioGroupItem
        value="downloads"
        id="downloads"
        label="Downloads"
        icon={Download01}
      />
      <RadioGroupItem
        value="private"
        id="private"
        label="Private space"
        icon={Lock01}
      />
    </RadioGroup>
  ),
};

/**
 * Individual options can be disabled with the **disabled** prop; the rest of
 * the group stays interactive.
 * @summary Group with a disabled option.
 */
export const Disabled: Story = {
  args: {
    defaultValue: "standard",
  },
  render: (args) => (
    <RadioGroup {...args}>
      <RadioGroupItem value="standard" id="standard" label="Standard plan" />
      <RadioGroupItem
        value="enterprise"
        id="enterprise"
        label="Enterprise plan (contact sales)"
        disabled
      />
      <RadioGroupItem value="free" id="free" label="Free plan" />
    </RadioGroup>
  ),
};

/**
 * **RadioGroupCustomItem** replaces the plain label with arbitrary content
 * via **customItem**, and renders optional **children** below the row —
 * here an icon + label pair with a muted description.
 * @summary Options with custom rendered content.
 */
export const CustomItemContent: Story = {
  args: {
    defaultValue: "private",
  },
  render: (args) => {
    const choices = [
      {
        id: "private",
        label: "Private",
        icon: Lock01,
        description: "Only you can access this space.",
      },
      {
        id: "shared",
        label: "Shared",
        icon: Folder,
        description: "Everyone in the workspace can access this space.",
      },
    ];
    return (
      <RadioGroup {...args}>
        {choices.map((choice) => (
          <RadioGroupCustomItem
            key={choice.id}
            value={choice.id}
            id={choice.id}
            iconPosition="start"
            customItem={
              <Label
                htmlFor={choice.id}
                className="flex items-center gap-2 font-medium"
              >
                <Icon visual={choice.icon} />
                {choice.label}
              </Label>
            }
          >
            <span className="pl-6 text-sm text-muted-foreground">
              {choice.description}
            </span>
          </RadioGroupCustomItem>
        ))}
      </RadioGroup>
    );
  },
};
