import { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type { SandboxFileSystemTokenPayload } from "@app/lib/api/sandbox/access_tokens";

/** Build the mounted roots from signed token claims, never from request data. */
export function fileSystemScopeFromSandboxClaims(
  claims: SandboxFileSystemTokenPayload
): FileSystemScope {
  return new FileSystemScope(
    claims.fileSystemRoots.map((root) => ({
      kind: root.kind,
      id: root.id,
      name: `${root.kind}-${root.id}`,
      permissions: root.permissions,
    }))
  );
}
