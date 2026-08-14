import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  LegacyButton as Button,
  LegacyFlexSplitButton,
} from "../index_with_tw_base";
import { ArrowUp, ChevronDown } from "@sparkle/icons/v2-stroke";

const meta: Meta<React.ComponentProps<typeof LegacyFlexSplitButton>> = {
  title: "Actions/LegacySplitButton",
  tags: ["a11y-issues"],
  component: LegacyFlexSplitButton,
  parameters: {
    docs: {
      description: {
        component: `A primary action paired with an attached secondary affordance. **LegacyFlexSplitButton** renders a labelled button (with \`label\`, \`icon\`, \`variant\`, and an \`isLoading\` state) joined to a \`splitAction\` — typically a chevron **Button** that opens a menu of related options.

**When to use**
- When one action is the obvious default but a few related variants should be one click away (e.g. "Send" + send options).

**Guidelines**
- Match the \`variant\` of the main button and the \`splitAction\` button so they read as one control.
- Keep the main \`label\` as the most common action; relegate alternatives to the split menu.
- For a set of equally-weighted related actions, use **ButtonGroup** instead.`,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const LegacyFlexSplitButtonVariants: Story = {
  render: () => (
    <div className="flex gap-3">
      <LegacyFlexSplitButton
        label="Send"
        variant="highlight"
        icon={ArrowUp}
        splitAction={
          <Button size="icon" variant="highlight" icon={ChevronDown} />
        }
      />
      <LegacyFlexSplitButton
        label="Send"
        variant="primary"
        icon={ArrowUp}
        splitAction={
          <Button size="icon" variant="primary" icon={ChevronDown} />
        }
      />
      <LegacyFlexSplitButton
        label="Send"
        variant="outline"
        icon={ArrowUp}
        splitAction={
          <Button size="icon" variant="outline" icon={ChevronDown} />
        }
      />
      <LegacyFlexSplitButton
        label="Send"
        variant="highlight-secondary"
        icon={ArrowUp}
        splitAction={
          <Button
            size="icon"
            variant="highlight-secondary"
            icon={ChevronDown}
          />
        }
      />
      <LegacyFlexSplitButton
        label="Send"
        variant="warning"
        icon={ArrowUp}
        splitAction={
          <Button size="icon" variant="warning" icon={ChevronDown} />
        }
      />
      <LegacyFlexSplitButton
        label="Send"
        variant="warning-secondary"
        icon={ArrowUp}
        splitAction={
          <Button size="icon" variant="warning-secondary" icon={ChevronDown} />
        }
      />
      <LegacyFlexSplitButton
        label="Send"
        variant="ghost"
        icon={ArrowUp}
        splitAction={<Button size="icon" variant="ghost" icon={ChevronDown} />}
      />
      <LegacyFlexSplitButton
        label="Send"
        variant="ghost-secondary"
        icon={ArrowUp}
        splitAction={
          <Button size="icon" variant="ghost-secondary" icon={ChevronDown} />
        }
      />
    </div>
  ),
};

export const LegacyFlexSplitButtonLoading: Story = {
  render: () => (
    <div className="flex gap-3">
      <LegacyFlexSplitButton
        label="Sending"
        variant="highlight"
        icon={ArrowUp}
        isLoading
        splitAction={
          <Button size="icon" variant="highlight" icon={ChevronDown} />
        }
      />
      <LegacyFlexSplitButton
        label="Sending"
        variant="primary"
        icon={ArrowUp}
        isLoading
        splitAction={
          <Button size="icon" variant="primary" icon={ChevronDown} />
        }
      />
      <LegacyFlexSplitButton
        label="Sending"
        variant="outline"
        icon={ArrowUp}
        isLoading
        splitAction={
          <Button size="icon" variant="outline" icon={ChevronDown} />
        }
      />
      <LegacyFlexSplitButton
        label="Sending"
        variant="highlight-secondary"
        icon={ArrowUp}
        isLoading
        splitAction={
          <Button
            size="icon"
            variant="highlight-secondary"
            icon={ChevronDown}
          />
        }
      />
      <LegacyFlexSplitButton
        label="Sending"
        variant="warning"
        icon={ArrowUp}
        isLoading
        splitAction={
          <Button size="icon" variant="warning" icon={ChevronDown} />
        }
      />
      <LegacyFlexSplitButton
        label="Sending"
        variant="warning-secondary"
        icon={ArrowUp}
        isLoading
        splitAction={
          <Button size="icon" variant="warning-secondary" icon={ChevronDown} />
        }
      />
      <LegacyFlexSplitButton
        label="Sending"
        variant="ghost"
        icon={ArrowUp}
        isLoading
        splitAction={<Button size="icon" variant="ghost" icon={ChevronDown} />}
      />
      <LegacyFlexSplitButton
        label="Sending"
        variant="ghost-secondary"
        icon={ArrowUp}
        isLoading
        splitAction={
          <Button size="icon" variant="ghost-secondary" icon={ChevronDown} />
        }
      />
    </div>
  ),
};
