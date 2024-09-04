import type { ConnectorProvider, UpsertContext } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import {
  documentTrackerSuggestChangesPostProcessHook,
  documentTrackerUpdateTrackedDocumentsPostProcessHook,
} from "@app/lib/documents_post_process_hooks/hooks/document_tracker";
import { DEFAULT_DOCUMENTS_POST_PROCESS_HOOKS_DEBOUNCE_MS } from "@app/lib/documents_post_process_hooks/hooks/types";

export const DOCUMENTS_POST_PROCESS_HOOK_TYPES = [
  "document_tracker_update_tracked_documents",
  "document_tracker_suggest_changes",
] as const;

export type DocumentsPostProcessHookType =
  (typeof DOCUMENTS_POST_PROCESS_HOOK_TYPES)[number];

export type DocumentsPostProcessHookVerb = "upsert" | "delete";

export type DocumentsPostProcessHookOnUpsertParams = {
  auth: Authenticator;
  dataSourceId: string;
  documentId: string;
  documentSourceUrl?: string;
  documentText: string;
  documentHash: string;
  dataSourceConnectorProvider: ConnectorProvider | null;
  upsertContext?: UpsertContext;
};

export type DocumentsPostProcessHookOnDeleteParams = {
  auth: Authenticator;
  dataSourceId: string;
  documentId: string;
  dataSourceConnectorProvider: ConnectorProvider | null;
};

export type DocumentsPostProcessHookFilterParams =
  | ({ verb: "upsert" } & DocumentsPostProcessHookOnUpsertParams)
  | ({ verb: "delete" } & DocumentsPostProcessHookOnDeleteParams);

export type DocumentsPostProcessHookDebounceMsParams = {
  verb: "upsert";
} & DocumentsPostProcessHookOnUpsertParams;

// asyc function that will run in a temporal workflow
// can be expensive to run
// will be retried if it fails (indefinitely)
export type DocumentsPostProcessHookOnUpsert = (
  params: DocumentsPostProcessHookOnUpsertParams
) => Promise<void>;

// asyc function that will run in a temporal workflow
// can be expensive to run
// will be retried if it fails (indefinitely)
export type DocumentsPostProcessHookOnDelete = (
  params: DocumentsPostProcessHookOnDeleteParams
) => Promise<void>;

// returns true if the post process hook should run for this document
// returns false if the post process hook should not run for this document
// needs to be relatively quick to run, will run in the same process as calling code
export type DocumentsPostProcessHookFilter = (
  params: DocumentsPostProcessHookFilterParams
) => Promise<boolean>;

// How long should the hook sleep before running (debouncing)
// ran in the same process as calling code (no retries, needs to be quick to run)
export type DocumentsPostProcessHookDebounceMs = (
  params: DocumentsPostProcessHookDebounceMsParams
) => Promise<number>;

export type DocumentsPostProcessHook = {
  onUpsert?: DocumentsPostProcessHookOnUpsert;
  onDelete?: DocumentsPostProcessHookOnDelete;
  filter: DocumentsPostProcessHookFilter;
  type: DocumentsPostProcessHookType;
  getDebounceMs?: DocumentsPostProcessHookDebounceMs;
};

export const DOCUMENTS_POST_PROCESS_HOOKS = [
  documentTrackerUpdateTrackedDocumentsPostProcessHook,
  documentTrackerSuggestChangesPostProcessHook,
];

export const DOCUMENTS_POST_PROCESS_HOOK_BY_TYPE: Record<
  DocumentsPostProcessHookType,
  DocumentsPostProcessHook
> = DOCUMENTS_POST_PROCESS_HOOKS.reduce(
  (acc, hook) => {
    acc[hook.type] = hook;
    return acc;
  },
  {} as Record<DocumentsPostProcessHookType, DocumentsPostProcessHook>
);

export async function getDocumentsPostUpsertHooksToRun(
  params: DocumentsPostProcessHookOnUpsertParams
): Promise<Array<{ type: DocumentsPostProcessHookType; debounceMs: number }>> {
  // TODO: parallel
  const hooksToRun: {
    type: DocumentsPostProcessHookType;
    debounceMs: number;
  }[] = [];

  const paramsWithVerb = { ...params, verb: "upsert" as const };

  for (const hook of DOCUMENTS_POST_PROCESS_HOOKS) {
    if (!hook.onUpsert) {
      continue;
    }

    if (await hook.filter(paramsWithVerb)) {
      const debounceMs = hook.getDebounceMs
        ? await hook.getDebounceMs(paramsWithVerb)
        : DEFAULT_DOCUMENTS_POST_PROCESS_HOOKS_DEBOUNCE_MS;
      hooksToRun.push({ type: hook.type, debounceMs });
    }
  }

  return hooksToRun;
}

export async function getDocumentsPostDeleteHooksToRun(
  params: DocumentsPostProcessHookOnDeleteParams
): Promise<Array<{ type: DocumentsPostProcessHookType }>> {
  // TODO: parallel
  const hooksToRun: {
    type: DocumentsPostProcessHookType;
  }[] = [];

  const paramsWithVerb = { ...params, verb: "delete" as const };

  for (const hook of DOCUMENTS_POST_PROCESS_HOOKS) {
    if (!hook.onDelete) {
      continue;
    }

    if (await hook.filter(paramsWithVerb)) {
      hooksToRun.push({ type: hook.type });
    }
  }

  return hooksToRun;
}
