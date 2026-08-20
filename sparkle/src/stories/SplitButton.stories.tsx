import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ArrowUp, ChevronDown } from "@sparkle/icons/v2-stroke";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FlexSplitButton,
} from "../index_with_tw_base";

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

/**
 * The canonical use case: one obvious default action ("Send") with a chevron
 * `splitAction` that opens a DropdownMenu of related variants. The chevron
 * Button matches the main button's variant so the pair reads as one control.
 * @summary Default action with an attached options menu.
 */
export const Default: Story = {
  args: {
    label: "Send",
    variant: "highlight",
    icon: ArrowUp,
    splitAction: (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="xs" variant="highlight" icon={ChevronDown} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem label="Send now" />
          <DropdownMenuItem label="Schedule send" />
          <DropdownMenuItem label="Save as draft" />
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
};

/**
 * While `isLoading` is set the main button shows a spinner and the
 * `splitAction` is automatically disabled, so neither half can be triggered
 * during async work.
 * @summary Loading state disables both halves.
 */
export const Loading: Story = {
  args: {
    label: "Sending",
    variant: "highlight",
    icon: ArrowUp,
    isLoading: true,
    splitAction: <Button size="xs" variant="highlight" icon={ChevronDown} />,
  },
};

/**
 * Visual reference for design review: every Button variant applied to the
 * split button pair. Not a usage example.
 * @summary Gallery of all variants.
 */
export const VariantGallery: Story = {
  tags: ["!manifest"],
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
