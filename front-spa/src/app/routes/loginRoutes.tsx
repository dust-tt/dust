import config from "@dust-tt/front/lib/api/config";
import { AuthenticatedPage } from "@spa/app/layouts/AuthenticatedPage";
import { UnauthenticatedPage } from "@spa/app/layouts/UnauthenticatedPage";
import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";

const JoinPage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/JoinPage"),
  "JoinPage"
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
  {
    element: <UnauthenticatedPage />,
    children: [
      { path: "/w/:wId/join", element: <JoinPage /> },
      { path: "/login-error", element: <LoginErrorPage /> },
    ],
  },
];
