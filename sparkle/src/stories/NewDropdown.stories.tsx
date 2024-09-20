import { DropdownMenuCheckboxItemProps } from "@radix-ui/react-dropdown-menu";
import type { Meta } from "@storybook/react";
import React from "react";

import {
  NewDropdownMenu,
  NewDropdownMenuCheckboxItem,
  NewDropdownMenuContent,
  NewDropdownMenuGroup,
  NewDropdownMenuItem,
  NewDropdownMenuLabel,
  NewDropdownMenuPortal,
  NewDropdownMenuRadioGroup,
  NewDropdownMenuRadioItem,
  NewDropdownMenuSeparator,
  NewDropdownMenuShortcut,
  NewDropdownMenuSub,
  NewDropdownMenuSubContent,
  NewDropdownMenuSubTrigger,
  NewDropdownMenuTrigger,
} from "@sparkle/components/NewDropdown";
import { GithubLogo } from "@sparkle/logo/platforms";

import {
  ArrowDownCircleIcon,
  ChatBubbleBottomCenterPlusIcon,
  CloudArrowDownIcon,
  Cog6ToothIcon,
  Icon,
  LogoutIcon,
  MagicIcon,
  UserIcon,
} from "../index_with_tw_base";

const meta = {
  title: "NewPrimitives/Dropdown",
  component: NewDropdownMenu,
} satisfies Meta<typeof NewDropdownMenu>;

export default meta;

export const DropdownExamples = () => (
  <div className="s-flex s-h-80 s-w-full s-flex-col s-items-center s-justify-center s-gap-4">
    <div>{SimpleDropdownDemo()}</div>
    <div>{ComplexDropdownDemo()}</div>
    <div>{DropdownMenuCheckboxes()}</div>
    <div>{DropdownMenuRadioGroupDemo()}</div>
  </div>
);
export function SimpleDropdownDemo() {
  return (
    <NewDropdownMenu>
      <NewDropdownMenuTrigger variant="outline">
        Open Simple Dropdown
      </NewDropdownMenuTrigger>
      <NewDropdownMenuContent>
        <NewDropdownMenuLabel>My Account</NewDropdownMenuLabel>
        <NewDropdownMenuSeparator />
        <NewDropdownMenuItem>Profile</NewDropdownMenuItem>
        <NewDropdownMenuItem>Billing</NewDropdownMenuItem>
        <NewDropdownMenuItem>Team</NewDropdownMenuItem>
        <NewDropdownMenuItem>Subscription</NewDropdownMenuItem>
      </NewDropdownMenuContent>
    </NewDropdownMenu>
  );
}

export function ComplexDropdownDemo() {
  return (
    <NewDropdownMenu>
      <NewDropdownMenuTrigger variant="primary">
        Open Complex
      </NewDropdownMenuTrigger>
      <NewDropdownMenuContent className="w-56">
        <NewDropdownMenuLabel>My Account</NewDropdownMenuLabel>
        <NewDropdownMenuSeparator />
        <NewDropdownMenuGroup>
          <NewDropdownMenuItem>
            <Icon visual={UserIcon} size="xs" />
            Profile
            <NewDropdownMenuShortcut>⇧⌘P</NewDropdownMenuShortcut>
          </NewDropdownMenuItem>
          <NewDropdownMenuItem>
            <Icon visual={ArrowDownCircleIcon} size="xs" />
            Billing
            <NewDropdownMenuShortcut>⌘B</NewDropdownMenuShortcut>
          </NewDropdownMenuItem>
          <NewDropdownMenuItem>
            <Icon visual={Cog6ToothIcon} size="xs" />
            Settings
            <NewDropdownMenuShortcut>⌘S</NewDropdownMenuShortcut>
          </NewDropdownMenuItem>
          <NewDropdownMenuItem>
            <Icon visual={UserIcon} size="xs" />
            Keyboard shortcuts
            <NewDropdownMenuShortcut>⌘K</NewDropdownMenuShortcut>
          </NewDropdownMenuItem>
        </NewDropdownMenuGroup>
        <NewDropdownMenuSeparator />
        <NewDropdownMenuGroup>
          <NewDropdownMenuItem>
            <Icon visual={UserIcon} size="xs" />
            Team
          </NewDropdownMenuItem>
          <NewDropdownMenuSub>
            <NewDropdownMenuSubTrigger>
              <Icon visual={UserIcon} size="xs" />
              Invite users
            </NewDropdownMenuSubTrigger>
            <NewDropdownMenuPortal>
              <NewDropdownMenuSubContent>
                <NewDropdownMenuItem>
                  <Icon visual={MagicIcon} size="xs" />
                  Email
                </NewDropdownMenuItem>
                <NewDropdownMenuItem>
                  <Icon visual={ChatBubbleBottomCenterPlusIcon} size="xs" />
                  Message
                </NewDropdownMenuItem>
                <NewDropdownMenuSeparator />
                <NewDropdownMenuItem>
                  <Icon visual={UserIcon} size="xs" />
                  More...
                </NewDropdownMenuItem>
              </NewDropdownMenuSubContent>
            </NewDropdownMenuPortal>
          </NewDropdownMenuSub>
          <NewDropdownMenuItem>
            <Icon visual={UserIcon} size="xs" />
            New Team
            <NewDropdownMenuShortcut>⌘+T</NewDropdownMenuShortcut>
          </NewDropdownMenuItem>
        </NewDropdownMenuGroup>
        <NewDropdownMenuSeparator />
        <NewDropdownMenuItem>
          <Icon visual={GithubLogo} size="xs" />
          GitHub
        </NewDropdownMenuItem>
        <NewDropdownMenuItem>
          <Icon visual={UserIcon} size="xs" />
          Support
        </NewDropdownMenuItem>
        <NewDropdownMenuItem disabled>
          <Icon visual={CloudArrowDownIcon} size="xs" />
          API
        </NewDropdownMenuItem>
        <NewDropdownMenuSeparator />
        <NewDropdownMenuItem>
          <Icon visual={LogoutIcon} size="xs" />
          Log out
          <NewDropdownMenuShortcut>⇧⌘Q</NewDropdownMenuShortcut>
        </NewDropdownMenuItem>
      </NewDropdownMenuContent>
    </NewDropdownMenu>
  );
}

type Checked = DropdownMenuCheckboxItemProps["checked"];

export function DropdownMenuCheckboxes() {
  const [showStatusBar, setShowStatusBar] = React.useState<Checked>(true);
  const [showActivityBar, setShowActivityBar] = React.useState<Checked>(false);
  const [showPanel, setShowPanel] = React.useState<Checked>(false);

  return (
    <NewDropdownMenu>
      <NewDropdownMenuTrigger variant="ghost">
        Open Checkbox
      </NewDropdownMenuTrigger>
      <NewDropdownMenuContent className="w-56">
        <NewDropdownMenuLabel>Appearance</NewDropdownMenuLabel>
        <NewDropdownMenuSeparator />
        <NewDropdownMenuCheckboxItem
          checked={showStatusBar}
          onCheckedChange={setShowStatusBar}
        >
          Status Bar
        </NewDropdownMenuCheckboxItem>
        <NewDropdownMenuCheckboxItem
          checked={showActivityBar}
          onCheckedChange={setShowActivityBar}
          disabled
        >
          Activity Bar
        </NewDropdownMenuCheckboxItem>
        <NewDropdownMenuCheckboxItem
          checked={showPanel}
          onCheckedChange={setShowPanel}
        >
          Panel
        </NewDropdownMenuCheckboxItem>
      </NewDropdownMenuContent>
    </NewDropdownMenu>
  );
}

export function DropdownMenuRadioGroupDemo() {
  const [position, setPosition] = React.useState("bottom");

  return (
    <NewDropdownMenu>
      <NewDropdownMenuTrigger variant="ghost">
        Open Radio
      </NewDropdownMenuTrigger>
      <NewDropdownMenuContent className="w-56">
        <NewDropdownMenuLabel>Panel Position</NewDropdownMenuLabel>
        <NewDropdownMenuSeparator />
        <NewDropdownMenuRadioGroup value={position} onValueChange={setPosition}>
          <NewDropdownMenuRadioItem value="top">Top</NewDropdownMenuRadioItem>
          <NewDropdownMenuRadioItem value="bottom">
            Bottom
          </NewDropdownMenuRadioItem>
          <NewDropdownMenuRadioItem value="right">
            Right
          </NewDropdownMenuRadioItem>
        </NewDropdownMenuRadioGroup>
      </NewDropdownMenuContent>
    </NewDropdownMenu>
  );
}
