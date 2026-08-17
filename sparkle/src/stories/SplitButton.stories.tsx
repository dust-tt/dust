import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ArrowUp, ChevronDown } from "@sparkle/icons/v2-stroke";

import { Button, FlexSplitButton } from "../index_with_tw_base";

const meta: Meta<React.ComponentProps<typeof FlexSplitButton>> = {
  title: "Actions/SplitButton",
  tags: ["a11y-issues"],
  component: FlexSplitButton,
  parameters: {
    docs: {
      description: {
        component: `A primary action paired with an attached secondary affordance. **FlexSplitButton** renders a labelled **Button** (with \`label\`, \`icon\`, \`variant\`, and an \`isLoading\` state) joined to a \`splitAction\` — typically a chevron **Button** that opens a menu of related options. An opaque divider separates the two so the main button's hover/active overlay doesn't bleed through it.

**When to use**
- When one action is the obvious default but a few related variants should be one click away (e.g. "Send" + send options).

**Guidelines**
- Match the \`variant\` of the main button and the \`splitAction\` button so they read as one control.
- Use an icon-only \`xs\` Button as the \`splitAction\`.`,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = [
  "primary",
  "highlight",
  "outline",
  "warning",
  "ghost",
  "ghost-secondary",
  "highlight-ghost",
  "warning-ghost",
] as const;

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {VARIANTS.map((variant) => (
        <FlexSplitButton
          key={variant}
          label="Send"
          variant={variant}
          icon={ArrowUp}
          splitAction={
            <Button size="xs" variant={variant} icon={ChevronDown} />
          }
        />
      ))}
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {(["highlight", "primary", "outline"] as const).map((variant) => (
        <FlexSplitButton
          key={variant}
          label="Sending"
          variant={variant}
          icon={ArrowUp}
          isLoading
          splitAction={
            <Button size="xs" variant={variant} icon={ChevronDown} />
          }
        />
      ))}
    </div>
  ),
};
