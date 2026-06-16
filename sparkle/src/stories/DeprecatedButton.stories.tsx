import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  DEPRECATED_BUTTON_VARIANTS,
  DEPRECATED_REGULAR_BUTTON_SIZES,
} from "@sparkle/components/DeprecatedButton";

import {
  DeprecatedButton,
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
  title: "Actions/DeprecatedButton",
  component: DeprecatedButton,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `**Deprecated.** This is the previous button design, kept only for incremental migration. Use \`Button\` for anything new. \`DeprecatedButton\` will be removed once all consumers have migrated.

It comes in several visual **variants** and **sizes**, and supports icons, loading and pulsing states, an inline counter, and a dropdown-chevron affordance (**isSelect**).`,
      },
    },
  },
  argTypes: {
    variant: {
      description: "The visual style variant of the button",
      options: DEPRECATED_BUTTON_VARIANTS,
      control: { type: "select" },
    },
    size: {
      description:
        "The size of the button (Note: 'mini' size requires an icon and cannot have a label)",
      options: DEPRECATED_REGULAR_BUTTON_SIZES,
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
    hasLighterFont: {
      description: "Whether the label uses a normal font weight",
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
      args.icon = ICONS.Plus;
    }
    return <DeprecatedButton {...args} />;
  },
} satisfies Meta<typeof DeprecatedButton>;

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
    hasLighterFont: false,
    disabled: false,
    isCounter: false,
    counterValue: "1",
  },
};

export const MiniButton: Story = {
  render: () => <DeprecatedButton size="icon" icon={Plus} />,
};

const ButtonBySize = ({
  size,
}: {
  // Only regular button sizes that support a label (no icon-only or mini)
  size: Exclude<(typeof DEPRECATED_REGULAR_BUTTON_SIZES)[number], "mini">;
}) => (
  <>
    <Separator />
    <h3 className="s-text-primary dark:s-text-primary-50">
      {size?.toUpperCase()}
    </h3>
    <div className="s-flex s-flex-col s-gap-4">
      {DEPRECATED_BUTTON_VARIANTS.map((variant) => (
        <div key={variant} className="s-flex s-flex-col s-gap-2">
          <div className="s-text-sm s-font-medium s-text-primary dark:s-text-primary-night">
            {variant}
          </div>
          <div className="s-flex s-items-center s-gap-4">
            <DeprecatedButton size={size} variant={variant} label="Button" />
            <DeprecatedButton
              size={size}
              variant={variant}
              label="Button"
              isLoading
            />
            <DeprecatedButton
              size={size}
              variant={variant}
              icon={Plus}
              label="Button"
            />
            <DeprecatedButton
              size={size}
              variant={variant}
              label="Button"
              disabled
            />
          </div>
        </div>
      ))}
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
