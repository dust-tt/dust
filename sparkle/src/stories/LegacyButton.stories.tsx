import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  REGULAR_BUTTON_SIZES,
  BUTTON_VARIANTS,
} from "@sparkle/components/LegacyButton";

import {
  LegacyButton as Button,
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
  title: "Actions/LegacyButton",
  component: Button,
  tags: ["deprecated", "!manifest", "a11y-issues", "autodocs"],
  parameters: {
    docs: {
      description: {
        component: `**Deprecated — use Button instead.** Kept only as a visual reference for legacy product surfaces.

Buttons let users trigger an action or event — submitting a form, opening a dialog, or confirming a choice. Sparkle buttons come in several visual **variants** and **sizes**, and support icons, loading and pulsing states, an inline counter, and a dropdown-chevron affordance (**isSelect**).

**When to use**
- To perform an action on the current page (save, delete, open a menu).
- As the primary call-to-action in a form, dialog, or empty state.

**Guidelines**
- Use a single **highlight** (primary) button per view; use **outline** or **ghost** for secondary actions.
- Write concise, verb-first labels ("Save changes", not "OK").
- The **mini** / icon-only sizes require an **icon** and have no label — always pair them with a tooltip.
- Set **isLoading** during async work to communicate progress and prevent double submits.
- For navigation between pages, prefer a link styled as a button over an \`onClick\` handler.`,
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
      description:
        "The size of the button (Note: 'mini' size requires an icon and cannot have a label)",
      options: REGULAR_BUTTON_SIZES,
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
    hasLighterFont: false,
    disabled: false,
    isCounter: false,
    counterValue: "1",
  },
};

export const MiniButton: Story = {
  render: () => <Button size="mini" icon={Plus} />,
};

const ButtonBySize = ({
  size,
}: {
  // Only regular button sizes that support a label (no icon-only or mini)
  size: Exclude<(typeof REGULAR_BUTTON_SIZES)[number], "mini">;
}) => (
  <>
    <Separator />
    <h3 className="text-primary">{size?.toUpperCase()}</h3>
    <div className="flex flex-col gap-4">
      {BUTTON_VARIANTS.map((variant) => (
        <div key={variant} className="flex flex-col gap-2">
          <div className="text-sm font-medium text-primary">{variant}</div>
          <div className="flex items-center gap-4">
            <Button size={size} variant={variant} label="Button" />
            <Button size={size} variant={variant} label="Button" isLoading />
            <Button size={size} variant={variant} icon={Plus} label="Button" />
            <Button size={size} variant={variant} label="Button" disabled />
          </div>
        </div>
      ))}
    </div>
  </>
);

export const Gallery: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <ButtonBySize size="xs" />
      <ButtonBySize size="sm" />
      <ButtonBySize size="md" />
    </div>
  ),
};
