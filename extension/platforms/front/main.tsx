// Tailwind base globals
import "../../ui/css/global.css";
// Use sparkle styles, override local globals
import "@dust-tt/sparkle/dist/sparkle.css";
// Local tailwind components override sparkle styles
import "../../ui/css/components.css";
// Local custom styles
import "../../ui/css/custom.css";

import { Notification } from "@dust-tt/sparkle";
import { FrontPlatformProvider } from "@extension/platforms/front/context/FrontPlatformProvider";
import { FrontContextProvider } from "@extension/platforms/front/context/FrontProvider";
import { AuthProvider } from "@extension/ui/components/auth/AuthProvider";
import { routes } from "@extension/ui/pages/routes";
import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

// Create a router instance outside the component to avoid recreation.
// Use memory router to avoid interfering with the parent page.
const router = createMemoryRouter(routes, {
  initialEntries: ["/"],
  initialIndex: 0,
});

// Simple wrapper component to handle unmounting.
const AppWrapper = () => {
  const [isMounted, setIsMounted] = useState(false);
  const [isIframeReady, setIsIframeReady] = useState(false);

  // Handle cleanup when the component unmounts.
  useEffect(() => {
    // Check if we're in an iframe.
    const isInIframe = window.self !== window.top;

    // Set iframe ready state.
    setIsIframeReady(isInIframe ? document.readyState === "complete" : true);

    // Set mounted state.
    setIsMounted(true);

    return () => {
      setIsMounted(false);
    };
  }, []);

  // Only render the app if it's mounted and iframe is ready.
  if (!isMounted || !isIframeReady) {
    return null;
  }

  return (
    <FrontContextProvider>
      <FrontPlatformProvider>
        <AuthProvider>
          <Notification.Area>
            <RouterProvider router={router} key="front-router" />
          </Notification.Area>
        </AuthProvider>
      </FrontPlatformProvider>
    </FrontContextProvider>
  );
};

// Render the app.
const rootElement = document.getElementById("root");
if (rootElement) {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<AppWrapper />);
  } catch (error) {
    console.error("Error rendering Dust app:", error);
  }
} else {
  console.error("Root element not found");
}
