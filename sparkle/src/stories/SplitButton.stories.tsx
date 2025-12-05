import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ArrowUpIcon, ChevronDownIcon } from "@sparkle/icons/app";

import { Button, FlexSplitButton } from "../index_with_tw_base";

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
        icon={ArrowUpIcon}
        splitAction={
          <Button size="mini" variant="highlight" icon={ChevronDownIcon} />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="primary"
        icon={ArrowUpIcon}
        splitAction={
          <Button size="mini" variant="primary" icon={ChevronDownIcon} />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="outline"
        icon={ArrowUpIcon}
        splitAction={
          <Button size="mini" variant="outline" icon={ChevronDownIcon} />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="highlight-secondary"
        icon={ArrowUpIcon}
        splitAction={
          <Button
            size="mini"
            variant="highlight-secondary"
            icon={ChevronDownIcon}
          />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="warning"
        icon={ArrowUpIcon}
        splitAction={
          <Button size="mini" variant="warning" icon={ChevronDownIcon} />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="warning-secondary"
        icon={ArrowUpIcon}
        splitAction={
          <Button
            size="mini"
            variant="warning-secondary"
            icon={ChevronDownIcon}
          />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="ghost"
        icon={ArrowUpIcon}
        splitAction={
          <Button size="mini" variant="ghost" icon={ChevronDownIcon} />
        }
      />
      <FlexSplitButton
        label="Send"
        variant="ghost-secondary"
        icon={ArrowUpIcon}
        splitAction={
          <Button
            size="mini"
            variant="ghost-secondary"
            icon={ChevronDownIcon}
          />
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
        icon={ArrowUpIcon}
        isLoading
        splitAction={
          <Button size="mini" variant="highlight" icon={ChevronDownIcon} />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="primary"
        icon={ArrowUpIcon}
        isLoading
        splitAction={
          <Button size="mini" variant="primary" icon={ChevronDownIcon} />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="outline"
        icon={ArrowUpIcon}
        isLoading
        splitAction={
          <Button size="mini" variant="outline" icon={ChevronDownIcon} />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="highlight-secondary"
        icon={ArrowUpIcon}
        isLoading
        splitAction={
          <Button
            size="mini"
            variant="highlight-secondary"
            icon={ChevronDownIcon}
          />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="warning"
        icon={ArrowUpIcon}
        isLoading
        splitAction={
          <Button size="mini" variant="warning" icon={ChevronDownIcon} />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="warning-secondary"
        icon={ArrowUpIcon}
        isLoading
        splitAction={
          <Button
            size="mini"
            variant="warning-secondary"
            icon={ChevronDownIcon}
          />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="ghost"
        icon={ArrowUpIcon}
        isLoading
        splitAction={
          <Button size="mini" variant="ghost" icon={ChevronDownIcon} />
        }
      />
      <FlexSplitButton
        label="Sending"
        variant="ghost-secondary"
        icon={ArrowUpIcon}
        isLoading
        splitAction={
          <Button
            size="mini"
            variant="ghost-secondary"
            icon={ChevronDownIcon}
          />
        }
      />
    </div>
  ),
};
