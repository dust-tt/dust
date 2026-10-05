import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";

// The single client-side capability check for administrating Computer
// settings. Mirrors the API gates (`ensureIsAdmin` + the Computer feature on
// the sandbox sub-apps); pod membership is deliberately not consulted. Change
// both together.
export function useComputerAdminAccess() {
  const { isAdmin } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const isComputerEnabled = isComputerFeatureEnabled(featureFlags);
  const canAdministrateComputer = isAdmin && isComputerEnabled;

  return {
    isAdmin,
    isComputerEnabled,
    canAdministrateComputer,
  };
}
