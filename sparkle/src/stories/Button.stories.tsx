import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { BUTTON_VARIANTS, ICON_ONLY_SIZES, REGULAR_BUTTON_SIZES, RegularButtonSize } from "@sparkle/components/Button";

import { Button, PlusIcon, RobotIcon, Separator } from "../index_with_tw_base";

const ICONS = {
  none: null,
  PlusIcon: PlusIcon,
  RobotIcon: RobotIcon,
} as const;

const meta = {
  title: "Primitives/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      description: "The visual style variant of the button",
      options: BUTTON_VARIANTS,
      control: { type: "select" },
    },
    size: {
      description: `The size of the button. Use "icon" or "icon-xs" for icon-only buttons`,
      options: [...REGULAR_BUTTON_SIZES, ...ICON_ONLY_SIZES],
      control: { type: "select" },
    },
    icon: {
      description: "Icon to display in the button",
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
    },
    label: {
      description: "Button label",
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
    isPulsing: {
      description: "Whether the button should have a pulsing animation",
      control: "boolean",
    },
    isSelect: {
      description: "Whether the button should display a dropdown chevron",
      control: "boolean",
    },
    isCounter: {
      description: "Whether the button should display a counter",
      control: "boolean",
    },
    briefPulse: {
      description: "Whether the button should display a brief pulse",
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
  render: (args) => {
    if (args.size === "mini" && !args.icon) {
      args.icon = ICONS.PlusIcon;
    }
    return <Button {...args} />;
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExampleButton: Story = {
  args: {
    variant: "outline",
    label: "Button",
    size: "md",
    isLoading: false,
    isPulsing: false,
    isSelect: false,
    briefPulse: false,
    disabled: false,
    isCounter: false,
    counterValue: "1",
  },
};

export const IconOnlyButtons: Story = {
  parameters: {
    docs: {
      description: {
        story: `Use "icon" or "icon-xs" for icon-only buttons. Labels are automatically hidden for these sizes.`,
      },
    },
  },
  render: () => (
    <div className="s-flex s-items-center s-gap-4">
      <Button size="icon-xs" icon={PlusIcon} />
      <Button size="icon" icon={PlusIcon} />
    </div>
  ),
};

const ButtonBySize = ({
  size,
}: {
  size: RegularButtonSize;
}) => (
  <>
    <Separator />
    <h3 className="s-text-primary dark:s-text-primary-50">
      {size?.toUpperCase()}
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
            <Button
              size={size}
              variant={variant}
              icon={PlusIcon}
              label="Button"
            />
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
      <ButtonBySize size="mini" />
      <ButtonBySize size="xs" />
      <ButtonBySize size="sm" />
      <ButtonBySize size="md" />
    </div>
  ),
};
