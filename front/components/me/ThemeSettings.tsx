import { Card, CardGrid, Icon, Label, ActionMoonIcon, ActionSunIcon, ActionCommandIcon } from "@dust-tt/sparkle";
import { Page } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";
export function ThemeSettings() {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    setTheme(localStorage.getItem("theme") || "light");
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <Page.Layout direction="vertical">
      <Label>Theme</Label>
      <CardGrid>
        <Card
          variant={theme === "light" ? "primary" : "secondary"}
          className="w-full cursor-pointer"
          onClick={() => {
            setTheme("light");
            location.reload();
          }}
        >
          <div className="flex flex-row items-center gap-2">
            <Icon visual={ActionSunIcon} />
            <p>Light</p>
          </div>
        </Card>
        <Card
          variant={theme === "dark" ? "primary" : "secondary"}
          className="w-full cursor-pointer"
          onClick={() => {
            setTheme("dark");
            location.reload();
          }}
        >
          <div className="flex flex-row items-center gap-2">
            <Icon visual={ActionMoonIcon} />
            <p>Dark</p>
          </div>
        </Card>
        <Card
          variant={theme === "system" ? "primary" : "secondary"}
          className="w-full cursor-pointer"
          onClick={() => {
            setTheme("system");
            location.reload();
          }}
        >
          <div className="flex flex-row items-center gap-2">
            <Icon visual={ActionCommandIcon} />
            <p>System</p>
          </div>
        </Card>
      </CardGrid>
    </Page.Layout>
  );
}
