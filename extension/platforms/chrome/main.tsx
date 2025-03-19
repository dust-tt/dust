// Tailwind base globals
import "../../ui/css/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "../../ui/css/components.css";
// Local custom styles
import "../../ui/css/custom.css";

import { PortProvider } from "@app/platforms/chrome/contextes/PortContext";
import { AuthProvider } from "@app/ui/components/auth/AuthProvider";
import { routes } from "@app/ui/pages/routes";
import { Notification } from "@dust-tt/sparkle";
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
