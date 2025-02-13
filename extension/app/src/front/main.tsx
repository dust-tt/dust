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
import { FrontPlatformInitializer } from "@extension/front/components/FrontPlatformInitializer";
import { FrontContextProvider } from "@extension/front/providers/FrontProvider";
import { routes } from "@extension/pages/routes";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter(routes);

const App = () => {
  return (
    <FrontContextProvider>
      <FrontPlatformInitializer>
        <AuthProvider>
          <Notification.Area>
            <RouterProvider router={router} />
          </Notification.Area>
        </AuthProvider>
      </FrontPlatformInitializer>
    </FrontContextProvider>
  );
};
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
