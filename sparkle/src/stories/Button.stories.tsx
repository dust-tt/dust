import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button, Cog6ToothIcon } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Button",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ButtonExamples = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <div className="s-flex s-items-center s-gap-4">
      <Button type="primary" size="md" label="Settings" icon={Cog6ToothIcon} />
      <Button
        type="primary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled={true}
      />
      <Button type="primary" size="sm" label="Settings" icon={Cog6ToothIcon} />
      <Button
        type="primary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
      <Button type="primary" size="xs" label="Settings" icon={Cog6ToothIcon} />
      <Button
        type="primary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        type="primaryWarning"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="primaryWarning"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled={true}
      />
      <Button
        type="primaryWarning"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="primaryWarning"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
      <Button
        type="primaryWarning"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="primaryWarning"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        type="secondary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="secondary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled={true}
      />
      <Button
        type="secondary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="secondary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
      <Button
        type="secondary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="secondary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button
        type="secondaryWarning"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="secondaryWarning"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled={true}
      />
      <Button
        type="secondaryWarning"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="secondaryWarning"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
      <Button
        type="secondaryWarning"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
      />
      <Button
        type="secondaryWarning"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button type="tertiary" size="md" label="Settings" icon={Cog6ToothIcon} />
      <Button
        type="tertiary"
        size="md"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled={true}
      />
      <Button type="tertiary" size="sm" label="Settings" icon={Cog6ToothIcon} />
      <Button
        type="tertiary"
        size="sm"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
      <Button type="tertiary" size="xs" label="Settings" icon={Cog6ToothIcon} />
      <Button
        type="tertiary"
        size="xs"
        label="Settings"
        icon={Cog6ToothIcon}
        disabled
      />
    </div>
  </div>
);

export const Primary: Story = {
  args: {
    type: "primary",
    size: "xs",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const PrimaryWarning: Story = {
  args: {
    type: "primaryWarning",
    size: "xs",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const Secondary: Story = {
  args: {
    type: "secondary",
    size: "sm",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const SecondaryWarning: Story = {
  args: {
    type: "secondaryWarning",
    size: "sm",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const Tertiary: Story = {
  args: {
    type: "tertiary",
    size: "md",
    label: "Settings",
    icon: Cog6ToothIcon,
    disabled: false,
  },
};

export const IconOnlyPlusTooltip: Story = {
  args: {
    type: "primary",
    size: "xs",
    label: "Settings",
    labelVisible: false,
    icon: Cog6ToothIcon,
    disabled: false,
    tooltipPosition: "below",
  },
};
