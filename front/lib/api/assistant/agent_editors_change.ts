import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { AgentResource } from "@app/lib/resources/agent_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type AgentEditorsChangeError = DustError<
  "unauthorized" | "invalid_request_error" | "user_not_found"
>;

export interface AgentEditorsChange {
  usersToAdd: UserResource[];
  usersToRemove: UserResource[];
  // The complete editor set once the change is applied.
  nextEditors: UserResource[];
}

/**
 * @cc [owner:fabiencelier,label:security;product] agent-editors-change-same-rules-as-route
 * A change MUST pass only when `PATCH /assistant/agent_configurations/:aId/editors` would accept
 * it from the same caller: `auth.can("admin", agent)`, an active non-global agent, every user
 * found, no added user already an editor and every removed user an editor. On top of the route:
 * added editors MUST be active members of the workspace, a user in both lists fails as the change
 * would be ambiguous, and a change leaving the agent with zero editors fails.
 */
/**
 * @cc [owner:fabiencelier,label:security] agent-editors-change-validated-against-live-state
 * Users, memberships and the current editor set are read at call time; permissions and status come
 * from the `auth` and `agent` passed in. Callers MUST pass a freshly fetched agent and re-run this
 * before applying a previously recorded change; nothing validated earlier may be trusted.
 */
export async function validateAgentEditorsChange(
  auth: Authenticator,
  agent: AgentResource,
  {
    addUserIds,
    removeUserIds,
  }: { addUserIds: string[]; removeUserIds: string[] }
): Promise<Result<AgentEditorsChange, AgentEditorsChangeError>> {
  if (!auth.can("admin", agent)) {
    return new Err(
      new DustError(
        "unauthorized",
        "Only editors of this agent or workspace admins can change its editors."
      )
    );
  }

  if (agent.scope === "global" || agent.status !== "active") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Only active custom agents can have their editors changed."
      )
    );
  }

  if (addUserIds.length === 0 && removeUserIds.length === 0) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Provide at least one user to add or remove as editor."
      )
    );
  }

  const removeUserIdSet = new Set(removeUserIds);
  const inBothLists = [
    ...new Set(addUserIds.filter((id) => removeUserIdSet.has(id))),
  ];
  if (inBothLists.length > 0) {
    return new Err(
      new DustError(
        "invalid_request_error",
        `Some users are both added and removed: ${inBothLists.join(", ")}.`
      )
    );
  }

  const userIds = [...new Set([...addUserIds, ...removeUserIds])];
  const users = await UserResource.fetchByIds(userIds);
  const foundUserIds = new Set(users.map((u) => u.sId));
  const missingIds = userIds.filter((id) => !foundUserIds.has(id));
  if (missingIds.length > 0) {
    return new Err(
      new DustError(
        "user_not_found",
        `Some users were not found: ${missingIds.join(", ")}.`
      )
    );
  }
  const addUserIdSet = new Set(addUserIds);
  const usersToAdd = users.filter((u) => addUserIdSet.has(u.sId));
  const usersToRemove = users.filter((u) => removeUserIdSet.has(u.sId));

  // Only added editors must be active members; removing a departed member is a valid cleanup.
  const { memberships } = await MembershipResource.getActiveMemberships({
    users: usersToAdd,
    workspace: auth.getNonNullableWorkspace(),
  });
  const memberUserModelIds = new Set(memberships.map((m) => m.userId));
  const nonMembers = usersToAdd.filter((u) => !memberUserModelIds.has(u.id));
  if (nonMembers.length > 0) {
    return new Err(
      new DustError(
        "invalid_request_error",
        `Some users are not active members of this workspace: ${nonMembers
          .map((u) => u.sId)
          .join(", ")}.`
      )
    );
  }

  const currentEditors = (await agent.listEditors(auth)) ?? [];
  const currentEditorModelIds = new Set(currentEditors.map((u) => u.id));

  const alreadyEditors = usersToAdd.filter((u) =>
    currentEditorModelIds.has(u.id)
  );
  if (alreadyEditors.length > 0) {
    return new Err(
      new DustError(
        "invalid_request_error",
        `Some users are already editors of the agent: ${alreadyEditors
          .map((u) => u.sId)
          .join(", ")}.`
      )
    );
  }

  const notEditors = usersToRemove.filter(
    (u) => !currentEditorModelIds.has(u.id)
  );
  if (notEditors.length > 0) {
    return new Err(
      new DustError(
        "invalid_request_error",
        `Some users are not editors of the agent: ${notEditors
          .map((u) => u.sId)
          .join(", ")}.`
      )
    );
  }

  const removedUserModelIds = new Set(usersToRemove.map((u) => u.id));
  const nextEditors = [
    ...currentEditors.filter((u) => !removedUserModelIds.has(u.id)),
    ...usersToAdd,
  ];
  if (nextEditors.length === 0) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "This change would leave the agent without any editor. Keep or add at least one editor."
      )
    );
  }

  return new Ok({ usersToAdd, usersToRemove, nextEditors });
}
