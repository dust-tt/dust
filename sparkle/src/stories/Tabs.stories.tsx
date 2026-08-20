import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Button,
  Settings01,
  Command,
  Lightbulb04,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../index_with_tw_base";

const meta = {
  title: "Navigation/Tabs",
  component: Tabs,
  tags: ["a11y-issues", "autodocs"],
  parameters: {
    docs: {
      description: {
        component: `Switches between sibling views within the same region. Composed from **Tabs** (root, controlled via \`value\`/\`defaultValue\`), **TabsList**, **TabsTrigger** (with \`label\`, optional \`icon\`, and \`tooltip\` for icon-only triggers), and **TabsContent**. The list is a flex row, so spacers and extra controls can sit alongside the triggers.

**When to use**
- To organize related content into peer views the user toggles between without leaving the page.

**Guidelines**
- Pair each **TabsTrigger** with a **TabsContent** sharing the same \`value\`.
- Provide a \`tooltip\` for icon-only triggers so they remain identifiable.
- For pill-styled, sidebar-oriented section switching, use **NavTabPill** instead.`,
      },
    },
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Standard tabs: labeled triggers with icons, plus a right-aligned icon-only
 * trigger (with a tooltip) pushed to the edge by a flex spacer. The initial
 * view is picked with `defaultValue`.
 * @summary Labeled and icon-only triggers.
 */
export const Default: Story = {
  render: () => (
    <div className="w-80">
      <Tabs defaultValue="conversation">
        <TabsList className="px-2">
          <TabsTrigger
            value="conversation"
            label="Conversation"
            icon={Command}
          />
          <TabsTrigger value="knowledge" label="Knowledge" icon={Lightbulb04} />
          <div className="grow" />
          <TabsTrigger value="settings" icon={Settings01} tooltip="Settings" />
        </TabsList>
        <TabsContent value="conversation">Conversation history</TabsContent>
        <TabsContent value="knowledge">Connected knowledge</TabsContent>
        <TabsContent value="settings">Workspace settings</TabsContent>
      </Tabs>
    </div>
  ),
};

/**
 * Because TabsList is a flex row, arbitrary controls can share it with the
 * triggers — here a flex spacer pushes a **Button** to the trailing edge, a
 * common pattern for a section-level action next to many tabs.
 * @summary Action button inside the tab list.
 */
export const WithTrailingAction: Story = {
  render: () => (
    <div className="w-[100%]">
      <Tabs defaultValue="conversations">
        <TabsList className="px-2">
          <TabsTrigger
            value="conversations"
            label="Conversations"
            icon={Command}
          />
          <TabsTrigger value="knowledge" label="Knowledge" icon={Lightbulb04} />
          <TabsTrigger value="agents" label="Agents" icon={Settings01} />
          <TabsTrigger value="tools" label="Tools" icon={Command} />
          <TabsTrigger value="members" label="Members" icon={Lightbulb04} />
          <TabsTrigger value="settings" label="Settings" icon={Settings01} />
          <div className="grow" />
          <Button label="New agent" />
        </TabsList>
        <TabsContent value="conversations">Recent conversations</TabsContent>
        <TabsContent value="knowledge">Connected knowledge</TabsContent>
        <TabsContent value="agents">Available agents</TabsContent>
        <TabsContent value="tools">Configured tools</TabsContent>
        <TabsContent value="members">Workspace members</TabsContent>
        <TabsContent value="settings">Workspace settings</TabsContent>
      </Tabs>
    </div>
  ),
};
