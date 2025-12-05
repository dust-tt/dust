import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  type ButtonVariantType,
} from "@sparkle/components/Button";
import type {
  ButtonGroupItem,
  ButtonGroupVariantType,
} from "@sparkle/components/ButtonGroup";

import {
  ArrowPathIcon,
  ButtonGroup,
  ChevronDownIcon,
  ClipboardIcon,
  PlusIcon,
  RobotIcon,
  Separator,
  TrashIcon,
} from "../index_with_tw_base";

const DEFAULT_ITEMS: ButtonGroupItem[] = [
  { type: "button", props: { label: "First" } },
  { type: "button", props: { label: "Second" } },
  { type: "button", props: { label: "Third" } },
];

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
      description: "Variant applied to every button",
      control: { type: "select" },
      options: BUTTON_GROUP_VARIANTS,
    },
    size: {
      description: "Size applied to every button",
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
    items: {
      table: { disable: true },
    },
  },
  args: {
    items: DEFAULT_ITEMS,
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
  args: {
    items: [
      { type: "button", props: { icon: PlusIcon, label: "Add" } },
      { type: "button", props: { icon: RobotIcon, label: "Agent" } },
      { type: "button", props: { label: "More" } },
    ],
  },
};

export const WithCounters: Story = {
  args: {
    items: [
      {
        type: "button",
        props: { label: "Inbox", isCounter: true, counterValue: "5" },
      },
      {
        type: "button",
        props: { label: "Sent", isCounter: true, counterValue: "12" },
      },
      {
        type: "button",
        props: { label: "Drafts", isCounter: true, counterValue: "3" },
      },
    ],
  },
};

export const Vertical: Story = {
  args: {
    orientation: "vertical",
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const WithGaps: Story = {
  args: {
    removeGaps: false,
  },
};

const VARIANT_ITEMS: ButtonGroupItem[] = [
  { type: "button", props: { label: "One" } },
  { type: "button", props: { label: "Two" } },
  { type: "button", props: { label: "Three" } },
];

const ButtonGroupByVariant = ({
  variant,
}: {
  variant: ButtonGroupVariantType;
}) => (
  <>
    <Separator />
    <h3 className="s-text-primary dark:s-text-primary-50">{variant}</h3>
    <div className="s-flex s-items-center s-gap-4">
      <ButtonGroup variant={variant} size="xs" items={VARIANT_ITEMS} />
      <ButtonGroup variant={variant} size="sm" items={VARIANT_ITEMS} />
      <ButtonGroup variant={variant} size="md" items={VARIANT_ITEMS} />
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

export const WithDropdownMenu: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-4">
      <div>
        <h3 className="s-mb-2 s-text-sm s-font-medium">
          Split button with dropdown
        </h3>
        <ButtonGroup
          variant="outline"
          items={[
            {
              type: "button",
              props: {
                icon: ClipboardIcon,
                tooltip: "Copy to clipboard",
                variant: "ghost-secondary",
                size: "xs",
              },
            },
            {
              type: "dropdown",
              triggerProps: {
                variant: "ghost-secondary",
                size: "xs",
                icon: ChevronDownIcon,
              },
              dropdownProps: {
                items: [
                  { label: "Retry", icon: ArrowPathIcon },
                  { label: "Delete", icon: TrashIcon, variant: "warning" },
                ],
              },
            },
          ]}
        />
      </div>

      <div>
        <h3 className="s-mb-2 s-text-sm s-font-medium">Multiple variations</h3>
        <div className="s-flex s-flex-wrap s-gap-4">
          <ButtonGroup
            variant="outline"
            items={[
              { type: "button", props: { label: "Copy", size: "sm" } },
              {
                type: "dropdown",
                triggerProps: { size: "sm", icon: ChevronDownIcon },
                dropdownProps: {
                  items: [
                    { label: "Option 1" },
                    { label: "Option 2" },
                    { label: "Option 3" },
                  ],
                },
              },
            ]}
          />

          <ButtonGroup
            variant="primary"
            items={[
              { type: "button", props: { label: "Save", size: "sm" } },
              {
                type: "dropdown",
                triggerProps: { size: "sm", icon: ChevronDownIcon },
                dropdownProps: {
                  items: [
                    { label: "Save and close" },
                    { label: "Save as draft" },
                  ],
                },
              },
            ]}
          />

          <ButtonGroup
            variant="outline"
            items={[
              {
                type: "button",
                props: { icon: PlusIcon, label: "Add", size: "sm" },
              },
              {
                type: "button",
                props: { icon: RobotIcon, label: "Agent", size: "sm" },
              },
              {
                type: "dropdown",
                triggerProps: { size: "sm", icon: ChevronDownIcon },
                dropdownProps: {
                  items: [
                    { label: "More options", icon: PlusIcon },
                    { label: "Settings" },
                  ],
                },
              },
            ]}
          />
        </div>
      </div>
    </div>
  ),
};
