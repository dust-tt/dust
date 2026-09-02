import type { LightWorkspaceType } from "@app/types/user";

export function areOpenPodsAllowed(owner: LightWorkspaceType): boolean {
  return owner.metadata?.allowOpenProjects !== false;
}

export function isManualPodFilesManagementAllowed(
  owner: LightWorkspaceType
): boolean {
  return owner.metadata?.allowManualProjectKnowledgeManagement !== false;
}

export function isVoiceTranscriptionAllowed(
  owner: LightWorkspaceType
): boolean {
  return owner.metadata?.allowVoiceTranscription !== false;
}

export function areEmailAgentsAllowed(owner: LightWorkspaceType): boolean {
  return owner.metadata?.allowEmailAgents === true;
}

export function arePrivateConversationUrlsDefault(
  owner: LightWorkspaceType
): boolean {
  return owner.metadata?.privateConversationUrlsByDefault === true;
}

export function areExtensionMcpToolsAllowed(
  owner: LightWorkspaceType
): boolean {
  return !owner.metadata?.disableExtensionMcpTools;
}

export function isSlackPersonalFooterRemovalAllowed(
  owner: LightWorkspaceType
): boolean {
  return owner.metadata?.slackPersonalAllowFooterRemoval === true;
}

export function areAuditLogsEnabled(owner: LightWorkspaceType): boolean {
  return owner.metadata?.disableAuditLogs !== true;
}
