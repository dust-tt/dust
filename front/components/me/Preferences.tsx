import {
  ActionMoonIcon,
  ActionSunIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Label,
  LightModeIcon,
} from "@dust-tt/sparkle";
import { Page } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";

export function Preferences() {
  const { theme, setTheme } = useTheme();
  const [submitMessageKey, setSubmitMessageKey] = useState("enter");

  useEffect(() => {
    setSubmitMessageKey(localStorage.getItem("submitMessageKey") || "enter");
  }, []);

  useEffect(() => {
    localStorage.setItem("submitMessageKey", submitMessageKey);
  }, [submitMessageKey]);

  return (
    <Page.Layout direction="horizontal" align="stretch" sizing="grow">
      <Page.Layout direction="vertical">
        <Label>Theme</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              icon={
                theme === "light"
                  ? ActionSunIcon
                  : theme === "dark"
                    ? ActionMoonIcon
                    : LightModeIcon
              }
              label={
                theme === "light"
                  ? "Light"
                  : theme === "dark"
                    ? "Dark"
                    : "System"
              }
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              icon={ActionSunIcon}
              onClick={() => {
                setTheme("light");
              }}
              label="Light"
            />
            <DropdownMenuItem
              icon={ActionMoonIcon}
              onClick={() => {
                setTheme("dark");
              }}
              label="Dark"
            />
            <DropdownMenuItem
              icon={LightModeIcon}
              onClick={() => {
                setTheme("system");
              }}
              label="System"
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </Page.Layout>
      <Page.Layout direction="vertical">
        <Label>Submit Behavior</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              label={
                submitMessageKey === "enter" ? "Enter (↵)" : "Cmd+Enter (⌘+↵)"
              }
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onClick={() => {
                setSubmitMessageKey("enter");
              }}
            >
              Send message when pressing Enter
              <DropdownMenuShortcut>↵</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setSubmitMessageKey("cmd+enter");
              }}
            >
              Send message when pressing Cmd+Enter
              <DropdownMenuShortcut>⌘ + ↵</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Page.Layout>
    </Page.Layout>
  );
}
