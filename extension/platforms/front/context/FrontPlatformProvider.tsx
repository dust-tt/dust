import { useFrontContext } from "@app/platforms/front/context/FrontProvider";
import { FrontPlatformService } from "@app/platforms/front/services/platform";
import { PlatformProvider } from "@app/shared/context/PlatformContext";
import { Spinner } from "@dust-tt/sparkle";
import { useEffect, useMemo } from "react";

const updateTheme = (isDark: boolean) => {
  document.body.classList.remove("dark", "s-dark");
  if (isDark) {
    document.body.classList.add("dark", "s-dark");
  }
};

let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

const setupSystemTheme = () => {
  updateTheme(mediaQuery.matches);
  systemThemeListener = (e) => updateTheme(e.matches);
  mediaQuery.addEventListener("change", systemThemeListener);
};

const removeSystemTheme = () => {
  if (systemThemeListener) {
    mediaQuery.removeEventListener("change", systemThemeListener);
    systemThemeListener = null;
  }
};

export const FrontPlatformProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const frontContext = useFrontContext();

  const platformService = useMemo(() => {
    if (!frontContext) {
      return null;
    }

    return new FrontPlatformService(frontContext);
  }, [frontContext]);

  useEffect(() => {
    if (!platformService) {
      return;
    }

    const initializeTheme = async () => {
      const theme = await platformService.getTheme();
      if (theme === "system") {
        setupSystemTheme();
      } else {
        removeSystemTheme();
        updateTheme(theme === "dark");
      }
    };
    void initializeTheme();

    platformService.storage.onChanged((changes: { theme?: string }) => {
      if ("theme" in changes) {
        if (changes.theme) {
          const newTheme = changes.theme;
          if (!newTheme || newTheme === "system") {
            setupSystemTheme();
          } else {
            removeSystemTheme();
            updateTheme(newTheme === "dark");
          }
        }
      }
    });

    return () => {
      removeSystemTheme();
    };
  }, [platformService]);

  if (!frontContext || !platformService) {
    return <Spinner />;
  }

  return (
    <PlatformProvider platformService={platformService}>
      {children}
    </PlatformProvider>
  );
};
