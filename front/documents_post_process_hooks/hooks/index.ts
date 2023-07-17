import { DEFAULT_DOCUMENTS_POST_PROCESS_HOOKS_DEBOUNCE_MS } from "@app/documents_post_process_hooks/hooks/consts";
import {
  documentTrackerSuggestChangesPostProcessHook,
  documentTrackerUpdateTrackedDocumentsPostProcessHook,
} from "@app/documents_post_process_hooks/hooks/document_tracker";
import { extractEventPostProcessHook } from "@app/documents_post_process_hooks/hooks/extract_event";
import { ConnectorProvider } from "@app/lib/connectors_api";

export const DOCUMENTS_POST_PROCESS_HOOK_TYPES = [
  "document_tracker_update_tracked_documents",
  "document_tracker_suggest_changes",
  "extract_event",
] as const;

export type DocumentsPostProcessHookType =
  (typeof DOCUMENTS_POST_PROCESS_HOOK_TYPES)[number];

export type DocumentsPostProcessHookParams = {
  dataSourceName: string;
  workspaceId: string;
  documentId: string;
  documentSourceUrl?: string; // @todo Daph remove optional when all jobs without it have been processed
  documentText: string;
  documentHash: string;
  dataSourceConnectorProvider: ConnectorProvider | null;
};

// asyc function that will run in a temporal workflow
// can be expensive to runs
export type DocumentsPostProcessHookFunction = (
  params: DocumentsPostProcessHookParams
) => Promise<void>;

// returns true if the post process hook should run for this document
// returns false if the post process hook should not run for this document
// needs to be relatively quick to run, will run in the same process as calling code
export type DocumentsPostProcessHookFilter = (
  params: DocumentsPostProcessHookParams
) => Promise<boolean>;

// How long should the hook sleep before running (debouncing)
// ran in the same process as calling code (no retries, needs to be quick to run)
export type DocumentsPostProcessHookDebounceMs = (
  params: DocumentsPostProcessHookParams
) => Promise<number>;

export type DocumentsPostProcessHook = {
  onUpsert: DocumentsPostProcessHookFunction;
  filter: DocumentsPostProcessHookFilter;
  type: DocumentsPostProcessHookType;
  getDebounceMs?: DocumentsPostProcessHookDebounceMs;
};

export const DOCUMENTS_POST_PROCESS_HOOKS = [
  documentTrackerUpdateTrackedDocumentsPostProcessHook,
  documentTrackerSuggestChangesPostProcessHook,
  extractEventPostProcessHook,
];

export const DOCUMENTS_POST_PROCESS_HOOK_BY_TYPE: Record<
  DocumentsPostProcessHookType,
  DocumentsPostProcessHook
> = DOCUMENTS_POST_PROCESS_HOOKS.reduce((acc, hook) => {
  acc[hook.type] = hook;
  return acc;
}, {} as Record<DocumentsPostProcessHookType, DocumentsPostProcessHook>);

export async function getDocumentsPostProcessHooksToRun(
  params: DocumentsPostProcessHookParams
): Promise<Array<{ type: DocumentsPostProcessHookType; debounceMs: number }>> {
  if (!process.env.DOCUMENTS_POST_PROCESS_HOOKS_ENABLED) {
    return [];
  }
  // TODO: parallel
  const hooksToRun: {
    type: DocumentsPostProcessHookType;
    debounceMs: number;
  }[] = [];
  for (const hook of DOCUMENTS_POST_PROCESS_HOOKS) {
    if (await hook.filter(params)) {
      const debounceMs = hook.getDebounceMs
        ? await hook.getDebounceMs(params)
        : DEFAULT_DOCUMENTS_POST_PROCESS_HOOKS_DEBOUNCE_MS;
      hooksToRun.push({ type: hook.type, debounceMs });
    }
  }

  return hooksToRun;
}
