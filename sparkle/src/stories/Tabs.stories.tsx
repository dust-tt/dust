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
  tags: ["autodocs"],
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

export const Default: Story = {
  render: () => (
    <div className="s-w-80">
      <Tabs defaultValue="account">
        <TabsList className="s-px-2">
          <TabsTrigger value="account" label="Hello" icon={Command} />
          <TabsTrigger value="password" label="World" icon={Lightbulb04} />
          <div className="s-grow" />
          <TabsTrigger value="settings" icon={Settings01} tooltip="Settings" />
        </TabsList>
        <TabsContent value="account">Hello</TabsContent>
        <TabsContent value="password">World</TabsContent>
        <TabsContent value="settings">Settings</TabsContent>
      </Tabs>
    </div>
  ),
};

export const WithMultipleTabs: Story = {
  render: () => (
    <div className="s-w-[100%]">
      <Tabs defaultValue="tab1">
        <TabsList className="s-px-2">
          <TabsTrigger value="tab1" label="Tab 1" icon={Command} />
          <TabsTrigger value="tab2" label="Tab 2" icon={Lightbulb04} />
          <TabsTrigger value="tab3" label="Tab 3" icon={Settings01} />
          <TabsTrigger value="tab4" label="Tab 4" icon={Command} />
          <TabsTrigger value="tab5" label="Tab 5" icon={Lightbulb04} />
          <TabsTrigger value="tab6" label="Tab 6" icon={Settings01} />
          <div className="s-grow" />
          <Button label="Hello" />
        </TabsList>
        <TabsContent value="tab1">Content for Tab 1</TabsContent>
        <TabsContent value="tab2">Content for Tab 2</TabsContent>
        <TabsContent value="tab3">Content for Tab 3</TabsContent>
        <TabsContent value="tab4">Content for Tab 4</TabsContent>
        <TabsContent value="tab5">Content for Tab 5</TabsContent>
        <TabsContent value="tab6">Content for Tab 6</TabsContent>
      </Tabs>
    </div>
  ),
};
