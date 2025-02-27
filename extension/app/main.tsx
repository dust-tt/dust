// Tailwind base globals
import "./src/css/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "./src/css/components.css";
// Local custom styles
import "./src/css/custom.css";

import { Notification } from "@dust-tt/sparkle";
import { AuthProvider } from "@extension/components/auth/AuthProvider";
import { PortProvider } from "@extension/components/PortContext";
import { routes } from "@extension/pages/routes";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter(routes);

const App = () => {
  return (
    <PortProvider>
      <AuthProvider>
        <Notification.Area>
          <RouterProvider router={router} />
        </Notification.Area>
      </AuthProvider>
    </PortProvider>
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
  const { theme } = await chrome.storage.local.get(["theme"]);
  if (!theme || theme === "system") {
    setupSystemTheme();
  } else {
    removeSystemTheme();
    updateTheme(theme === "dark");
  }
};
void initializeTheme();

chrome.storage.onChanged.addListener((changes) => {
  if (changes.theme) {
    const newTheme = changes.theme.newValue;
    if (!newTheme || newTheme === "system") {
      setupSystemTheme();
    } else {
      removeSystemTheme();
      updateTheme(newTheme === "dark");
    }
  }
});
