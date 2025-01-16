import type {
  LightWorkspaceType,
  UserType,
  WhitelistableFeature,
} from "@dust-tt/types";
import { Err, isDevelopment, Ok } from "@dust-tt/types";

export function showDebugTools(
  owner: LightWorkspaceType,
  flags: WhitelistableFeature[]
) {
  return isDevelopment() || flags.includes("show_debug_tools");
}

export async function forceUserRole(
  user: UserType,
  owner: LightWorkspaceType,
  role: "user" | "builder" | "admin",
  featureFlags: WhitelistableFeature[]
) {
  // Ideally we should check if the user is dust super user but we don't have this information in the front-end
  if (!showDebugTools(owner, featureFlags)) {
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
