import { LocaleSync } from "@dust-tt/front/components/app/UserLocaleSync";
import { useNoWorkspaceUserLocale } from "@dust-tt/front/lib/swr/workspaces";
import { useAppReadyContext } from "@spa/app/contexts/AppReadyContext";
import { Outlet } from "react-router-dom";

// Layout for unauthenticated pages that are outside WorkspacePage.
/**
 * @cc [owner:sfriquet,label:product] startup-loader-waits-for-no-workspace-locale
 * The startup loading screen MUST stay visible until `LocaleSync` reports ready for the `userLocale`
 * of `useNoWorkspaceUserLocale`, which MUST NOT be mounted while that locale is loading.
 */
export function UnauthenticatedPage() {
  const signalAppReady = useAppReadyContext();
  const { userLocale, isUserLocaleLoading } = useNoWorkspaceUserLocale();

  return (
    <>
      {!isUserLocaleLoading && (
        <LocaleSync userLocale={userLocale} onReady={signalAppReady} />
      )}
      <Outlet />
    </>
  );
}
