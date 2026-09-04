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
  const hasFramesV2 = featureFlags.includes("frames_v2");
  // The multi-Pod scope selector and Pod network editing ride the Frames v2
  // flag (frames_v2), on top of Computer admin access.
  const canAdministratePodNetwork = canAdministrateComputer && hasFramesV2;

  return {
    isAdmin,
    isComputerEnabled,
    canAdministrateComputer,
    canAdministratePodNetwork,
  };
}
