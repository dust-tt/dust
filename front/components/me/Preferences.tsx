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
  useSendNotification,
} from "@dust-tt/sparkle";
import { Page } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { SubmitMessageKey } from "@app/lib/keymaps";
import { isSubmitMessageKey } from "@app/lib/keymaps";

export function Preferences() {
  const { theme, setTheme } = useTheme();
  const sendNotification = useSendNotification();
  const [submitMessageKey, setSubmitMessageKey] =
    useState<SubmitMessageKey>("enter");

  useEffect(() => {
    const key = localStorage.getItem("submitMessageKey");
    setSubmitMessageKey(key && isSubmitMessageKey(key) ? key : "enter");
  }, []);

  const handleSubmitKeyChange = (key: SubmitMessageKey) => {
    setSubmitMessageKey(key);
    localStorage.setItem("submitMessageKey", key);
    sendNotification({
      title: "Submit key changed successfully !",
      description:
        key === "enter"
          ? "Submit key is now Enter."
          : "Submit key is now Cmd+Enter.",
      type: "success",
    });
  };

  return (
    <Page.Layout direction="horizontal">
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
                handleSubmitKeyChange("enter");
              }}
            >
              Send message when pressing Enter
              <DropdownMenuShortcut>↵</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                handleSubmitKeyChange("cmd+enter");
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
