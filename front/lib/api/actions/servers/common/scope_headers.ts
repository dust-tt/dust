import { MCPError } from "@app/lib/actions/mcp_errors";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { getHeadersFromRequestedGroupIds } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { getHeaderFromUserEmail } from "@app/types/user";

// Scopes the system-key call to the caller: a user through the email exchange, a userless (API key)
// caller through its own groups and role.
export async function getScopeHeaders(
  auth: Authenticator
): Promise<Result<Record<string, string> | undefined, MCPError>> {
  const user = auth.user();
  if (user) {
    return new Ok(getHeaderFromUserEmail(user.email));
  }

  const owner = auth.getNonNullableWorkspace();
  const groupModelIds = await auth.listPrincipalGroupModelIds();
  const groupHeaders = getHeadersFromRequestedGroupIds(
    groupModelIds.map((id) =>
      GroupResource.modelIdToSId({ id, workspaceId: owner.id })
    ),
    auth.role()
  );
  if (!groupHeaders) {
    return new Err(
      new MCPError("No group to scope this call to.", { tracked: false })
    );
  }
  return new Ok(groupHeaders);
}
