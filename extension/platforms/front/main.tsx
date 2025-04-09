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
import { useEffect, useState } from "react";

// Create a router instance outside the component to avoid recreation.
const router = createBrowserRouter(routes);

// Simple wrapper component to handle unmounting.
const AppWrapper = () => {
  const [isMounted, setIsMounted] = useState(true);

  // Handle cleanup when the component unmounts.
  useEffect(() => {
    return () => {
      setIsMounted(false);
    };
  }, []);

  // Only render the app if it's mounted.
  if (!isMounted) {
    return null;
  }

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

// Render the app.
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<AppWrapper />);
}
