import {
  ActionCommandIcon,
  ActionMoonIcon,
  ActionSunIcon,
  Button,
  CommandIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
} from "@dust-tt/sparkle";
import { Page } from "@dust-tt/sparkle";
import { ArrowBigUpIcon } from "lucide-react";
import { useEffect, useState } from "react";

export function Preferences() {
  const [theme, setTheme] = useState("light");
  const [enterBehavior, setEnterBehavior] = useState("enter");

  useEffect(() => {
    setTheme(localStorage.getItem("theme") || "light");
    setEnterBehavior(localStorage.getItem("enterBehavior") || "enter");
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("enterBehavior", enterBehavior);
  }, [enterBehavior]);

  return (
    <Page.Layout direction="horizontal" align="stretch" sizing="grow">
      <Page.Layout direction="vertical" sizing="grow">
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
                    : ActionCommandIcon
              }
              label={
                theme === "light"
                  ? "Light"
                  : theme === "dark"
                    ? "Dark"
                    : "System"
              }
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              icon={ActionSunIcon}
              onClick={() => {
                setTheme("light");
                location.reload();
              }}
              label="Light"
            />
            <DropdownMenuItem
              icon={ActionMoonIcon}
              onClick={() => {
                setTheme("dark");
                location.reload();
              }}
              label="Dark"
            />
            <DropdownMenuItem
              icon={ActionCommandIcon}
              onClick={() => {
                setTheme("system");
                location.reload();
              }}
              label="System"
              description="Follow system settings"
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </Page.Layout>
      <Page.Layout direction="vertical" sizing="grow">
        <Label>Submit Behavior</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              icon={enterBehavior === "enter" ? ArrowBigUpIcon : CommandIcon}
              label={enterBehavior === "enter" ? "Enter" : "Cmd+Enter"}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              icon={ArrowBigUpIcon}
              onClick={() => {
                setEnterBehavior("enter");
              }}
              label="Enter"
              description="Send message when pressing Enter, press Shift+Enter to send a new line"
            />
            <DropdownMenuItem
              icon={CommandIcon}
              onClick={() => {
                setEnterBehavior("cmd+enter");
              }}
              label="Cmd+Enter"
              description="Send message when pressing Cmd+Enter, press Enter to send a new line"
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </Page.Layout>
      <Page.Layout direction="vertical" sizing="grow">
        <></>
      </Page.Layout>
    </Page.Layout>
  );
}
