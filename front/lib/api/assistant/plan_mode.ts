import { PLAN_MODE_SKELETON } from "@app/lib/api/actions/servers/plan_mode/metadata";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { SCOPED_PREFIX_CONVERSATION } from "@app/lib/api/file_system/types";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock } from "@app/lib/lock";
import { ConversationPlanResource } from "@app/lib/resources/conversation_plan_resource";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { Err, Ok, type Result } from "@app/types/shared/result";

// The plan markdown lives at a per-plan path derived from the conversation and the plan sId, so a
// new plan created after a close never overwrites a previous plan's content.
export function planScopedPath(
  conversation: ConversationWithoutContentType,
  plan: ConversationPlanResource
): string {
  return `${SCOPED_PREFIX_CONVERSATION}${conversation.sId}/${TOOL_OUTPUTS_FOLDER_NAME}/plans/${plan.sId}/plan.md`;
}

// "none": no approval recorded. "pending": a blocked approval action is awaiting the user.
// "approved": the current version is approved. "stale": the plan was edited after approval.
export type PlanApprovalState = "none" | "pending" | "approved" | "stale";

export type GetConversationPlanModeResponseBody = {
  plan: { version: number } | null;
  content: string | null;
  approvalState: PlanApprovalState;
};

// Serializes all plan-mode operations for a conversation so create/edit/approve/close can't race.
export async function withPlanModeLock<T>(
  conversationId: string,
  fn: () => Promise<T>
): Promise<T> {
  return executeWithLock(`plan_mode:${conversationId}`, fn);
}

export async function findActivePlan(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<ConversationPlanResource | null> {
  return ConversationPlanResource.fetchActiveForConversation(
    auth,
    conversation
  );
}

// Ok(null) when the file is missing; Err on a real read failure, so callers don't treat a read
// failure as blank content.
export async function getPlanContent(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  plan: ConversationPlanResource
): Promise<Result<string | null, Error>> {
  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(new Error(fsResult.error.message));
  }

  const bufferResult = await fsResult.value.readBuffer(
    planScopedPath(conversation, plan)
  );
  if (bufferResult.isErr()) {
    return new Err(new Error(bufferResult.error.message));
  }

  return new Ok(
    bufferResult.value ? bufferResult.value.toString("utf8") : null
  );
}

export async function writePlanContent(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  plan: ConversationPlanResource,
  content: string
): Promise<Result<void, Error>> {
  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(new Error(fsResult.error.message));
  }

  const writeResult = await fsResult.value.write(
    planScopedPath(conversation, plan),
    content,
    "text/markdown"
  );
  if (writeResult.isErr()) {
    return new Err(new Error(writeResult.error.message));
  }

  return new Ok(undefined);
}

// Creates the state row then seeds plan.md. Rolls the row back if the write fails, so there is
// never an active plan with no readable content.
export async function createPlan(
  auth: Authenticator,
  { conversation }: { conversation: ConversationWithoutContentType }
): Promise<Result<ConversationPlanResource, Error>> {
  const plan = await ConversationPlanResource.makeNew(auth, { conversation });

  const writeResult = await writePlanContent(
    auth,
    conversation,
    plan,
    PLAN_MODE_SKELETON
  );
  if (writeResult.isErr()) {
    await plan.delete(auth);
    return writeResult;
  }

  return new Ok(plan);
}

// No-ops (returns null) if the plan is already closed, covering the close_plan-during-approval race.
export async function markPlanApproved(
  plan: ConversationPlanResource,
  approvedByUserId: string
): Promise<{ approvedAt: Date; approvedVersion: number } | null> {
  if (plan.isClosed) {
    return null;
  }

  await plan.recordApproval({ approvedByUserId });

  return {
    approvedAt: plan.approvedAt ?? new Date(),
    approvedVersion: plan.approvedVersion ?? plan.version,
  };
}

export async function markPlanClosed(
  plan: ConversationPlanResource
): Promise<void> {
  if (plan.isClosed) {
    return;
  }
  await plan.markClosed();
}

// A pending approval (requested at `requestedAtMs`) is stale once the plan is edited (updatedAt
// moves past it) or replaced by a newer plan (createdAt past it). Stops a stale card from
// approving the wrong plan/version. Timestamps share the DB clock.
export function isApprovalRequestStale(
  plan: ConversationPlanResource,
  { requestedAtMs }: { requestedAtMs: number }
): boolean {
  return (
    plan.createdAt.getTime() > requestedAtMs ||
    plan.updatedAt.getTime() > requestedAtMs
  );
}

export function derivePlanApprovalState(
  plan: ConversationPlanResource,
  { hasPendingApproval }: { hasPendingApproval: boolean }
): PlanApprovalState {
  if (hasPendingApproval) {
    return "pending";
  }
  if (plan.approvedVersion == null) {
    return "none";
  }
  if (plan.version > plan.approvedVersion) {
    return "stale";
  }
  return "approved";
}
