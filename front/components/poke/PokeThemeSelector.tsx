import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  ButtonsSwitch,
  ButtonsSwitchList,
  Monitor01,
  Moon01,
  Sun,
} from "@dust-tt/sparkle";

const THEME_OPTIONS = {
  light: { label: "Light", icon: Sun },
  system: { label: "System", icon: Monitor01 },
  dark: { label: "Dark", icon: Moon01 },
} as const;

const THEME_ORDER = ["light", "system", "dark"] as const;

export function PokeThemeSelector() {
  const { theme, setTheme } = useTheme();

  const handleThemeChange = (newTheme: string) => {
    switch (newTheme) {
      case "light":
      case "system":
      case "dark":
        setTheme(newTheme);
    }
  };

  return (
    <ButtonsSwitchList
      aria-label="Theme"
      size="sm"
      value={theme}
      onValueChange={handleThemeChange}
    >
      {THEME_ORDER.map((themeOption) => {
        const option = THEME_OPTIONS[themeOption];

        return (
          <ButtonsSwitch
            key={themeOption}
            value={themeOption}
            icon={option.icon}
            aria-label={`${option.label} theme`}
            tooltip={`${option.label} theme`}
            className="after:hidden"
            style={{ background: "transparent" }}
          />
        );
      })}
    </ButtonsSwitchList>
  );
}
