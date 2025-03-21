// Tailwind base globals
import "../../ui/css/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "../../ui/css/components.css";
// Local custom styles
import "../../ui/css/custom.css";

import { FrontPlatformProvider } from "@app/platforms/front/context/FrontPlatformProvider";
import { FrontContextProvider } from "@app/platforms/front/context/FrontProvider";
import { AuthProvider } from "@app/ui/components/auth/AuthProvider";
import { routes } from "@app/ui/pages/routes";
import { Notification } from "@dust-tt/sparkle";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

const router = createBrowserRouter(routes);

const App = () => {
  return (
    <FrontContextProvider>
      <FrontPlatformProvider>
        <AuthProvider>
          <Notification.Area>
            <RouterProvider router={router} />
          </Notification.Area>
        </AuthProvider>
      </FrontPlatformProvider>
    </FrontContextProvider>
  );
};
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
