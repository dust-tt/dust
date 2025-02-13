// Tailwind base globals
import "../css/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "../css/components.css";
// Local custom styles
import "../css/custom.css";

import { Notification } from "@dust-tt/sparkle";
import { AuthProvider } from "@extension/components/auth/AuthProvider";
import { frontPlatform } from "@extension/front/platform";
import { FrontAuth } from "@extension/front/services/auth";
import { routes } from "@extension/pages/routes";
import { PlatformContext } from "@extension/shared/context/platform";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter(routes);

const App = () => {
  const authService = new FrontAuth();

  return (
    <PlatformContext.Provider value={frontPlatform}>
      <AuthProvider authService={authService}>
        <Notification.Area>
          <RouterProvider router={router} />
        </Notification.Area>
      </AuthProvider>
    </PlatformContext.Provider>
  );
};
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
