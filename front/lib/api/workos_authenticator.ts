import {
  parseWorkOSJwtPayload,
  type WorkOSJwtPayload,
} from "@app/lib/api/workos";
import { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";

export interface WorkOSWorkspaceAuthenticator extends Authenticator {
  workspace(): WorkspaceType;
  user(): UserResource;
}

export function isWorkOSWorkspaceAuthenticator(
  value: unknown
): value is WorkOSWorkspaceAuthenticator {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    "user" in value &&
    typeof value.user === "function" &&
    "workspace" in value &&
    typeof value.workspace === "function" &&
    "authMethod" in value &&
    typeof value.authMethod === "function"
  );
}

export type WorkOSWorkspaceAuthenticatorError =
  | "organization_missing"
  | "workspace_not_found"
  | "user_not_found"
  | "not_a_member"
  | "invalid_token_payload";

function getOrganizationId(payload: WorkOSJwtPayload): string | null {
  const orgId = payload.org_id;
  return typeof orgId === "string" && orgId.trim() ? orgId.trim() : null;
}

export async function getAuthenticatorFromWorkOSClaims(
  payload: unknown
): Promise<
  Result<
    {
      authenticator: WorkOSWorkspaceAuthenticator;
      workOSJWTPayload: WorkOSJwtPayload;
    },
    WorkOSWorkspaceAuthenticatorError
  >
> {
  const workOSTokenResult = parseWorkOSJwtPayload(payload);
  if (workOSTokenResult.isErr()) {
    return new Err("invalid_token_payload");
  }
  const workOSToken = workOSTokenResult.value;

  const organizationId = getOrganizationId(workOSToken);
  if (!organizationId) {
    return new Err("organization_missing");
  }

  const workspace =
    await WorkspaceResource.fetchByWorkOSOrganizationId(organizationId);
  if (!workspace) {
    return new Err("workspace_not_found");
  }

  const authResult = await Authenticator.fromWorkOSToken({
    token: workOSToken,
    wId: workspace.sId,
  });

  if (authResult.isErr()) {
    switch (authResult.error.code) {
      case "user_not_found":
        return new Err("user_not_found");
      case "workspace_not_found":
        return new Err("workspace_not_found");
      default:
        return new Err("not_a_member");
    }
  }

  const auth = authResult.value;
  if (!auth.workspace() || !auth.user() || auth.role() === "none") {
    return new Err("not_a_member");
  }

  return new Ok({
    authenticator: auth as WorkOSWorkspaceAuthenticator,
    workOSJWTPayload: workOSToken,
  });
}
