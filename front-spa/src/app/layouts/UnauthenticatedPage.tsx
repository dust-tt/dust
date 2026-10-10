import { LocaleSync } from "@dust-tt/front/components/app/LocaleSync";
import { useAppReadyContext } from "@spa/app/contexts/AppReadyContext";
import { Outlet } from "react-router-dom";

// Layout for unauthenticated pages that are outside WorkspacePage.
// Signals app ready once the locale is active to dismiss the HTML loading screen.
export function UnauthenticatedPage() {
  const signalAppReady = useAppReadyContext();

  return (
    <>
      <LocaleSync locale={null} onReady={signalAppReady} />
      <Outlet />
    </>
  );
}
