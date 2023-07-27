import type { Meta, StoryObj } from "@storybook/react";
import { Button, Cog6ToothIcon } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Button",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    type: "primary",
    size: "xs",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const IconOnlyPlusTooltip: Story = {
  args: {
    type: "primary",
    size: "xs",
    label: "Settings",
    labelVisible: false,
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const PrimaryWarning: Story = {
  args: {
    type: "primaryWarning",
    size: "xs",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const Secondary: Story = {
  args: {
    type: "secondary",
    size: "sm",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const SecondaryWarning: Story = {
  args: {
    type: "secondaryWarning",
    size: "sm",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const Tertiary: Story = {
  args: {
    type: "tertiary",
    size: "md",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};
