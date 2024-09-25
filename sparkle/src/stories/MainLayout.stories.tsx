import { Meta } from "@storybook/react";
import React from "react";

import {
  Avatar,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  ChatBubbleThoughtIcon,
  ChevronDoubleLeftIcon,
  Cog6ToothIcon,
  MoreIcon,
  NewButton,
  NewButtonBar,
  QuestionMarkCircleIcon,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@sparkle/index_with_tw_base";

const meta = {
  title: "NewLayouts/MainLayout",
} satisfies Meta;

export default meta;

export const LayoutDemo = () => {
  return (
    <div className="s-flex s-h-[800px] s-w-full s-flex-row s-border">
      <div className="s-flex s-h-full s-w-[320px] s-flex-col s-border-r s-border-structure-200 s-bg-primary-50">
        <Tabs defaultValue="account" className="s-grow s-p-2">
          <TabsList className="s-w-full">
            <TabsTrigger
              value="account"
              label="Chat"
              icon={ChatBubbleThoughtIcon}
            />
            <TabsTrigger
              value="password"
              label="Knowledge"
              icon={BookOpenIcon}
            />
            <div className="s-grow" />
            <TabsTrigger value="settings" icon={Cog6ToothIcon} />
          </TabsList>
          <TabsContent value="account">{ChatTab()}</TabsContent>
          <TabsContent value="password">World</TabsContent>
          <TabsContent value="settings">Settings</TabsContent>
        </Tabs>
        {BottomNav()}
      </div>
    </div>
  );
};

export const ChatTab = () => {
  return (
    <ScrollArea>
      <NewButtonBar className="s-w-full s-justify-end">
        <NewButton variant="outline" icon={MoreIcon} />
        <div className="s-grow" />
        <NewButton icon={ChatBubbleLeftRightIcon} label="New conversation" />
      </NewButtonBar>
    </ScrollArea>
  );
};

export const BottomNav = () => {
  return (
    <div className="s-flex s-flex-row s-items-center s-gap-2 s-border-t s-border-structure-200 s-bg-structure-100 s-p-2">
      <Avatar
        size="sm"
        isRounded
        name="Omar Doe"
        visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
      />
      <NewButton variant={"outline"} size="xs" label="Help & documentation" />
      <div className="s-grow" />
      <NewButton variant={"ghost"} size="xs" icon={ChevronDoubleLeftIcon} />
    </div>
  );
};
