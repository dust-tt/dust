// Tailwind base globals
import "../../ui/css/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "../../ui/css/components.css";
// Local custom styles
import "../../ui/css/custom.css";

import { PortProvider } from "@app/platforms/chrome/context/PortContext";
import { ChromePlatformService } from "@app/platforms/chrome/services/platform";
import {
  PlatformProvider,
  usePlatform,
} from "@app/shared/context/PlatformContext";
import { AuthProvider } from "@app/ui/components/auth/AuthProvider";
import { routes } from "@app/ui/pages/routes";
import { datadogLogs } from "@datadog/browser-logs";
import {
  Button,
  classNames,
  DustLogo,
  Notification,
  Page,
} from "@dust-tt/sparkle";
import { compare } from "compare-versions";
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

if (process.env.DATADOG_CLIENT_TOKEN) {
  datadogLogs.init({
    clientToken: process.env.DATADOG_CLIENT_TOKEN,
    site: "datadoghq.eu",
    service: "dust-chrome-extension",
    env: process.env.DATADOG_ENV,
    version: process.env.VERSION,
    forwardConsoleLogs: ["error"],
    forwardErrorsToLogs: true,
    sessionSampleRate: 100,
  });
}

const logger = datadogLogs.logger;
logger.info("Dust extension loaded");

const router = createBrowserRouter(routes);

const ChromeExtensionWrapper = () => {
  const platform = usePlatform() as ChromePlatformService;
  const [isLatestVersion, setIsLatestVersion] = React.useState(true);

  const checkIsLatestVersion = async () => {
    const pendingUpdate = await platform.getPendingUpdate();
    if (!pendingUpdate) {
      return null;
    }
    const currentVersion = chrome.runtime.getManifest().version;
    if (compare(pendingUpdate.version, currentVersion, ">")) {
      setIsLatestVersion(false);
    }
  };

  React.useEffect(() => {
    void checkIsLatestVersion();

    const unsub = platform.storage.onChanged((changes) => {
      if (changes.pendingUpdate) {
        void checkIsLatestVersion();
      }
    });

    return () => unsub();
  }, []);

  if (!isLatestVersion) {
    return (
      <div
        className={classNames(
          "flex h-screen flex-col gap-2 p-4",
          "bg-background text-foreground",
          "dark:bg-background-night dark:text-foreground-night"
        )}
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-center">
          <div className="flex flex-col items-center text-center gap-4">
            <DustLogo width={256} height={64} />
            <Page.Header title="New version ready" />
            <Page.P>
              Install the latest version to keep using Dust. <br />
              Relaunch from toolbar.
            </Page.P>
            <Button
              label="Update now"
              onClick={async () => {
                chrome.runtime.reload();
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
};

const platformService = new ChromePlatformService();

const App = () => {
  return (
    <PlatformProvider platformService={platformService}>
      <PortProvider>
        <AuthProvider>
          <Notification.Area>
            <ChromeExtensionWrapper />
          </Notification.Area>
        </AuthProvider>
      </PortProvider>
    </PlatformProvider>
  );
};
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}

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

platformService.storage.onChanged((changes) => {
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
