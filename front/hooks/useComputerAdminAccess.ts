import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  isComputerFeatureEnabled,
  isFramesV2FunctionsEnabled,
} from "@app/types/shared/feature_flags";

// The single client-side capability check for administrating Computer
// settings. Mirrors the API gates (`ensureIsAdmin` + the Computer feature on
// the sandbox sub-apps); pod membership is deliberately not consulted. Change
// both together.
export function useComputerAdminAccess() {
  const { isAdmin } = useAuth();
  const { featureFlags } = useFeatureFlags();
  const isComputerEnabled = isComputerFeatureEnabled(featureFlags);
  const canAdministrateComputer = isAdmin && isComputerEnabled;
  // The multi-Pod scope selector and Pod network editing ride Frame functions
  // (frames_v2 + frames_v2_functions), on top of Computer admin access.
  const canAdministratePodNetwork =
    canAdministrateComputer && isFramesV2FunctionsEnabled(featureFlags);

  return {
    isAdmin,
    isComputerEnabled,
    canAdministrateComputer,
    canAdministratePodNetwork,
  };
}
