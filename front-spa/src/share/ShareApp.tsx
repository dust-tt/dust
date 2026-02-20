import { SharedFilePage } from "@dust-tt/front/components/pages/share/SharedFilePage";
import { SharedFramePage } from "@dust-tt/front/components/pages/share/SharedFramePage";
import { RegionProvider } from "@dust-tt/front/lib/auth/RegionContext";
import { FetcherProvider } from "@dust-tt/front/lib/swr/FetcherContext";
import { fetcher, fetcherWithBody } from "@dust-tt/front/lib/swr/fetcher";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { SWRConfig } from "swr";

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
    <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
      <RegionProvider>
        <SWRConfig>
          <RouterProvider router={router} />
        </SWRConfig>
      </RegionProvider>
    </FetcherProvider>
  );
}
