import type { LightWorkspaceType, UserType } from "@dust-tt/types";
import { Err, isDevelopment, Ok } from "@dust-tt/types";

export const PRODUCTION_DUST_WORKSPACE_ID = "0ec9852c2f";
const PRODUCTION_DUST_APPS_WORKSPACE_ID = "78bda07b39";

export function isDevelopmentOrDustWorkspace(owner: LightWorkspaceType) {
  return (
    isDevelopment() ||
    owner.sId === PRODUCTION_DUST_WORKSPACE_ID ||
    owner.sId === PRODUCTION_DUST_APPS_WORKSPACE_ID
  );
}

export async function forceUserRole(
  user: UserType,
  owner: LightWorkspaceType,
  role: "user" | "builder" | "admin"
) {
  // Ideally we should check if the user is dust super user but we don't have this information in the front-end
  if (!isDevelopment()) {
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
