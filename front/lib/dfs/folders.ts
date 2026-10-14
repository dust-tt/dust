import { formatDfsUri } from "@app/lib/dfs/uri";
import type { DfsObjectId } from "@app/types/dfs";

/**
 * URIs of the context folders of `dfs/design-docs/URI.md`, each anchored at the folder that holds
 * it: user folders at the tenant root, pod folders and conversations outside pods at their owner's
 * user folder, conversations of a pod at the pod folder.
 */
/**
 * @cc [owner:fabiencelier,label:product] folder-layout
 * The URIs MUST follow the layout of `dfs/design-docs/URI.md`: `users/<email>` under the tenant root,
 * `pods/pod-<podSId>` and `conversations/conv-<conversationSId>` under their parent folder. Changing
 * a name orphans the folders already created under the previous one.
 */
export function userFolderUri(rootId: DfsObjectId, email: string): string {
  return formatDfsUri(rootId, { path: ["users", email] });
}

export function podFolderUri(userFolderId: DfsObjectId, podId: string): string {
  return formatDfsUri(userFolderId, { path: ["pods", `pod-${podId}`] });
}

/**
 * `parentFolderId` is the pod folder for a conversation of a pod, else the owner's user folder.
 */
export function conversationFolderUri(
  parentFolderId: DfsObjectId,
  conversationId: string
): string {
  return formatDfsUri(parentFolderId, {
    path: ["conversations", `conv-${conversationId}`],
  });
}
