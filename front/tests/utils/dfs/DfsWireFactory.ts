import type { DfsWireMessage } from "@app/lib/dfs/proto";

// Sync, in-memory factory for dfs wire messages (the protobufjs object form of `dfs.proto`), for
// tests that fake dfs server answers. Ids are 32-char hex UUIDv7 strings.
export class DfsWireFactory {
  static objectId(id: string): DfsWireMessage {
    return { value: Buffer.from(id, "hex") };
  }

  static objectRef(id: string): DfsWireMessage {
    return { id: DfsWireFactory.objectId(id) };
  }

  static view(overrides: DfsWireMessage = {}): DfsWireMessage {
    return { storeVersion: "42", authVersion: "7", ...overrides };
  }

  // A regular file attribute for `id`.
  static attr(id: string, overrides: DfsWireMessage = {}): DfsWireMessage {
    return {
      id: DfsWireFactory.objectRef(id),
      name: "notes.txt",
      kind: "FILE",
      size: "5",
      mode: 0o600,
      mtime: "1700000000000",
      attrVersion: "3",
      contentVersion: "2",
      view: DfsWireFactory.view(),
      ...overrides,
    };
  }

  static session(overrides: DfsWireMessage = {}): DfsWireMessage {
    return {
      id: "session-1",
      tenantId: "tenant-1",
      subjects: ["g:eng"],
      sessionKey: "",
      expiresAt: "1700003600000",
      ...overrides,
    };
  }
}
