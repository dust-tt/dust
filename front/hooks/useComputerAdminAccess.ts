import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";

// The single client-side capability check for administrating Computer
// settings, workspace or Pod scope: workspace admin + the workspace-level
// Computer flag. Mirrors the API gates (`ensureIsAdmin` +
// `withComputerFeature` on both sandbox sub-apps); pod membership is
// deliberately not consulted. Change both together.
export function useComputerAdminAccess() {
  const { isAdmin } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const isComputerEnabled = isComputerFeatureEnabled(featureFlags);
  const canAdministrateComputer = isAdmin && isComputerEnabled;
  const hasSandboxFunctions = featureFlags.includes("sandbox_functions");
  // The multi-Pod scope selector and Pod editing on the Computer admin page
  // ride the Pod Functions flag, on top of Computer admin access.
  const canAdministratePods = canAdministrateComputer && hasSandboxFunctions;
  // A Pod's Computer settings are readable by anyone who can open the Pod
  // settings page once the feature is on; editing stays workspace-admin only
  // (canAdministratePods). Mirrors the pod sandbox API: GET is
  // `requireCanReadOrAdministrate`, writes are `ensureIsAdmin`.
  const canViewPodComputerSettings = isComputerEnabled && hasSandboxFunctions;

  return {
    isAdmin,
    isComputerEnabled,
    canAdministrateComputer,
    canAdministratePods,
    canViewPodComputerSettings,
  };
}
