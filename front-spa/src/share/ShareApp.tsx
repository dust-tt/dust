import { Notification, SparkleContext } from "@dust-tt/sparkle";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { SWRConfig } from "swr";

import { SharedFilePage } from "@dust-tt/front/components/pages/share/SharedFilePage";
import { SharedFramePage } from "@dust-tt/front/components/pages/share/SharedFramePage";
import { RegionProvider } from "@dust-tt/front/lib/auth/RegionContext";
import { LinkWrapper } from "@dust-tt/front/lib/platform";

const router = createBrowserRouter(
  [
    // Frame: /share/frame/:token
    {
      path: "/share/frame/:token",
      element: <SharedFramePage />,
    },
    // File: /share/file/:token (redirects to frame)
    {
      path: "/share/file/:token",
      element: <SharedFilePage />,
    },
  ],
  {
    basename: import.meta.env.VITE_BASE_PATH ?? "",
  }
);

export default function ShareApp() {
  return (
    <RegionProvider>
      <SWRConfig>
        <RouterProvider router={router} />
      </SWRConfig>
    </RegionProvider>
  );
}
