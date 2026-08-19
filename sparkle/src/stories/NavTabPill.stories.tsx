import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import {
  Planet,
  IntersectDust,
  NavTabPill,
  NavTabPillContent,
  NavTabPillList,
  NavTabPillTrigger,
  Settings01,
} from "../index_with_tw_base";

const meta = {
  title: "Navigation/NavTabPill",
  component: NavTabPill,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `A pill-styled tab navigation built from composable parts: **NavTabPill** (root, controlled via \`value\`/\`defaultValue\`), **NavTabPillList**, **NavTabPillTrigger** (each takes a \`value\` and optional \`icon\`), and **NavTabPillContent**. Triggers render as rounded pills, suited to compact, sidebar-style switching.

**When to use**
- For primary navigation between top-level sections (e.g. Work, Spaces, Admin) where a pill treatment fits the layout.

**Guidelines**
- Pair each **NavTabPillTrigger** with a matching **NavTabPillContent** sharing the same \`value\`.
- For standard underlined tabs within a content area, use **Tabs** instead.`,
      },
    },
  },
} satisfies Meta<typeof NavTabPill>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Uncontrolled usage: `defaultValue` picks the initially active pill and the
 * component manages the active tab internally. Each trigger pairs an icon with
 * a label and a matching NavTabPillContent panel.
 * @summary Uncontrolled pills with defaultValue.
 */
export const Default: Story = {
  render: () => (
    <div className="w-80">
      <NavTabPill defaultValue="overview">
        <NavTabPillList>
          <NavTabPillTrigger value="overview" icon={IntersectDust}>
            Work
          </NavTabPillTrigger>
          <NavTabPillTrigger value="analytics" icon={Planet}>
            Spaces
          </NavTabPillTrigger>
          <NavTabPillTrigger value="settings" icon={Settings01}>
            Admin
          </NavTabPillTrigger>
        </NavTabPillList>
        <NavTabPillContent value="overview">Overview content</NavTabPillContent>
        <NavTabPillContent value="analytics">
          Analytics content
        </NavTabPillContent>
        <NavTabPillContent value="settings">Settings content</NavTabPillContent>
      </NavTabPill>
    </div>
  ),
};

/**
 * Controlled usage: the parent owns the active tab through `value` /
 * `onValueChange` — the pattern to use when the active section is driven by
 * external state such as the router. The caption reflects the state the
 * parent holds.
 * @summary Controlled pills via value / onValueChange.
 */
export const Controlled: Story = {
  render: () => {
    const [activeTab, setActiveTab] = useState("overview");
    return (
      <div className="flex w-80 flex-col gap-3">
        <NavTabPill value={activeTab} onValueChange={setActiveTab}>
          <NavTabPillList>
            <NavTabPillTrigger value="overview" icon={IntersectDust}>
              Work
            </NavTabPillTrigger>
            <NavTabPillTrigger value="analytics" icon={Planet}>
              Spaces
            </NavTabPillTrigger>
            <NavTabPillTrigger value="settings" icon={Settings01}>
              Admin
            </NavTabPillTrigger>
          </NavTabPillList>
          <NavTabPillContent value="overview">
            Overview content
          </NavTabPillContent>
          <NavTabPillContent value="analytics">
            Analytics content
          </NavTabPillContent>
          <NavTabPillContent value="settings">
            Settings content
          </NavTabPillContent>
        </NavTabPill>
        <p className="text-xs text-muted-foreground">
          Active tab (parent state): {activeTab}
        </p>
      </div>
    );
  },
};
