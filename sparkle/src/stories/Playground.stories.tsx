import {} from "@radix-ui/react-dropdown-menu";
import React from "react";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Label,
  Page,
} from "@sparkle/components";
import { ActionMoonIcon, ActionSunIcon, LightModeIcon } from "@sparkle/icons";

export default {
  title: "Playground/Demo",
};

export const Demo = () => {
  return (
    <div className="s-flex s-h-full s-w-full s-cursor-pointer s-flex-col s-gap-2">
      <Page.Layout direction="horizontal">
        <Page.Vertical sizing="grow" align="stretch" gap="xs">
          <Label>Theme</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                icon={LightModeIcon}
                label="light"
                isSelect
                className="s-w-fit"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem icon={ActionSunIcon} label="Light" />
              <DropdownMenuItem icon={ActionMoonIcon} label="Dark" />
              <DropdownMenuItem icon={LightModeIcon} label="System" />
            </DropdownMenuContent>
          </DropdownMenu>
        </Page.Vertical>
        <Page.Vertical sizing="grow" align="stretch" gap="xs">
          <Label>Keyboard Shortcuts</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="s-copy-sm s-flex s-items-center s-gap-2">
                Send message
                <Button
                  variant="outline"
                  label="Cmd+Enter (⌘+↵)"
                  isSelect
                  className="s-w-fit"
                />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>
                Send message when pressing Enter
                <DropdownMenuShortcut>↵</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                Send message when pressing Cmd+Enter
                <DropdownMenuShortcut>⌘ + ↵</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Page.Vertical>
      </Page.Layout>
    </div>
  );
};
