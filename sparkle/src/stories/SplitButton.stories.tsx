import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button, FlexSplitButton } from "../index_with_tw_base";
import { ArrowUp, ChevronDown } from "@sparkle/icons/v2-stroke";

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
        icon={ArrowUp}
        splitAction={
          <Button size="icon" variant="highlight" icon={ChevronDown} />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="primary"
        icon={ArrowUp}
        splitAction={
          <Button size="icon" variant="primary" icon={ChevronDown} />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="outline"
        icon={ArrowUp}
        splitAction={
          <Button size="icon" variant="outline" icon={ChevronDown} />
        }
      />
      <FlexSplitButton
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
      <FlexSplitButton
        label="Send"
        variant="warning"
        icon={ArrowUp}
        splitAction={
          <Button size="icon" variant="warning" icon={ChevronDown} />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="warning-secondary"
        icon={ArrowUp}
        splitAction={
          <Button size="icon" variant="warning-secondary" icon={ChevronDown} />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="ghost"
        icon={ArrowUp}
        splitAction={<Button size="icon" variant="ghost" icon={ChevronDown} />}
      />
      <FlexSplitButton
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

export const FlexSplitButtonLoading: Story = {
  render: () => (
    <div className="s-flex s-gap-3">
      <FlexSplitButton
        label="Sending"
        variant="highlight"
        icon={ArrowUp}
        isLoading
        splitAction={
          <Button size="icon" variant="highlight" icon={ChevronDown} />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="primary"
        icon={ArrowUp}
        isLoading
        splitAction={
          <Button size="icon" variant="primary" icon={ChevronDown} />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="outline"
        icon={ArrowUp}
        isLoading
        splitAction={
          <Button size="icon" variant="outline" icon={ChevronDown} />
        }
      />
      <FlexSplitButton
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
      <FlexSplitButton
        label="Sending"
        variant="warning"
        icon={ArrowUp}
        isLoading
        splitAction={
          <Button size="icon" variant="warning" icon={ChevronDown} />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="warning-secondary"
        icon={ArrowUp}
        isLoading
        splitAction={
          <Button size="icon" variant="warning-secondary" icon={ChevronDown} />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="ghost"
        icon={ArrowUp}
        isLoading
        splitAction={<Button size="icon" variant="ghost" icon={ChevronDown} />}
      />
      <FlexSplitButton
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
