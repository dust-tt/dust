import { PLAN_MODE_SKELETON } from "@app/lib/api/actions/servers/plan_mode/metadata";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { PlanModeApproval } from "@app/types/files";

// Find the currently active plan file for a conversation. "Active" = attached to the conversation
// with `isPlanFile: true` and NOT `isPlanClosed: true`. Returns null if no active plan exists.
//
// Plan counts per conversation are small (1-2), so the TS-side filter is cheap. If plan mode
// sees heavy use, a partial expression index on
// `(workspaceId, useCase, (useCaseMetadata ->> 'conversationId'))` would help.
export async function findActivePlanFile(
  auth: Authenticator,
  conversationId: string
): Promise<FileResource | null> {
  const files = await FileResource.listPlanFilesForConversation(auth, {
    conversationId,
  });
  return files.find((f) => !f.useCaseMetadata?.isPlanClosed) ?? null;
}

// Create a fresh plan.md file attached to the conversation, seeded with the skeleton. Does not
// check for existing active plans — callers should guard against that.
export async function createPlanFile(
  auth: Authenticator,
  {
    conversationId,
    agentConfigurationId,
  }: {
    conversationId: string;
    agentConfigurationId?: string;
  }
): Promise<FileResource> {
  const workspace = auth.getNonNullableWorkspace();

  const file = await FileResource.makeNew({
    workspaceId: workspace.id,
    fileName: "plan.md",
    contentType: "text/markdown",
    fileSize: 0,
    useCase: "conversation",
    useCaseMetadata: {
      conversationId,
      isPlanFile: true,
      planModeLastApproval: null,
      lastEditedByAgentConfigurationId: agentConfigurationId,
    },
  });

  await file.uploadContent(auth, PLAN_MODE_SKELETON);

  return file;
}

// Stamp the plan file with approval metadata. Called by the request_plan_approval tool handler
// after user approval. No-ops (returns null) if the plan is already closed — this covers the race
// where close_plan runs between approval request and approval decision.
export async function markPlanApproved(
  auth: Authenticator,
  planFile: FileResource,
  approvedByUserId: string
): Promise<PlanModeApproval | null> {
  if (planFile.useCaseMetadata?.isPlanClosed) {
    return null;
  }

  const approval: PlanModeApproval = {
    approvedAt: new Date().toISOString(),
    approvedByUserId,
    fileVersion: planFile.version,
  };

  await planFile.setUseCaseMetadata(auth, {
    ...planFile.useCaseMetadata,
    planModeLastApproval: approval,
  });

  return approval;
}

// Retire the plan. Sets `isPlanClosed: true`. The file stays in DB for audit; the skill and UI
// stop referencing it. Any pending approval on this plan should be resolved separately by the
// caller (close_plan handler).
export async function markPlanClosed(
  auth: Authenticator,
  planFile: FileResource
): Promise<void> {
  if (planFile.useCaseMetadata?.isPlanClosed) {
    return;
  }
  await planFile.setUseCaseMetadata(auth, {
    ...planFile.useCaseMetadata,
    isPlanClosed: true,
  });
}

export function isPlanApproved(file: FileResource): boolean {
  return file.useCaseMetadata?.planModeLastApproval != null;
}
