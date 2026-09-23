import type { PlanType } from "@app/types/plan";
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

/**
 * Shown to users whenever an audio attachment is refused. Kept next to the policy so the client
 * pre-flight and the server enforcement always explain the refusal the same way.
 */
export const AUDIO_TRANSCRIPTION_UNAVAILABLE_MESSAGE =
  "Audio attachments require voice transcription, which is unavailable in this workspace. " +
  "Upload a text transcript instead.";

/**
 * Whether audio files can be turned into a transcript for this workspace. Transcription runs
 * through a third-party service, so it is off for BYOK plans, and workspaces can disable it.
 *
 * Audio files are only useful once transcribed: without a transcript the upload has no processed
 * version to read, so callers must refuse the audio rather than store it.
 */
export function isAudioTranscriptionAvailable({
  owner,
  plan,
}: {
  owner: LightWorkspaceType;
  plan: PlanType;
}): boolean {
  return !plan.isByok && isVoiceTranscriptionAllowed(owner);
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
