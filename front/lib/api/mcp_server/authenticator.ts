import type { McpServerAuthUser } from "@app/lib/api/mcp_server/auth";
import {
  type WorkOSJwtPayload,
  WorkOSJwtPayloadSchema,
} from "@app/lib/api/workos";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isLeft } from "fp-ts/lib/Either";

export type McpAuthenticatorError =
  | "organization_missing"
  | "workspace_not_found"
  | "user_not_found"
  | "not_a_member"
  | "invalid_token_payload";

function parseWorkOSJwtPayload(
  payload: McpServerAuthUser
): WorkOSJwtPayload | null {
  const validation = WorkOSJwtPayloadSchema.decode(payload);
  if (isLeft(validation)) {
    return null;
  }
  return validation.right;
}

function getOrganizationId(payload: WorkOSJwtPayload): string | null {
  const orgId = payload.org_id;
  return typeof orgId === "string" && orgId.trim() ? orgId.trim() : null;
}

export async function getAuthenticatorFromWorkOSClaims(
  payload: McpServerAuthUser
): Promise<Result<Authenticator, McpAuthenticatorError>> {
  const workOSToken = parseWorkOSJwtPayload(payload);
  if (!workOSToken) {
    return new Err("invalid_token_payload");
  }

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
  if (!auth.user() || auth.role() === "none") {
    return new Err("not_a_member");
  }

  return new Ok(auth);
}
