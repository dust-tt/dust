import type { Meta } from "@storybook/react";
import React from "react";

import {
  ArrowDownCircleIcon,
  Cog6ToothIcon,
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  UserIcon,
} from "@sparkle/index_with_tw_base";

const meta = {
  title: "NewPrimitives/ContextMenu",
  component: ContextMenu,
} satisfies Meta<typeof ContextMenu>;

export default meta;

export const DropdownExamples = () => (
  <div className="s-flex s-h-80 s-w-full s-flex-col s-items-center s-justify-center s-gap-4">
    <div>{SimpleContewtDemo()}</div>
    <div>{ComplexContextDemo()}</div>
  </div>
);
export function SimpleContewtDemo() {
  return (
    <ContextMenu>
      <ContextMenuTrigger>Right click</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem label="Profile" />
        <ContextMenuItem label="Billing" />
        <ContextMenuItem label="Team" />
        <ContextMenuItem label="Subscription" />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function ComplexContextDemo() {
  return (
    <ContextMenu>
      <ContextMenuTrigger>Open Complex</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>My Account</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem icon={UserIcon} label="Profile" shortcut="⇧⌘P" />
          <ContextMenuItem icon={ArrowDownCircleIcon} label="Billing" />
          <ContextMenuItem icon={Cog6ToothIcon} label="Settings" />
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem icon={UserIcon} label="Team" />
          <ContextMenuSub>
            <ContextMenuSubTrigger icon={UserIcon} label="Invite users" />
            <ContextMenuPortal>
              <ContextMenuSubContent>
                <ContextMenuItem label="Email" />
                <ContextMenuItem label="Message" />
                <ContextMenuSeparator />
                <ContextMenuItem label="More..." />
              </ContextMenuSubContent>
            </ContextMenuPortal>
          </ContextMenuSub>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
