import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  type ButtonVariantType,
} from "@sparkle/components/Button";
import type { ButtonGroupVariantType } from "@sparkle/components/ButtonGroup";

import {
  Button,
  ButtonGroup,
  PlusIcon,
  RobotIcon,
  Separator,
} from "../index_with_tw_base";

const DEFAULT_CHILDREN = (
  <>
    <Button label="First" />
    <Button label="Second" />
    <Button label="Third" />
  </>
);

const DISALLOWED_GROUP_VARIANTS: ButtonVariantType[] = [
  "ghost",
  "ghost-secondary",
  "highlight",
  "warning",
];

const BUTTON_GROUP_VARIANTS = BUTTON_VARIANTS.filter(
  (variant) => !DISALLOWED_GROUP_VARIANTS.includes(variant)
) as ButtonGroupVariantType[];

const meta = {
  title: "Primitives/ButtonGroup",
  component: ButtonGroup,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      description: "Variant applied to every child button",
      control: { type: "select" },
      options: BUTTON_GROUP_VARIANTS,
    },
    size: {
      description: "Size applied to every child button",
      control: { type: "select" },
      options: BUTTON_SIZES.filter((size) => size !== "mini"),
    },
    orientation: {
      description: "Stack buttons horizontally or vertically",
      control: { type: "select" },
      options: ["horizontal", "vertical"],
    },
    disabled: {
      description: "Disable all buttons in the group",
      control: "boolean",
    },
    removeGaps: {
      description: "Remove gaps and merge button borders",
      control: "boolean",
    },
    children: {
      table: { disable: true },
    },
  },
  args: {
    children: DEFAULT_CHILDREN,
    variant: "outline",
    size: "sm",
    orientation: "horizontal",
    disabled: false,
    removeGaps: true,
  },
  render: (args) => <ButtonGroup {...args} />,
} satisfies Meta<typeof ButtonGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithIcons: Story = {
  render: () => (
    <ButtonGroup variant="outline" size="sm">
      <Button icon={PlusIcon} label="Add" />
      <Button icon={RobotIcon} label="Agent" />
      <Button label="More" />
    </ButtonGroup>
  ),
};

export const WithCounters: Story = {
  render: () => (
    <ButtonGroup variant="outline" size="sm">
      <Button label="Inbox" isCounter counterValue="5" />
      <Button label="Sent" isCounter counterValue="12" />
      <Button label="Drafts" isCounter counterValue="3" />
    </ButtonGroup>
  ),
};

export const Vertical: Story = {
  render: () => (
    <ButtonGroup variant="outline" size="sm" orientation="vertical">
      <Button label="First" />
      <Button label="Second" />
      <Button label="Third" />
    </ButtonGroup>
  ),
};

export const Disabled: Story = {
  render: () => (
    <ButtonGroup variant="outline" size="sm" disabled>
      <Button label="First" />
      <Button label="Second" />
      <Button label="Third" />
    </ButtonGroup>
  ),
};

export const WithGaps: Story = {
  render: () => (
    <ButtonGroup variant="outline" size="sm" removeGaps={false}>
      <Button label="First" />
      <Button label="Second" />
      <Button label="Third" />
    </ButtonGroup>
  ),
};

const ButtonGroupByVariant = ({
  variant,
}: {
  variant: ButtonGroupVariantType;
}) => (
  <>
    <Separator />
    <h3 className="s-text-primary dark:s-text-primary-50">{variant}</h3>
    <div className="s-flex s-items-center s-gap-4">
      <ButtonGroup variant={variant} size="xs">
        <Button label="One" />
        <Button label="Two" />
        <Button label="Three" />
      </ButtonGroup>
      <ButtonGroup variant={variant} size="sm">
        <Button label="One" />
        <Button label="Two" />
        <Button label="Three" />
      </ButtonGroup>
      <ButtonGroup variant={variant} size="md">
        <Button label="One" />
        <Button label="Two" />
        <Button label="Three" />
      </ButtonGroup>
    </div>
  </>
);

export const Gallery: Story = {
  args: meta.args,
  render: () => (
    <div className="s-flex s-flex-col s-gap-4">
      {BUTTON_GROUP_VARIANTS.map((variant) => (
        <ButtonGroupByVariant key={variant} variant={variant} />
      ))}
    </div>
  ),
};
