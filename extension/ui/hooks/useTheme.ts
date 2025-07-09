import { usePlatform } from "@app/shared/context/PlatformContext";
import type { Theme } from "@app/shared/services/platform";
import { DEFAULT_THEME } from "@app/shared/services/platform";
import { useEffect, useState } from "react";

export const useTheme = () => {
  const platform = usePlatform();
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    const loadTheme = async () => {
      const savedTheme = await platform.getTheme();
      setTheme(savedTheme);
    };
    void loadTheme();
  }, []);

  const updateTheme = async (newTheme: Theme) => {
    await platform.saveTheme(newTheme);
    setTheme(newTheme);
  };

  return { theme, updateTheme };
};
