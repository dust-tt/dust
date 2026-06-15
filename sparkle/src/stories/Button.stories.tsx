import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { BUTTON_SIZES, BUTTON_VARIANTS } from "@sparkle/components/Button";

import {
  ArrowRight,
  Button,
  Plus,
  Robot,
  Separator,
} from "../index_with_tw_base";

const ICONS = {
  none: null,
  Plus: Plus,
  Robot: Robot,
} as const;

const meta = {
  title: "Actions/Button",
  component: Button,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `Buttons let users trigger an action or event — submitting a form, opening a dialog, or confirming a choice. The button comes in several visual **variants** and three **sizes** (sm / md / lg), and supports a leading and/or trailing icon, loading and disabled states, an inline counter, a dropdown-chevron affordance (**isSelect**), and a fully-rounded shape (**isRounded**).

**When to use**
- To perform an action on the current page (save, delete, open a menu).
- As the primary call-to-action in a form, dialog, or empty state.

**Guidelines**
- Use a single **highlight** button per view; use **outline** or a **ghost** variant for secondary actions.
- Write concise, verb-first labels ("Save changes", not "OK").
- An icon-only button (an **icon** with no **label**) should always have a **tooltip**.
- Set **isLoading** during async work to communicate progress and prevent double submits.`,
      },
    },
  },
  argTypes: {
    variant: {
      description: "The visual style variant of the button",
      options: BUTTON_VARIANTS,
      control: { type: "select" },
    },
    size: {
      description: "The size of the button",
      options: BUTTON_SIZES,
      control: { type: "select" },
    },
    icon: {
      description: "Leading icon (omit the label for an icon-only button)",
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
    },
    iconRight: {
      description: "Trailing icon",
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
    },
    label: {
      description: "Button label (omit for an icon-only button)",
      control: { type: "text" },
    },
    disabled: {
      description: "Whether the button should be disabled",
      control: "boolean",
      defaultValue: false,
    },
    isLoading: {
      description: "Whether the button should display a loading spinner",
      control: "boolean",
    },
    isSelect: {
      description: "Whether the button should display a dropdown chevron",
      control: "boolean",
    },
    isRounded: {
      description: "Whether the button is fully rounded (pill / circular)",
      control: "boolean",
    },
    isPulsing: {
      description: "Whether the button should have a pulsing ring animation",
      control: "boolean",
    },
    isCounter: {
      description: "Whether the button should display an inline counter",
      control: "boolean",
    },
    counterValue: {
      description: "Value to display in the counter (if isCounter is true)",
      control: "text",
      if: { arg: "isCounter", eq: true },
    },
    tooltip: {
      description: "Optional tooltip text to display on hover",
      control: "text",
    },
  },
  render: (args) => <Button {...args} />,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExampleButton: Story = {
  args: {
    variant: "primary",
    label: "Button",
    size: "md",
    isLoading: false,
    isSelect: false,
    isRounded: false,
    isPulsing: false,
    disabled: false,
    isCounter: false,
    counterValue: "1",
  },
};

export const IconOnly: Story = {
  render: () => (
    <div className="s-flex s-items-center s-gap-4">
      <Button size="sm" variant="outline" icon={Plus} tooltip="Add" />
      <Button size="md" variant="outline" icon={Plus} tooltip="Add" />
      <Button size="lg" variant="outline" icon={Plus} tooltip="Add" />
      <Button
        size="md"
        variant="highlight"
        icon={Plus}
        isRounded
        tooltip="Add"
      />
    </div>
  ),
};

const ButtonBySize = ({ size }: { size: (typeof BUTTON_SIZES)[number] }) => (
  <>
    <Separator />
    <h3 className="s-text-primary dark:s-text-primary-50">
      {size.toUpperCase()}
    </h3>
    <div className="s-flex s-flex-col s-gap-4">
      {BUTTON_VARIANTS.map((variant) => (
        <div key={variant} className="s-flex s-flex-col s-gap-2">
          <div className="s-text-sm s-font-medium s-text-primary dark:s-text-primary-night">
            {variant}
          </div>
          <div className="s-flex s-items-center s-gap-4">
            <Button size={size} variant={variant} label="Button" />
            <Button size={size} variant={variant} label="Button" isLoading />
            <Button size={size} variant={variant} icon={Plus} label="Button" />
            <Button
              size={size}
              variant={variant}
              icon={Plus}
              iconRight={ArrowRight}
              label="Button"
            />
            <Button size={size} variant={variant} icon={Plus} tooltip="Add" />
            <Button size={size} variant={variant} label="Button" disabled />
          </div>
        </div>
      ))}
    </div>
  </>
);

export const Gallery: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-4">
      <ButtonBySize size="sm" />
      <ButtonBySize size="md" />
      <ButtonBySize size="lg" />
    </div>
  ),
};
