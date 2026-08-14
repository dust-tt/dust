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
}
