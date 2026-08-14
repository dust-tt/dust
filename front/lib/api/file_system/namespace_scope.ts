export type FileSystemRootKind = "conversation" | "pod";

export type FileSystemAllowedRoot = {
  kind: FileSystemRootKind;
  id: string;
  name: string;
  permissions: { canRead: boolean; canWrite: boolean };
};

/** Roots selected by the caller after checking access to them. */
export class FileSystemScope {
  constructor(readonly roots: readonly FileSystemAllowedRoot[]) {}

  readableRoots(): readonly FileSystemAllowedRoot[] {
    return this.roots.filter((root) => root.permissions.canRead);
  }

  canRead(kind: FileSystemRootKind, id: string): boolean {
    return this.roots.some(
      (root) => root.kind === kind && root.id === id && root.permissions.canRead
    );
  }

  canWrite(kind: FileSystemRootKind, id: string): boolean {
    return this.roots.some(
      (root) =>
        root.kind === kind && root.id === id && root.permissions.canWrite
    );
  }
}
