import { Card, CardGrid, Icon, Label } from "@dust-tt/sparkle";
import { Page } from "@dust-tt/sparkle";
import { ComputerIcon, MoonIcon, SunIcon } from "lucide-react";
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
            <Icon visual={SunIcon} />
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
            <Icon visual={MoonIcon} />
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
            <Icon visual={ComputerIcon} />
            <p>System</p>
          </div>
        </Card>
      </CardGrid>
    </Page.Layout>
  );
}
