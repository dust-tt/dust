import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";

// The single client-side capability check for administrating Computer
// settings. Mirrors the API gates (`admin:security` + the Computer feature on
// the sandbox sub-apps); pod membership is deliberately not consulted. Change
// both together.
export function useComputerAdminAccess() {
  const { hasPermission } = useWorkspacePermissions();
  const { featureFlags } = useFeatureFlags();
  const isComputerEnabled = isComputerFeatureEnabled(featureFlags);
  const canAdministrateComputer =
    hasPermission("admin", "security") && isComputerEnabled;

  return {
    isComputerEnabled,
    canAdministrateComputer,
  };
}
