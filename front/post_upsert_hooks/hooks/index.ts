import { documentTrackerPostUpsertHook } from "@app/post_upsert_hooks/hooks/document_tracker";

export const POST_UPSERT_HOOK_TYPES = ["document_tracker"] as const;
export type PostUpsertHookType = (typeof POST_UPSERT_HOOK_TYPES)[number];

// asyc function that will run in a temporal workflow
// can be expensive to runs
export type PostUpsertHookFunction = (
  dataSourceName: string,
  workspaceId: string,
  documentId: string
) => Promise<void>;

// returns true if the post upsert hook should run for this document
// returns false if the post upsert hook should not run for this document
// needs to be relatively quick to run, will run in the same process as calling code
export type PostUpsertHookFilter = (
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  documentText: string
) => Promise<boolean>;

export type PostUpsertHook = {
  fn: PostUpsertHookFunction;
  filter: PostUpsertHookFilter;
  type: PostUpsertHookType;
};

export const POST_UPSERT_HOOKS = [documentTrackerPostUpsertHook];

export const POST_UPSERT_HOOK_BY_TYPE: Record<
  PostUpsertHookType,
  PostUpsertHook
> = POST_UPSERT_HOOKS.reduce((acc, hook) => {
  acc[hook.type] = hook;
  return acc;
}, {} as Record<PostUpsertHookType, PostUpsertHook>);

export async function shouldTriggerPostUpserHookWorkflow(
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  documentText: string
): Promise<boolean> {
  // TODO: parallel
  for (const hook of POST_UPSERT_HOOKS) {
    if (
      await hook.filter(dataSourceName, workspaceId, documentId, documentText)
    ) {
      return true;
    }
  }

  return false;
}
