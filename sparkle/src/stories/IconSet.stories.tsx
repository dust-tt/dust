import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import * as Icons from "@sparkle/icons/v2-stroke";

import { Icon } from "../index_with_tw_base";

type IconModule = {
  [key: string]: React.ComponentType<{ className?: string }> & {
    default?: React.ComponentType<{ className?: string }>;
  };
};

const meta = {
  title: "Assets/Icons",
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: "48px 16px",
};
const itemStyle: React.CSSProperties = {
  marginTop: "12px",
  textOverflow: "ellipsis",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textAlign: "left",
  width: "100%",
};

const renderIconGrid = (icons: IconModule) => (
  <div style={gridStyle}>
    {Object.entries(icons).map(([iconName, IconComponent]) => {
      const CurrentIcon = (
        "default" in IconComponent ? IconComponent.default : IconComponent
      ) as React.ComponentType<{ className?: string }>;
      return (
        <div key={iconName}>
          <Icon
            visual={CurrentIcon}
            size="md"
            className="s-text-foreground dark:s-text-foreground-night"
          />
          <div
            style={itemStyle}
            className="s-text-sm s-text-foreground dark:s-text-foreground-night"
          >
            {iconName}
          </div>
        </div>
      );
    })}
  </div>
);

export const IconSet: Story = {
  render: () => renderIconGrid(Icons as IconModule),
};
