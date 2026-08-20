import { podScopedPath } from "@app/types/file_system";

export const PROJECT_CONTEXT_FOLDER_ID = "project-context-folder";
export const PROJECT_CONTEXT_FOLDER_NAME = "Context";

/** Pod-wide agent instructions file, edited in Pod settings. */
export const POD_AGENTS_MD_FILENAME = "AGENTS.md";

/** Matches the character limit enforced in Pod settings UI. */
export const POD_AGENTS_MD_MAX_CHARACTER_COUNT = 8192;

export function getPodAgentsMdScopedPath(podId: string): string {
  return podScopedPath(podId, POD_AGENTS_MD_FILENAME);
}

/**
 * A hidden pod backs a Frame created in a standalone conversation: the Frame's app (its source,
 * published functions and databases) has to live in a pod, but the conversation is not in one, so
 * the platform creates one lazily and keeps it out of every pod listing. The marker is a name
 * prefix rather than a column, the same way `isDatabaseFileSystemPodName` drives a pod's
 * filesystem off its name.
 */
export const HIDDEN_POD_NAME_PREFIX = "[Frame runtime] ";

export function hiddenPodNameForConversation(conversationId: string): string {
  return `${HIDDEN_POD_NAME_PREFIX}${conversationId}`;
}

export function isHiddenPodName(name: string): boolean {
  return name.startsWith(HIDDEN_POD_NAME_PREFIX);
}
