import { createBrowserRouter, RouterProvider } from "react-router-dom";

import RootLayout from "@dust-tt/front/components/app/RootLayout";
import { OAuthFinalizePage } from "@dust-tt/front/components/pages/oauth/OAuthFinalizePage";
import { OAuthSetupRedirectPage } from "@dust-tt/front/components/pages/oauth/OAuthSetupRedirectPage";
import { RegionProvider } from "@dust-tt/front/lib/auth/RegionContext";

const router = createBrowserRouter(
  [
    // Setup: /w/:wId/oauth/:provider/setup
    {
      path: "/w/:wId/oauth/:provider/setup",
      element: <OAuthSetupRedirectPage />,
    },
    // Finalize: /oauth/:provider/finalize
    {
      path: "/oauth/:provider/finalize",
      element: <OAuthFinalizePage />,
    },
  ],
  {
    basename: import.meta.env.VITE_BASE_PATH ?? "",
  }
);

export default function OAuthApp() {
  return (
    <RegionProvider>
      <RootLayout>
        <RouterProvider router={router} />
      </RootLayout>
    </RegionProvider>
  );
}
