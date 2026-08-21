import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
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
  const currentTheme = THEME_OPTIONS[theme];

  const handleThemeChange = (newTheme: string) => {
    switch (newTheme) {
      case "light":
      case "system":
      case "dark":
        setTheme(newTheme);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={currentTheme.icon}
          label={currentTheme.label}
          aria-label={`Theme: ${currentTheme.label}`}
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup value={theme} onValueChange={handleThemeChange}>
          {THEME_ORDER.map((themeOption) => {
            const option = THEME_OPTIONS[themeOption];

            return (
              <DropdownMenuRadioItem
                key={themeOption}
                value={themeOption}
                icon={option.icon}
                label={option.label}
              />
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
