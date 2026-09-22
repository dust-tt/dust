import { DustFileSystem } from "@app/lib/api/file_system";
import type { FileSystemMount } from "@app/types/file_system";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { vi } from "vitest";

export type MockMountLocation = {
  /** Scope root every path in the mount sits under: `conversation-<cId>` or `pod-<podId>`. */
  scope: string;
  /** GCS mount path the scope maps to, trailing slash included. */
  mountBase: string;
  /** Stored content type per scoped path, as GCS holds it alongside the bytes. */
  contentTypes: Map<string, string>;
};

/** The mount the scope root stands for: `pod-<podId>` is the Pod `<podId>`, writable. */
function mountFromScope(scope: string): FileSystemMount {
  const separator = scope.indexOf("-");
  const kind = scope.slice(0, separator);
  assert(
    kind === "conversation" || kind === "pod",
    `A mock mount scope must be a conversation or a Pod, got '${scope}'.`
  );

  return {
    kind,
    id: scope.slice(separator + 1),
    scopedPrefix: scope,
    sandboxMountPoint: null,
    legacyPrefix: null,
    legacySandboxMountPoint: null,
    permissions: { canRead: true, canWrite: true },
  };
}

/** In-memory mount standing in for a conversation's or a Pod's GCS filesystem. */
export function createMockMountFs(
  files: Map<string, string>,
  { scope, mountBase, contentTypes }: MockMountLocation
): DustFileSystem {
  const mount = mountFromScope(scope);
  const isInMount = (scopedPath: string) => scopedPath.startsWith(`${scope}/`);

  const fakeFs = {
    isGCSBacked: () => true,
    getMounts: () => [mount],
    checkWriteAccess: (scopedPath: string) =>
      isInMount(scopedPath)
        ? new Ok(undefined)
        : new Err(new Error(`'${scopedPath}' is outside '${scope}'.`)),
    toMountFilePath: (scopedPath: string) =>
      isInMount(scopedPath)
        ? `${mountBase}${scopedPath.slice(scope.length + 1)}`
        : null,
    readBuffer: async (p: string) => {
      const content = files.get(p);
      return new Ok(content === undefined ? null : Buffer.from(content));
    },
    stat: async (p: string) => {
      const content = files.get(p);
      if (content === undefined) {
        return new Ok(null);
      }

      return new Ok({
        contentType: contentTypes.get(p) ?? "text/plain",
        sizeBytes: Buffer.byteLength(content),
      });
    },
    write: async (p: string, content: Buffer | string, contentType: string) => {
      files.set(p, content.toString());
      contentTypes.set(p, contentType);
      return new Ok(undefined);
    },
    // A GCS copy carries the source object's content type over to the destination.
    copy: async ({ src, dest }: { src: string; dest: string }) => {
      const content = files.get(src);
      if (content === undefined) {
        return new Err(new Error(`missing ${src}`));
      }
      files.set(dest, content);
      const srcContentType = contentTypes.get(src);
      if (srcContentType) {
        contentTypes.set(dest, srcContentType);
      }
      return new Ok(undefined);
    },
    delete: async (p: string) => {
      files.delete(p);
      contentTypes.delete(p);
      return new Ok(undefined);
    },
    list: async (root: string) =>
      new Ok(
        [...files.keys()]
          .filter((p) => p.startsWith(`${root}/`))
          .map((p) => ({ path: p, isDirectory: false }))
      ),
  };

  return fakeFs as unknown as DustFileSystem;
}

/** A mock mount every `DustFileSystem.fromScopedPath` resolves to, for code that resolves its own. */
export function mockMount(
  files: Map<string, string>,
  location: MockMountLocation
) {
  const fakeFs = createMockMountFs(files, location);
  vi.spyOn(DustFileSystem, "fromScopedPath").mockResolvedValue(new Ok(fakeFs));

  return { fakeFs, files, contentTypes: location.contentTypes };
}
