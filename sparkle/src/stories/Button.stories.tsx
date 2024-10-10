import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Button,
  Cog6ToothIcon,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "../index_with_tw_base";

const meta = {
  title: "Primitives/Button",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ButtonExamples = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <div className="s-flex s-items-center s-gap-4">
      <Button
        variant="primary"
        size="lg"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="primary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="primary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled={true}
      />
      <Button
        variant="primary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="primary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
      <Button
        variant="primary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="primary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        variant="primaryWarning"
        size="lg"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="primaryWarning"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="primaryWarning"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled={true}
      />
      <Button
        variant="primaryWarning"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="primaryWarning"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
      <Button
        variant="primaryWarning"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="primaryWarning"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        variant="secondary"
        size="lg"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="secondary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="secondary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled={true}
      />
      <Button
        variant="secondary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="secondary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
      <Button
        variant="secondary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="secondary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        variant="secondaryWarning"
        size="lg"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="secondaryWarning"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="secondaryWarning"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled={true}
      />
      <Button
        variant="secondaryWarning"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="secondaryWarning"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
      <Button
        variant="secondaryWarning"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="secondaryWarning"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        variant="tertiary"
        size="lg"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="tertiary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="tertiary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled={true}
      />
      <Button
        variant="tertiary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="tertiary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
      <Button
        variant="tertiary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        variant="tertiary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
    </div>
  </div>
);

export const ButtonBarExamples = () => (
  <Button.List>
    <Button
      type="menu"
      variant="secondary"
      size="xs"
      label="Settings"
      icon={Cog6ToothIcon}
    />
    <Button
      type="menu"
      variant="primary"
      size="xs"
      label="Settings"
      icon={Cog6ToothIcon}
    />
    <Button
      type="menu"
      variant="primary"
      size="xs"
      label="Settings"
      icon={Cog6ToothIcon}
    />
  </Button.List>
);

export const ButtonMenuExamples = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <div className="s-flex s-items-center s-gap-4">
      <Button
        type="menu"
        variant="primary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="menu"
        variant="primary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="menu"
        variant="primary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        type="menu"
        variant="primaryWarning"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="menu"
        variant="primaryWarning"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="menu"
        variant="primaryWarning"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        type="menu"
        variant="secondary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="menu"
        variant="secondary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="menu"
        variant="secondary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        type="menu"
        variant="secondaryWarning"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="menu"
        variant="secondaryWarning"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="menu"
        variant="secondaryWarning"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        type="menu"
        variant="tertiary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="menu"
        variant="tertiary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="menu"
        variant="tertiary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
    </div>
  </div>
);

export const ButtonSelectExamples = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <div className="s-flex s-items-center s-gap-4">
      <Button
        type="select"
        variant="primary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="select"
        variant="primary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="select"
        variant="primary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        type="select"
        variant="primaryWarning"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="select"
        variant="primaryWarning"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="select"
        variant="primaryWarning"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        type="select"
        variant="secondary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="select"
        variant="secondary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="select"
        variant="secondary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        type="select"
        variant="secondaryWarning"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="select"
        variant="secondaryWarning"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="select"
        variant="secondaryWarning"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        type="select"
        variant="tertiary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="select"
        variant="tertiary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="select"
        variant="tertiary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
    </div>
  </div>
);

export const ButtonWithTooltipManualInstantiation = () => {
  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger>
          <Button
            labelVisible={true}
            label="New conversation"
            icon={Cog6ToothIcon}
            hasMagnifying={false}
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>Hello</p>
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
};

export const ButtonWithTooltip = () => {
  return (
    <Tooltip
      trigger={
        <Button
          labelVisible={true}
          label="New conversation"
          icon={Cog6ToothIcon}
          hasMagnifying={false}
        />
      }
      label={"Hello"}
    />
  );
};

export const Primary: Story = {
  args: {
    variant: "primary",
    size: "xs",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const PrimaryWarning: Story = {
  args: {
    variant: "primaryWarning",
    size: "xs",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    size: "sm",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const SecondaryWarning: Story = {
  args: {
    variant: "secondaryWarning",
    size: "sm",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const Tertiary: Story = {
  args: {
    variant: "tertiary",
    size: "md",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const IconOnlyPlusTooltip: Story = {
  args: {
    variant: "primary",
    size: "xs",
    label: "Settings",
    labelVisible: false,
    icon: Cog6ToothIcon,
    disabled: false,
    tooltipPosition: "bottom",
  },
};

export const IconOnlyNoTooltip: Story = {
  args: {
    variant: "primary",
    size: "xs",
    label: "Settings",
    labelVisible: false,
    icon: Cog6ToothIcon,
    disabled: false,
    tooltipPosition: "bottom",
    disabledTooltip: true,
  },
};
