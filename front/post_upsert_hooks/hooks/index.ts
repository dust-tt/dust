import { ConnectorProvider } from "@app/lib/connectors_api";
import { DEFAULT_POST_UPSERT_HOOKS_DEBOUNCE_MS } from "@app/post_upsert_hooks/hooks/consts";
import {
  documentTrackerSuggestChangesPostUpsertHook,
  documentTrackerUpdateTrackedDocumentsPostUpsertHook,
} from "@app/post_upsert_hooks/hooks/document_tracker";
import { extractEventPostUpsertHook } from "@app/post_upsert_hooks/hooks/extract_event";

export const POST_UPSERT_HOOK_TYPES = [
  "document_tracker_update_tracked_documents",
  "document_tracker_suggest_changes",
  "extract_event",
] as const;
export type PostUpsertHookType = (typeof POST_UPSERT_HOOK_TYPES)[number];

type PostUpsertHookParams = {
  dataSourceName: string;
  workspaceId: string;
  documentId: string;
  documentText: string;
  documentHash: string;
  dataSourceConnectorProvider: ConnectorProvider | null;
};

// asyc function that will run in a temporal workflow
// can be expensive to runs
export type PostUpsertHookFunction = (
  params: PostUpsertHookParams
) => Promise<void>;

// returns true if the post upsert hook should run for this document
// returns false if the post upsert hook should not run for this document
// needs to be relatively quick to run, will run in the same process as calling code
export type PostUpsertHookFilter = (
  params: PostUpsertHookParams
) => Promise<boolean>;

// How long should the hook sleep before running (debouncing)
// ran in the same process as calling code (no retries, needs to be quick to run)
export type PostUpsertHookDebounceMs = (
  params: PostUpsertHookParams
) => Promise<number>;

export type PostUpsertHook = {
  fn: PostUpsertHookFunction;
  filter: PostUpsertHookFilter;
  type: PostUpsertHookType;
  getDebounceMs?: PostUpsertHookDebounceMs;
};

export const POST_UPSERT_HOOKS = [
  documentTrackerUpdateTrackedDocumentsPostUpsertHook,
  documentTrackerSuggestChangesPostUpsertHook,
  extractEventPostUpsertHook,
];

export const POST_UPSERT_HOOK_BY_TYPE: Record<
  PostUpsertHookType,
  PostUpsertHook
> = POST_UPSERT_HOOKS.reduce((acc, hook) => {
  acc[hook.type] = hook;
  return acc;
}, {} as Record<PostUpsertHookType, PostUpsertHook>);

export async function getPostUpsertHooksToRun(
  params: PostUpsertHookParams
): Promise<Array<{ type: PostUpsertHookType; debounceMs: number }>> {
  if (!process.env.POST_UPSERT_HOOKS_ENABLED) {
    return [];
  }
  // TODO: parallel
  const hooksToRun: { type: PostUpsertHookType; debounceMs: number }[] = [];
  for (const hook of POST_UPSERT_HOOKS) {
    if (await hook.filter(params)) {
      const debounceMs = hook.getDebounceMs
        ? await hook.getDebounceMs(params)
        : DEFAULT_POST_UPSERT_HOOKS_DEBOUNCE_MS;
      hooksToRun.push({ type: hook.type, debounceMs });
    }
  }

  return hooksToRun;
}
