import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import * as StrokeIcons from "@sparkle/icons/v2-stroke";

import { Icon } from "../index_with_tw_base";

const meta = {
  title: "Assets/Icons/All Icons",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `The complete v2 stroke icon set (\`@sparkle/icons/v2-stroke\`). Use this exhaustive grid to find any available icon by name, then render it via the **Icon** component or a component's \`icon\` prop.`,
      },
    },
  },
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

const isIconComponent = (
  v: unknown
): v is React.ComponentType<{ className?: string }> => typeof v === "function";

const renderIconGrid = () => (
  <div style={gridStyle}>
    {Object.entries(StrokeIcons).map(([iconName, IconComponent]) => {
      if (!isIconComponent(IconComponent)) {
        return null;
      }
      return (
        <div key={iconName}>
          <Icon
            visual={IconComponent}
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

export const StrokeIconSet: Story = {
  render: () => renderIconGrid(),
};
