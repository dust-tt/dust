import {
  LocaleSync,
  UserLocaleSync,
} from "@dust-tt/front/components/app/UserLocaleSync";
import { ProfileOnboardingDialog } from "@dust-tt/front/components/onboarding/ProfileOnboardingDialog";
import { AppAuthContextLayout } from "@dust-tt/front/components/sparkle/AppAuthContextLayout";
import { computeIsMetronomeCheckout } from "@dust-tt/front/lib/client/subscription";
import {
  useAuthContext,
  useNoWorkspaceUserLocale,
} from "@dust-tt/front/lib/swr/workspaces";
import { isAPIErrorResponse } from "@dust-tt/front/types/error";
import { AuthErrorPage } from "@spa/app/components/AuthErrorPage";
import { useAppReadyContext } from "@spa/app/contexts/AppReadyContext";
import { useRequiredPathParam } from "@spa/lib/platform";
import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation, useMatches } from "react-router-dom";

function useIsRequireCanUseProduct(): boolean {
  const matches = useMatches();
  return matches.every(
    (match) =>
      (match.handle as { requireCanUseProduct?: boolean } | undefined)
        ?.requireCanUseProduct !== false
  );
}

interface WorkspacePageProps {
  children?: ReactNode;
}

/**
 * @cc [owner:sfriquet,label:product] startup-loader-waits-for-user-locale
 * When the auth context loads, the startup loading screen MUST stay visible until `UserLocaleSync`
 * reports ready, so the workspace is never shown in a locale it is about to switch away from.
 */
/**
 * @cc [owner:sfriquet,label:product] auth-error-in-no-workspace-locale
 * When the auth context fails, the error page MUST render under `LocaleSync` with the `userLocale`
 * of `useNoWorkspaceUserLocale`, nothing MUST render while that locale is loading, and the startup
 * loading screen MUST stay visible until `LocaleSync` reports ready.
 */
export function WorkspacePage({ children }: WorkspacePageProps) {
  const wId = useRequiredPathParam("wId");
  const isRequireCanUseProduct = useIsRequireCanUseProduct();

  const { authContext, isAuthenticated, authContextError } = useAuthContext({
    workspaceId: wId,
  });

  const { userLocale, hasLocalisation, isUserLocaleLoading } =
    useNoWorkspaceUserLocale({ disabled: !authContextError });

  const signalAppReady = useAppReadyContext();
  const location = useLocation();

  if (
    isAPIErrorResponse(authContextError) &&
    authContextError.error.type === "sso_enforced"
  ) {
    const params = new URLSearchParams({
      workspaceId: wId,
      returnTo: location.pathname + location.search,
    });
    return <Navigate to={`/sso-enforced?${params.toString()}`} replace />;
  }

  if (authContextError) {
    if (isUserLocaleLoading) {
      return null;
    }

    return (
      <>
        <LocaleSync userLocale={userLocale} onReady={signalAppReady} />
        <AuthErrorPage
          error={authContextError}
          hasLocalisation={hasLocalisation}
        />
      </>
    );
  }

  // Return null while loading - the loading screen handles the loading state
  if (!isAuthenticated || !authContext) {
    return null;
  }

  const canUseProduct = authContext.subscription.plan.limits.canUseProduct;

  // Not using `useIsMetronomeCheckout` here: the hook reads feature flags from
  // the auth context provider, which this component is about to mount.
  const isMetronomeCheckout = computeIsMetronomeCheckout({
    featureFlags: authContext.featureFlags,
  });

  // Paywall enforcement: redirect when canUseProduct is false
  // and the current route requires canUseProduct (via route handle).
  // Mirrors the Next.js session.ts logic: redirect to the trial / plan
  // selection page if eligible, /subscribe otherwise.
  if (!canUseProduct && isRequireCanUseProduct) {
    const target = authContext.isEligibleForTrial
      ? isMetronomeCheckout
        ? "select-subscription"
        : "trial"
      : "subscribe";
    return <Navigate to={`/w/${wId}/${target}`} replace />;
  }

  return (
    <AppAuthContextLayout authContext={authContext}>
      <UserLocaleSync onReady={signalAppReady} />
      {isMetronomeCheckout && isRequireCanUseProduct && (
        <ProfileOnboardingDialog />
      )}
      {children ?? <Outlet />}
    </AppAuthContextLayout>
  );
}
