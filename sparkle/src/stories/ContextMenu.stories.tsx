import type { Meta } from "@storybook/react";
import React from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@sparkle/components/ContextMenu";
import {
  ArrowDownCircleIcon,
  ChatBubbleBottomCenterPlusIcon,
  Cog6ToothIcon,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  Icon,
  MagicIcon,
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
        <ContextMenuItem>Profile</ContextMenuItem>
        <ContextMenuItem>Billing</ContextMenuItem>
        <ContextMenuItem>Team</ContextMenuItem>
        <ContextMenuItem>Subscription</ContextMenuItem>
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
          <ContextMenuItem>
            <Icon visual={UserIcon} size="xs" />
            Profile
            <ContextMenuShortcut>⇧⌘P</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem>
            <Icon visual={ArrowDownCircleIcon} size="xs" />
            Billing
            <ContextMenuShortcut>⌘B</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem>
            <Icon visual={Cog6ToothIcon} size="xs" />
            Settings
            <ContextMenuShortcut>⌘S</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem>
            <Icon visual={UserIcon} size="xs" />
            Keyboard shortcuts
            <ContextMenuShortcut>⌘K</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem>
            <Icon visual={UserIcon} size="xs" />
            Team
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Icon visual={UserIcon} size="xs" />
              Invite users
            </ContextMenuSubTrigger>
            <ContextMenuPortal>
              <ContextMenuSubContent>
                <ContextMenuItem>
                  <Icon visual={MagicIcon} size="xs" />
                  Email
                </ContextMenuItem>
                <ContextMenuItem>
                  <Icon visual={ChatBubbleBottomCenterPlusIcon} size="xs" />
                  Message
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem>
                  <Icon visual={UserIcon} size="xs" />
                  More...
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuPortal>
          </ContextMenuSub>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
