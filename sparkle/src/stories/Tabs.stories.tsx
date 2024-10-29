import { Meta } from "@storybook/react";
import React from "react";

import {
  Cog6ToothIcon,
  CommandIcon,
  LightbulbIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../index_with_tw_base";

const meta = {
  title: "Components/Tabs",
} satisfies Meta;

export default meta;

export function TabExample() {
  return (
    <Tabs defaultValue="account">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="account" label="Hello" icon={CommandIcon} />
        <TabsTrigger value="password" label="World" icon={LightbulbIcon} />
        <TabsTrigger value="settings" icon={Cog6ToothIcon} />
      </TabsList>
      <TabsContent value="account">Hello</TabsContent>
      <TabsContent value="password">World</TabsContent>
      <TabsContent value="settings">Settings</TabsContent>
    </Tabs>
  );
}
