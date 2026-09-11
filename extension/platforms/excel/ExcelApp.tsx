import { RootLayout } from "@app/components/app/RootLayout";
import { CellProvider } from "@app/lib/auth/CellContext";
import { ClientTypeProvider } from "@app/lib/context/clientType";
import { ExcelPlatformProvider } from "@extension/platforms/excel/context/ExcelPlatformProvider";
import { OfficeContextProvider } from "@extension/platforms/excel/context/OfficeProvider";
import { ExtensionFetcherProvider } from "@extension/shared/lib/ExtensionFetcherProvider";
import { ExtensionAuthProvider } from "@extension/ui/components/auth/AuthProvider";
import { routes } from "@extension/ui/pages/routes";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

// Create a router instance outside the component to avoid recreation.
// Use memory router to avoid interfering with the host page.
// The task pane always boots from the manifest's fixed `SourceLocation`
// (`/taskpane.html`), so there is no meaningful entry path to carry over.
const router = createMemoryRouter(routes, {
  initialEntries: ["/"],
  initialIndex: 0,
});

export const ExcelApp = () => {
  return (
    <ClientTypeProvider value="extension">
      <CellProvider>
        <OfficeContextProvider>
          <ExcelPlatformProvider>
            <ExtensionAuthProvider>
              <ExtensionFetcherProvider>
                <RootLayout>
                  <RouterProvider router={router} key="excel-router" />
                </RootLayout>
              </ExtensionFetcherProvider>
            </ExtensionAuthProvider>
          </ExcelPlatformProvider>
        </OfficeContextProvider>
      </CellProvider>
    </ClientTypeProvider>
  );
};
