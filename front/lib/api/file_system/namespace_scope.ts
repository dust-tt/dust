import type { FileSystemRootKind } from "@app/lib/resources/storage/models/file_system_node";

export type FileSystemAllowedRoot = {
  kind: FileSystemRootKind;
  id: string;
  name: string;
  permissions: { canRead: boolean; canWrite: boolean };
};

/** The roots already authorized for one request. Callers cannot add roots. */
export class FileSystemScope {
  constructor(readonly roots: readonly FileSystemAllowedRoot[]) {}

  contains(kind: FileSystemRootKind, id: string): boolean {
    return this.roots.some((root) => root.kind === kind && root.id === id);
  }

  canWrite(kind: FileSystemRootKind, id: string): boolean {
    return this.roots.some(
      (root) =>
        root.kind === kind && root.id === id && root.permissions.canWrite
    );
  }
}
