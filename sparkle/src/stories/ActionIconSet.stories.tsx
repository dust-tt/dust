import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { ActionIcons } from "@sparkle/icons";

import { Icon } from "../index_with_tw_base";

const meta = {
  title: "Assets/Icons/Action Icons",
  tags: ["!manifest", "autodocs"],
  parameters: {
    docs: {
      description: {
        component: `A selection of icons that users can pick to label skills in the product.

Each name is a stable identifier stored alongside the skill it labels, which is why this set is curated rather than exhaustive — it is not a second icon library. Reach for the full stroke set in **Icons** for anything else, and render an icon through the **Icon** component (or a component's \`icon\` prop) rather than embedding a raw SVG.`,
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

export const ActionIconSet: Story = {
  render: () => (
    <div style={gridStyle}>
      {Object.entries(ActionIcons).map(([iconName, IconComponent]) => (
        <div key={iconName}>
          <Icon visual={IconComponent} size="md" className="text-foreground" />
          <div style={itemStyle} className="text-sm text-foreground">
            {iconName}
          </div>
        </div>
      ))}
    </div>
  ),
};
