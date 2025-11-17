import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { BUTTON_SIZES, BUTTON_VARIANTS } from "@sparkle/components/Button";

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
      description:
        "The size of the button (Note: 'mini' size requires an icon and cannot have a label)",
      options: BUTTON_SIZES,
      control: { type: "select" },
    },
    icon: {
      description: "Icon to display in the button (Required for mini size)",
      options: Object.keys(ICONS),
      mapping: ICONS,
      control: { type: "select" },
      if: { arg: "size", neq: "mini" },
    },
    label: {
      description: "Button label (Not available for mini size)",
      control: { type: "text" },
      if: { arg: "size", neq: "mini" },
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

export const MiniButton: Story = {
  render: () => <Button size="mini" icon={PlusIcon} />,
};

const ButtonBySize = ({
  size,
}: {
  size: Exclude<React.ComponentProps<typeof Button>["size"], "mini">;
}) => (
  <>
    <Separator />
    <h3 className="s-text-primary dark:s-text-primary-50">
      {size?.toUpperCase()}
    </h3>
    <div className="s-flex s-items-center s-gap-4">
      <Button size={size} label="Button" />
      <Button size={size} variant="outline" label="Button" />
      <Button size={size} variant="highlight" label="Button" />
      <Button size={size} variant="warning" label="Button" />
      <Button size={size} variant="ghost" label="Button" />
      <Button
        size={size}
        variant="primary"
        label="Button with href"
        href="hello"
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button size={size} label="Button" isLoading />
      <Button size={size} variant="outline" label="Button" isLoading />
      <Button size={size} variant="highlight" label="Button" isLoading />
      <Button size={size} variant="warning" label="Button" isLoading />
      <Button size={size} variant="ghost" label="Button" isLoading />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button size={size} icon={PlusIcon} label="Button" />
      <Button size={size} variant="outline" icon={PlusIcon} label="Button" />
      <Button size={size} variant="highlight" icon={PlusIcon} label="Button" />
      <Button size={size} variant="warning" icon={PlusIcon} label="Button" />
      <Button size={size} variant="ghost" icon={PlusIcon} label="Button" />
    </div>
  </>
);

export const Gallery: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-4">
      <ButtonBySize size="xs" />
      <ButtonBySize size="sm" />
      <ButtonBySize size="md" />
    </div>
  ),
};
