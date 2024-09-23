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
  title: "NewComponents/Tabs",
} satisfies Meta;

export default meta;

export const TabExample = () => {
  return (
    <div className="s-flex s-flex-col s-gap-10">
      <div className="s-w-[320px]">{TabsDemo()}</div>
    </div>
  );
};

export function TabsDemo() {
  return (
    <Tabs defaultValue="account" className="w-[400px]">
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
