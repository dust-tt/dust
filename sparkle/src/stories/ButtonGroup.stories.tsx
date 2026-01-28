import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  BUTTON_VARIANTS,
  type RegularButtonSize,
  type ButtonVariantType,
} from "@sparkle/components/Button";

import {
  ArrowPathIcon,
  Button,
  ButtonGroup,
  ButtonGroupDropdown,
  ChevronDownIcon,
  ClipboardIcon,
  PlusIcon,
  RobotIcon,
  Separator,
  TrashIcon,
} from "../index_with_tw_base";

const DefaultButtons = ({
  variant = "outline",
  size = "sm",
}: {
  variant?: ButtonVariantType;
  size?: RegularButtonSize;
}) => (
  <>
    <Button label="First" variant={variant} size={size} />
    <Button label="Second" variant={variant} size={size} />
    <Button label="Third" variant={variant} size={size} />
  </>
);

const meta = {
  title: "Primitives/ButtonGroup",
  component: ButtonGroup,
  tags: ["autodocs"],
  argTypes: {
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
    children: <DefaultButtons />,
    orientation: "horizontal",
    disabled: false,
    removeGaps: true,
  },
} satisfies Meta<typeof ButtonGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithIcons: Story = {
  args: {
    children: (
      <>
        <Button icon={PlusIcon} label="Add" variant="outline" size="sm" />
        <Button icon={RobotIcon} label="Agent" variant="outline" size="sm" />
        <Button label="More" variant="outline" size="sm" />
      </>
    ),
  },
};

export const WithCounters: Story = {
  args: {
    children: (
      <>
        <Button
          label="Inbox"
          isCounter
          counterValue="5"
          variant="outline"
          size="sm"
        />
        <Button
          label="Sent"
          isCounter
          counterValue="12"
          variant="outline"
          size="sm"
        />
        <Button
          label="Drafts"
          isCounter
          counterValue="3"
          variant="outline"
          size="sm"
        />
      </>
    ),
  },
};

export const Vertical: Story = {
  args: {
    orientation: "vertical",
    children: <DefaultButtons />,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    children: <DefaultButtons />,
  },
};

export const WithGaps: Story = {
  args: {
    removeGaps: false,
    children: <DefaultButtons />,
  },
};

const ButtonGroupByVariant = ({ variant }: { variant: ButtonVariantType }) => (
  <>
    <Separator />
    <h3 className="s-text-primary dark:s-text-primary-50">{variant}</h3>
    <div className="s-flex s-items-center s-gap-4">
      <ButtonGroup>
        <DefaultButtons variant={variant} size="xs" />
      </ButtonGroup>
      <ButtonGroup>
        <DefaultButtons variant={variant} size="sm" />
      </ButtonGroup>
      <ButtonGroup>
        <DefaultButtons variant={variant} size="md" />
      </ButtonGroup>
    </div>
  </>
);

export const Gallery: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-4">
      {BUTTON_VARIANTS.map((variant) => (
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
        <ButtonGroup>
          <Button
            icon={ClipboardIcon}
            tooltip="Copy to clipboard"
            variant="outline"
            size="xs"
          />
          <ButtonGroupDropdown
            trigger={
              <Button variant="outline" size="xs" icon={ChevronDownIcon} />
            }
            items={[
              { label: "Retry", icon: ArrowPathIcon },
              { label: "Delete", icon: TrashIcon, variant: "warning" },
            ]}
          />
        </ButtonGroup>
      </div>

      <div>
        <h3 className="s-mb-2 s-text-sm s-font-medium">Multiple variations</h3>
        <div className="s-flex s-flex-wrap s-gap-4">
          <ButtonGroup>
            <Button label="Copy" variant="outline" size="sm" />
            <ButtonGroupDropdown
              trigger={
                <Button variant="outline" size="sm" icon={ChevronDownIcon} />
              }
              items={[
                { label: "Option 1" },
                { label: "Option 2" },
                { label: "Option 3" },
              ]}
            />
          </ButtonGroup>

          <ButtonGroup>
            <Button label="Save" variant="primary" size="sm" />
            <ButtonGroupDropdown
              trigger={
                <Button variant="primary" size="sm" icon={ChevronDownIcon} />
              }
              items={[{ label: "Save and close" }, { label: "Save as draft" }]}
            />
          </ButtonGroup>

          <ButtonGroup>
            <Button icon={PlusIcon} label="Add" variant="outline" size="sm" />
            <Button
              icon={RobotIcon}
              label="Agent"
              variant="outline"
              size="sm"
            />
            <ButtonGroupDropdown
              trigger={
                <Button variant="outline" size="sm" icon={ChevronDownIcon} />
              }
              items={[
                { label: "More options", icon: PlusIcon },
                { label: "Settings" },
              ]}
            />
          </ButtonGroup>
        </div>
      </div>
    </div>
  ),
};
