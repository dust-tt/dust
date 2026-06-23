import { podScopedPath } from "@app/lib/api/file_system/types";

export const PROJECT_CONTEXT_FOLDER_ID = "project-context-folder";
export const PROJECT_CONTEXT_FOLDER_NAME = "Context";

/** Pod-wide agent instructions file, edited in Pod settings. */
export const POD_AGENTS_MD_FILENAME = "AGENTS.md";

/** Matches the character limit enforced in Pod settings UI. */
export const POD_AGENTS_MD_MAX_CHARACTER_COUNT = 4096;

export function getPodAgentsMdScopedPath(podId: string): string {
  return podScopedPath(podId, POD_AGENTS_MD_FILENAME);
}
