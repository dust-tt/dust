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
  LogoutIcon,
  MagicIcon,
  NewButton,
  UserGroupIcon,
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
      <NewDropdownMenuTrigger>
        <NewButton isSelect label="Open Simple Dropdown" />
      </NewDropdownMenuTrigger>
      <NewDropdownMenuContent>
        <NewDropdownMenuLabel label="My Account" />
        <NewDropdownMenuItem label="Profile" />
        <NewDropdownMenuItem label="Billing" />
        <NewDropdownMenuItem label="Team" />
        <NewDropdownMenuItem label="Subscription" />
      </NewDropdownMenuContent>
    </NewDropdownMenu>
  );
}

export function ComplexDropdownDemo() {
  return (
    <NewDropdownMenu>
      <NewDropdownMenuTrigger>
        <NewButton isSelect variant="primary" label="Open Complex" />
      </NewDropdownMenuTrigger>
      <NewDropdownMenuContent className="w-56">
        <NewDropdownMenuLabel label="My Account" />
        <NewDropdownMenuGroup>
          <NewDropdownMenuItem icon={UserIcon} label="Profile" shortcut="⌘P" />
          <NewDropdownMenuItem
            icon={ArrowDownCircleIcon}
            label="Billing"
            shortcut="⌘B"
          />
          <NewDropdownMenuItem
            icon={Cog6ToothIcon}
            label="Settings"
            shortcut="⌘S"
          />
          <NewDropdownMenuItem
            icon={UserIcon}
            label="Keyboard shortcuts"
            shortcut="⌘K"
          />
        </NewDropdownMenuGroup>
        <NewDropdownMenuSeparator />
        <NewDropdownMenuGroup>
          <NewDropdownMenuLabel label="Team" />
          <NewDropdownMenuItem icon={UserIcon} label="Members" />
          <NewDropdownMenuSub>
            <NewDropdownMenuSubTrigger icon={UserIcon} label="Invite users" />
            <NewDropdownMenuPortal>
              <NewDropdownMenuSubContent>
                <NewDropdownMenuItem icon={MagicIcon} label="Email" />
                <NewDropdownMenuItem
                  icon={ChatBubbleBottomCenterPlusIcon}
                  label="Message"
                />
                <NewDropdownMenuSeparator />
                <NewDropdownMenuItem icon={UserIcon} label="More..." />
              </NewDropdownMenuSubContent>
            </NewDropdownMenuPortal>
          </NewDropdownMenuSub>
          <NewDropdownMenuItem
            icon={UserGroupIcon}
            label="New Team"
            shortcut="⌘+T"
          />
        </NewDropdownMenuGroup>
        <NewDropdownMenuSeparator />
        <NewDropdownMenuItem icon={GithubLogo} label="GitHub" />
        <NewDropdownMenuItem icon={UserIcon} label="Support" />
        <NewDropdownMenuItem icon={CloudArrowDownIcon} label="API" disabled />
        <NewDropdownMenuSeparator />
        <NewDropdownMenuItem icon={LogoutIcon} label="Log out" shortcut="⇧⌘Q" />
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
      <NewDropdownMenuTrigger>
        <NewButton isSelect variant="ghost" label="Open Checkbox" />
      </NewDropdownMenuTrigger>
      <NewDropdownMenuContent className="w-56">
        <NewDropdownMenuLabel label="Appearance" />
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
      <NewDropdownMenuTrigger>
        <NewButton isSelect variant="ghost" label="Open Radio" />
      </NewDropdownMenuTrigger>
      <NewDropdownMenuContent className="w-56">
        <NewDropdownMenuLabel label="Panel Position" />
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
