import config from "@dust-tt/front/lib/api/config";
import { safeLazy } from "@dust-tt/sparkle";
import { useAppReadyContext } from "@spa/app/contexts/AppReadyContext";
import { AuthenticatedPage } from "@spa/app/layouts/AuthenticatedPage";
import { UnauthenticatedPage } from "@spa/app/layouts/UnauthenticatedPage";
import { withSuspense } from "@spa/app/routes/withSuspense";
import { Suspense } from "react";
import type { RouteObject } from "react-router-dom";

const JoinPage = safeLazy(() =>
  import("@dust-tt/front/components/pages/onboarding/JoinPage").then(
    (module) => ({ default: module.JoinPage })
  )
);
const LoginErrorPage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/LoginErrorPage"),
  "LoginErrorPage"
);
const InviteChoosePage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/InviteChoosePage"),
  "InviteChoosePage"
);
const NoWorkspacePage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/NoWorkspacePage"),
  "NoWorkspacePage"
);
const SsoEnforcedPage = withSuspense(
  () => import("@dust-tt/front/components/pages/SsoEnforcedPage"),
  "SsoEnforcedPage"
);

// The join page dismisses the startup loading screen itself, once its locale is active. Until then,
// the startup loading screen covers the page, so it needs no Suspense fallback of its own.
function JoinRoute() {
  const signalAppReady = useAppReadyContext();

  return (
    <Suspense fallback={null}>
      <JoinPage onReady={signalAppReady} />
    </Suspense>
  );
}

// Redirect /logout to the API server's WorkOS logout endpoint
function LogoutRedirect() {
  window.location.replace(`${config.getApiBaseUrl()}/api/workos/logout`);
  return null;
}

// Authenticated routes (outside workspace scope)
export const loginAuthenticatedRoutes: RouteObject[] = [
  {
    element: <AuthenticatedPage />,
    children: [
      { path: "/invite-choose", element: <InviteChoosePage /> },
      { path: "/no-workspace", element: <NoWorkspacePage /> },
      { path: "/sso-enforced", element: <SsoEnforcedPage /> },
    ],
  },
  { path: "/logout", element: <LogoutRedirect /> },
];

// Unauthenticated routes
export const loginUnauthenticatedRoutes: RouteObject[] = [
  { path: "/w/:wId/join", element: <JoinRoute /> },
  {
    element: <UnauthenticatedPage />,
    children: [{ path: "/login-error", element: <LoginErrorPage /> }],
  },
];
