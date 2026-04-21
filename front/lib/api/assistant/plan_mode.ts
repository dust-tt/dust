import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import type {
  ConversationMetadata,
  ConversationPlanModeMetadata,
} from "@app/types/assistant/conversation";
import { getConversationPlanMode } from "@app/types/assistant/conversation";
import type { PlanModeApproval } from "@app/types/files";

// Initial content written to plan.md on enter_plan_mode. Agents are told (via the skill prompt)
// to replace the _Fill in_ placeholders as their first planning action.
export const PLAN_MODE_SKELETON = `# Untitled plan

## Context
_Fill in: why we're doing this, what the user asked for._

## Tasks
- [ ] _Fill in the first task_
`;

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

// Fetch the plan file using the sId stored in conversation.metadata.planMode.planFileId.
// Returns null when the conversation is not in plan mode (no metadata) or the file has been
// deleted.
export async function getPlanFileFromMetadata(
  auth: Authenticator,
  metadata: ConversationMetadata | null | undefined
): Promise<FileResource | null> {
  const planMode = getConversationPlanMode(metadata);
  if (!planMode) {
    return null;
  }
  return FileResource.fetchById(auth, planMode.planFileId);
}

// Set conversation.metadata.planMode, or remove it when planMode is null.
export async function setConversationPlanMode(
  auth: Authenticator,
  conversationId: string,
  planMode: ConversationPlanModeMetadata | null
): Promise<void> {
  await ConversationResource.updatePlanMode(auth, conversationId, planMode);
}

// Stamp the plan file's useCaseMetadata with approval info.
export async function markPlanApproved(
  auth: Authenticator,
  planFile: FileResource,
  approvedByUserId: string
): Promise<PlanModeApproval> {
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

export function isPlanApproved(file: FileResource): boolean {
  return file.useCaseMetadata?.planModeLastApproval != null;
}
