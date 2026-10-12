import { useWorkspacePermissions } from "@app/lib/swr/permissions";

// The single client-side capability check for administrating Computer
// settings. Mirrors the API gate (`admin:security` on the sandbox sub-apps);
// pod membership is deliberately not consulted. Change both together.
export function useComputerAdminAccess() {
  const { hasPermission } = useWorkspacePermissions();
  const canAdministrateComputer = hasPermission("admin", "security");

  return {
    canAdministrateComputer,
  };
}
