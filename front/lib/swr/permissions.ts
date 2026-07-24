import { useAuth } from "@app/lib/auth/AuthContext";
import type {
  ConcreteResourceType,
  GrantVerb,
} from "@app/types/group_permissions";
import { useCallback } from "react";

export function useWorkspacePermissions() {
  const { workspacePermissions } = useAuth();

  const hasPermission = useCallback(
    (verb: GrantVerb, resourceType: ConcreteResourceType): boolean =>
      workspacePermissions?.[resourceType]?.includes(verb) ?? false,
    [workspacePermissions]
  );

  return { workspacePermissions, hasPermission };
}
