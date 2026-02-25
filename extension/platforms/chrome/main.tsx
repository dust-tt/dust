// Tailwind base globals
import "../../ui/css/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "../../ui/css/components.css";
// Local custom styles
import "../../ui/css/custom.css";
import { datadogLogs } from "@datadog/browser-logs";
import { ChromePlatformService } from "@extension/platforms/chrome/services/platform";
import React from "react";
import ReactDOM from "react-dom/client";
import { ChromeApp } from "./ChromeApp";

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

const platformService = new ChromePlatformService();

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ChromeApp />
    </React.StrictMode>
  );
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
