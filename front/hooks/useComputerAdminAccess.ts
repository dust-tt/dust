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
  // Pod settings and the multi-pod comparison are sandbox_functions-gated on
  // top of Computer (matching the pod sandbox routes). Workspace-level
  // settings need only canAdministrateComputer.
  const hasSandboxFunctions = featureFlags.includes("sandbox_functions");

  return {
    isAdmin,
    isComputerEnabled,
    hasSandboxFunctions,
    canAdministrateComputer: isAdmin && isComputerEnabled,
  };
}
