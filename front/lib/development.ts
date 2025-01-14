import type { LightWorkspaceType, UserType } from "@dust-tt/types";
import { Err, isDevelopment, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";

function isADustProdWorkspace(owner: LightWorkspaceType) {
  return (
    owner.sId === config.getDustWorkspaceId() ||
    owner.sId === config.getDustAppsWorkspaceId()
  );
}

export function showDebugTools(owner: LightWorkspaceType) {
  return isDevelopment() || isADustProdWorkspace(owner);
}

export async function forceUserRole(
  user: UserType,
  owner: LightWorkspaceType,
  role: "user" | "builder" | "admin"
) {
  // Ideally we should check if the user is dust super user but we don't have this information in the front-end
  if (!showDebugTools(owner)) {
    return new Err("Not allowed");
  }

  if (owner.role === role) {
    return new Err(`Already in the role ${role}`);
  }

  const response = await fetch(`/api/w/${owner.sId}/members/${user.sId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role,
      force: "true",
    }),
  });

  if (response.ok) {
    return new Ok(`Role updated to ` + role);
  } else {
    return new Err("Error updating role");
  }
}
