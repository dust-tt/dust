import {
  DustFileSystem,
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { FilesScope } from "./schemas";

export function scopedPrefixForScope(scope: FilesScope): string {
  if (scope.type === "conversation") {
    return `${SCOPED_PREFIX_CONVERSATION}${scope.conversation_id}/`;
  }
  return `${SCOPED_PREFIX_POD}${scope.pod_id}/`;
}

export function validatePathMatchesScope(
  path: string,
  scope: FilesScope
): string | null {
  const expectedPrefix = scopedPrefixForScope(scope);
  if (!path.startsWith(expectedPrefix)) {
    return `Path must start with \`${expectedPrefix}\` for the given scope.`;
  }
  return null;
}

export async function getDustFileSystemForScope(
  auth: Authenticator,
  scope: FilesScope
): Promise<Result<DustFileSystem, string>> {
  if (scope.type === "conversation") {
    const conversation = await ConversationResource.fetchById(
      auth,
      scope.conversation_id
    );
    if (!conversation) {
      return new Err(
        `Conversation not found or not accessible: ${scope.conversation_id}`
      );
    }

    const fsResult = await DustFileSystem.forConversation(
      auth,
      conversation.toJSON()
    );
    if (fsResult.isErr()) {
      return new Err(fsResult.error.message);
    }
    return new Ok(fsResult.value);
  }

  const pod = await SpaceResource.fetchById(auth, scope.pod_id);
  if (!pod || !pod.isProject() || !auth.can("read", pod)) {
    return new Err(`Pod not found or you do not have access: ${scope.pod_id}`);
  }

  const fsResult = await DustFileSystem.forPod(auth, pod);
  if (fsResult.isErr()) {
    return new Err(fsResult.error.message);
  }
  return new Ok(fsResult.value);
}
