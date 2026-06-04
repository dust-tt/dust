import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import {
  Button,
  Settings01V2,
  CommandV2,
  Lightbulb04V2,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../index_with_tw_base";

const meta = {
  title: "Components/Tabs",
  component: Tabs,
  tags: ["autodocs"],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="s-w-80">
      <Tabs defaultValue="account">
        <TabsList className="s-px-2">
          <TabsTrigger value="account" label="Hello" icon={CommandV2} />
          <TabsTrigger value="password" label="World" icon={Lightbulb04V2} />
          <div className="s-grow" />
          <TabsTrigger
            value="settings"
            icon={Settings01V2}
            tooltip="Settings"
          />
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
          <TabsTrigger value="tab1" label="Tab 1" icon={CommandV2} />
          <TabsTrigger value="tab2" label="Tab 2" icon={Lightbulb04V2} />
          <TabsTrigger value="tab3" label="Tab 3" icon={Settings01V2} />
          <TabsTrigger value="tab4" label="Tab 4" icon={CommandV2} />
          <TabsTrigger value="tab5" label="Tab 5" icon={Lightbulb04V2} />
          <TabsTrigger value="tab6" label="Tab 6" icon={Settings01V2} />
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
