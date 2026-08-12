import { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type { SandboxFileSystemTokenPayload } from "@app/lib/api/sandbox/access_tokens";

/** Build the complete mount scope from signed claims, never from request data. */
export function fileSystemScopeFromSandboxClaims(
  claims: SandboxFileSystemTokenPayload
): FileSystemScope {
  return new FileSystemScope([
    ...(claims.cId
      ? [
          {
            kind: "conversation" as const,
            id: claims.cId,
            name: "conversation",
            permissions: { canRead: true, canWrite: true },
          },
        ]
      : []),
    ...(claims.spaceId
      ? [
          {
            kind: "pod" as const,
            id: claims.spaceId,
            name: "pod",
            permissions: { canRead: true, canWrite: true },
          },
        ]
      : []),
  ]);
}
