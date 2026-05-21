import type { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

const ASSISTANT_CONVERSATION_ROUTE_FRAGMENT = "/assistant/conversations/";

/**
 * Domain reason why a workspace-scoped request should be denied. Transport
 * layers (Hono middleware, Next.js wrapper) map this to whatever response
 * shape they need — see [BACK18] in `front/CODING_RULES.md`.
 */
export type WorkspaceAccessError =
  | { type: "workspace_not_found" }
  | { type: "workspace_cannot_use_product" }
  | { type: "maintenance"; maintenance: string | number | true | object }
  | { type: "workspace_kill_switched" }
  | { type: "conversation_kill_switched" };

/**
 * Returns the conversation id if the request targets an assistant conversation
 * route, else null. Framework-agnostic — callers pass the request URL and the
 * `cId` route/query param value.
 */
export function getAssistantConversationIdFromUrl(
  url: string | undefined,
  cId: string | null | undefined
): string | null {
  if (!url?.includes(ASSISTANT_CONVERSATION_ROUTE_FRAGMENT)) {
    return null;
  }
  return cId ?? null;
}

interface ValidateWorkspaceAccessOptions {
  doesNotRequireCanUseProduct?: boolean;
  conversationId?: string | null;
}

/**
 * Framework-agnostic workspace guard. Checks owner/plan existence,
 * `canUseProduct`, maintenance mode, and the workspace-wide / conversation-
 * specific kill switches.
 *
 * Returns a `WorkspaceAccessError` describing the domain reason for denial,
 * or `null` if access is allowed. Callers map the error to a response.
 */
export function validateWorkspaceAccess(
  auth: Authenticator,
  opts: ValidateWorkspaceAccessOptions = {}
): WorkspaceAccessError | null {
  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan) {
    return { type: "workspace_not_found" };
  }

  if (!opts.doesNotRequireCanUseProduct && !plan.limits.canUseProduct) {
    return { type: "workspace_cannot_use_product" };
  }

  const maintenance = owner.metadata?.maintenance;
  if (maintenance) {
    return { type: "maintenance", maintenance };
  }

  if (
    WorkspaceResource.isWorkspaceKillSwitchedForAllAPIs(
      owner.metadata?.killSwitched
    )
  ) {
    return { type: "workspace_kill_switched" };
  }

  if (opts.conversationId) {
    const conversationKillSwitched =
      WorkspaceResource.isWorkspaceConversationKillSwitched(
        owner.metadata?.killSwitched,
        opts.conversationId
      );
    if (conversationKillSwitched) {
      return { type: "conversation_kill_switched" };
    }
  }

  return null;
}
