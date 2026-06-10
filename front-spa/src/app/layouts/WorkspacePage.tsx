import { ProfileOnboardingDialog } from "@dust-tt/front/components/onboarding/ProfileOnboardingDialog";
import { AppAuthContextLayout } from "@dust-tt/front/components/sparkle/AppAuthContextLayout";
import { computeIsMetronomeCheckout } from "@dust-tt/front/lib/client/subscription";
import { useKillSwitches } from "@dust-tt/front/lib/swr/kill";
import { useAuthContext } from "@dust-tt/front/lib/swr/workspaces";
import { AuthErrorPage } from "@spa/app/components/AuthErrorPage";
import { useAppReadyContext } from "@spa/app/contexts/AppReadyContext";
import { useRequiredPathParam } from "@spa/lib/platform";
import { type ReactNode, useEffect } from "react";
import { Navigate, Outlet, useMatches } from "react-router-dom";

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

export function WorkspacePage({ children }: WorkspacePageProps) {
  const wId = useRequiredPathParam("wId");
  const isRequireCanUseProduct = useIsRequireCanUseProduct();

  const { authContext, isAuthenticated, authContextError } = useAuthContext({
    workspaceId: wId,
  });
  const { killSwitches } = useKillSwitches();

  const signalAppReady = useAppReadyContext();

  // Signal that the app is ready when auth is loaded or on error
  // This will dismiss the loading screen
  useEffect(() => {
    if ((isAuthenticated && authContext) || authContextError) {
      signalAppReady();
    }
  }, [isAuthenticated, authContext, authContextError, signalAppReady]);

  if (authContextError) {
    return <AuthErrorPage error={authContextError} />;
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
    killSwitches,
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
      {isMetronomeCheckout && isRequireCanUseProduct && (
        <ProfileOnboardingDialog />
      )}
      {children ?? <Outlet />}
    </AppAuthContextLayout>
  );
}
