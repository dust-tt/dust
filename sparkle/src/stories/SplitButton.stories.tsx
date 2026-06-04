import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button, FlexSplitButton } from "../index_with_tw_base";
import { ArrowUpV2, ChevronDownV2 } from "@sparkle/icons/v2-stroke";

const meta: Meta<React.ComponentProps<typeof FlexSplitButton>> = {
  title: "Primitives/SplitButton",
  component: FlexSplitButton,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const FlexSplitButtonVariants: Story = {
  render: () => (
    <div className="s-flex s-gap-3">
      <FlexSplitButton
        label="Send"
        variant="highlight"
        icon={ArrowUpV2}
        splitAction={
          <Button size="icon" variant="highlight" icon={ChevronDownV2} />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="primary"
        icon={ArrowUpV2}
        splitAction={
          <Button size="icon" variant="primary" icon={ChevronDownV2} />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="outline"
        icon={ArrowUpV2}
        splitAction={
          <Button size="icon" variant="outline" icon={ChevronDownV2} />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="highlight-secondary"
        icon={ArrowUpV2}
        splitAction={
          <Button
            size="icon"
            variant="highlight-secondary"
            icon={ChevronDownV2}
          />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="warning"
        icon={ArrowUpV2}
        splitAction={
          <Button size="icon" variant="warning" icon={ChevronDownV2} />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="warning-secondary"
        icon={ArrowUpV2}
        splitAction={
          <Button
            size="icon"
            variant="warning-secondary"
            icon={ChevronDownV2}
          />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="ghost"
        icon={ArrowUpV2}
        splitAction={
          <Button size="icon" variant="ghost" icon={ChevronDownV2} />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="ghost-secondary"
        icon={ArrowUpV2}
        splitAction={
          <Button size="icon" variant="ghost-secondary" icon={ChevronDownV2} />
        }
      />
    </div>
  ),
};

export const FlexSplitButtonLoading: Story = {
  render: () => (
    <div className="s-flex s-gap-3">
      <FlexSplitButton
        label="Sending"
        variant="highlight"
        icon={ArrowUpV2}
        isLoading
        splitAction={
          <Button size="icon" variant="highlight" icon={ChevronDownV2} />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="primary"
        icon={ArrowUpV2}
        isLoading
        splitAction={
          <Button size="icon" variant="primary" icon={ChevronDownV2} />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="outline"
        icon={ArrowUpV2}
        isLoading
        splitAction={
          <Button size="icon" variant="outline" icon={ChevronDownV2} />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="highlight-secondary"
        icon={ArrowUpV2}
        isLoading
        splitAction={
          <Button
            size="icon"
            variant="highlight-secondary"
            icon={ChevronDownV2}
          />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="warning"
        icon={ArrowUpV2}
        isLoading
        splitAction={
          <Button size="icon" variant="warning" icon={ChevronDownV2} />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="warning-secondary"
        icon={ArrowUpV2}
        isLoading
        splitAction={
          <Button
            size="icon"
            variant="warning-secondary"
            icon={ChevronDownV2}
          />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="ghost"
        icon={ArrowUpV2}
        isLoading
        splitAction={
          <Button size="icon" variant="ghost" icon={ChevronDownV2} />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="ghost-secondary"
        icon={ArrowUpV2}
        isLoading
        splitAction={
          <Button size="icon" variant="ghost-secondary" icon={ChevronDownV2} />
        }
      />
    </div>
  ),
};
