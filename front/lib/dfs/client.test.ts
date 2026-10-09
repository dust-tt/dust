// @vitest-environment node
import { DfsClient } from "@app/lib/dfs/client";
import { MAX_UINT64 } from "@app/lib/dfs/codec";
import { newDfsObjectId } from "@app/lib/dfs/object_id";
import type { DfsMethod } from "@app/lib/dfs/proto";
import { DfsWireFactory } from "@app/tests/utils/dfs/DfsWireFactory";
import type { FakeDfsAnswer } from "@app/tests/utils/dfs/FakeDfsTransport";
import { FakeDfsTransport } from "@app/tests/utils/dfs/FakeDfsTransport";
import { DfsError, isDfsObjectId } from "@app/types/dfs";
import { Err, Ok } from "@app/types/shared/result";
import { describe, expect, it } from "vitest";

const ROOT_ID = "0190c3a0b1c27d4e8f0a1b2c3d4e5f60";
const FILE_ID = "0190c3a0b1c37aaa9bbbccccddddeeee";
const SESSION_KEY = "s".repeat(64);

const { objectId: wireId, objectRef: wireRef, attr: wireAttr } = DfsWireFactory;

function setup(answers: Partial<Record<DfsMethod, FakeDfsAnswer>>) {
  const transport = new FakeDfsTransport(answers);
  return { transport, client: new DfsClient(transport, SESSION_KEY) };
}

describe("DfsClient", () => {
  it("creates a session and decodes ids and timestamps", async () => {
    const { client, transport } = setup({
      CreateSession: new Ok(
        DfsWireFactory.session({
          subjects: ["u:a@dust.tt", "g:eng"],
          sessionKey: SESSION_KEY,
        })
      ),
    });

    const res = await client.createSession({
      subjects: ["u:a@dust.tt", "g:eng"],
    });

    expect(res.isOk() && res.value).toEqual({
      id: "session-1",
      tenantId: "tenant-1",
      subjects: ["u:a@dust.tt", "g:eng"],
      sessionKey: SESSION_KEY,
      expiresAtMs: 1700003600000,
    });
    expect(transport.calls).toEqual([
      {
        method: "CreateSession",
        request: { subjects: ["u:a@dust.tt", "g:eng"] },
        key: SESSION_KEY,
      },
    ]);
  });

  it("refreshes a session and revokes one by id", async () => {
    const { client, transport } = setup({
      RefreshSession: new Ok(
        DfsWireFactory.session({ expiresAt: "1700007200000" })
      ),
      RevokeSession: new Ok({}),
    });

    const refreshed = await client.refreshSession();
    const revoked = await client.revokeSession({ sessionId: "session-1" });

    expect(refreshed.isOk() && refreshed.value.expiresAtMs).toBe(1700007200000);
    expect(revoked.isOk()).toBe(true);
    expect(
      transport.calls.map(({ method, request }) => [method, request])
    ).toEqual([
      ["RefreshSession", {}],
      ["RevokeSession", { sessionId: "session-1" }],
    ]);
  });

  it("returns invalid_input for an empty session id without calling the server", async () => {
    const { client, transport } = setup({});

    const res = await client.revokeSession({ sessionId: "" });

    expect(res.isErr() && res.error.code).toBe("invalid_input");
    expect(transport.calls).toHaveLength(0);
  });

  it("stats virtual and real objects with per-item errors and exact versions", async () => {
    const { client, transport } = setup({
      Stat: new Ok({
        results: [
          {
            object: wireAttr(ROOT_ID, {
              id: { root: true },
              name: "",
              kind: "DIRECTORY",
              size: "0",
              metadata: {
                created: "0",
                mimeType: "inode/directory",
                xattrs: {},
              },
            }),
          },
          {
            object: wireAttr(FILE_ID, {
              attrVersion: MAX_UINT64.toString(),
              metadata: {
                created: "1600000000000",
                mimeType: "text/plain",
                xattrs: { "user.tag": Buffer.from("v") },
              },
            }),
          },
          { error: { code: "NOT_FOUND" } },
        ],
      }),
    });

    const res = await client.stat({
      objectIds: ["root", FILE_ID, "shared"],
      includeMetadata: true,
    });

    expect(transport.calls[0].request).toEqual({
      objectIds: [{ root: true }, wireRef(FILE_ID), { shared: true }],
      includeMetadata: true,
    });
    expect(res.isOk()).toBe(true);
    if (!res.isOk()) {
      return;
    }
    const [root, file, shared] = res.value.results;
    expect(root).toMatchObject({
      status: "ok",
      object: {
        id: "root",
        name: "",
        kind: "directory",
        metadata: { createdMs: 0, xattrs: {} },
      },
    });
    expect(file).toMatchObject({
      status: "ok",
      object: {
        id: FILE_ID,
        name: "notes.txt",
        size: 5,
        mode: 0o600,
        mtimeMs: 1700000000000,
        attrVersion: MAX_UINT64,
        contentVersion: BigInt("2"),
        view: { storeVersion: BigInt("42"), authVersion: BigInt("7") },
        metadata: { createdMs: 1600000000000, mimeType: "text/plain" },
      },
    });
    if (file.status === "ok") {
      expect(file.object.atimeMs).toBeUndefined();
      expect(
        Buffer.from(file.object.metadata?.xattrs["user.tag"] ?? []).toString()
      ).toBe("v");
    }
    expect(shared).toEqual({ status: "error", errorCode: "not_found" });
  });

  it("returns invalid_input for a malformed object id without calling the server", async () => {
    const { client, transport } = setup({});

    const res = await client.stat({ objectIds: ["not-an-id"] });

    expect(res.isErr() && res.error.code).toBe("invalid_input");
    expect(transport.calls).toHaveLength(0);
  });

  it("lists a directory page", async () => {
    const { client, transport } = setup({
      List: new Ok({
        entries: [
          { name: "a.txt", object: wireAttr(FILE_ID) },
          { name: "gone" },
        ],
        nextAfter: "a.txt",
      }),
    });

    const res = await client.list({ directoryId: ROOT_ID, limit: 2 });

    expect(transport.calls[0].request).toEqual({
      directoryId: wireRef(ROOT_ID),
      limit: 2,
    });
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value.nextAfter).toBe("a.txt");
      expect(res.value.entries.map((e) => [e.name, e.object?.id])).toEqual([
        ["a.txt", FILE_ID],
        ["gone", undefined],
      ]);
    }
  });

  it("reads a byte range", async () => {
    const { client, transport } = setup({
      Read: new Ok({
        data: Buffer.from("hello"),
        object: wireAttr(FILE_ID),
      }),
    });

    const res = await client.read({
      objectId: FILE_ID,
      offset: 0,
      length: 1024,
    });

    expect(transport.calls[0].request).toEqual({
      objectId: wireId(FILE_ID),
      offset: "0",
      length: 1024,
    });
    expect(res.isOk() && Buffer.from(res.value.data).toString()).toBe("hello");
  });

  it("reads several files, including empty and failed ones", async () => {
    const otherId = newDfsObjectId();
    const { client } = setup({
      ReadFiles: new Ok({
        results: [
          {
            objectId: wireId(FILE_ID),
            object: wireAttr(FILE_ID, { size: "0" }),
            data: Buffer.alloc(0),
          },
          { objectId: wireId(otherId), error: { code: "NOT_FOUND" } },
          // Too large for the remaining reply budget.
          { objectId: wireId(ROOT_ID), error: { code: "CAPACITY" } },
        ],
      }),
    });

    const res = await client.readFiles({
      objectIds: [FILE_ID, otherId, ROOT_ID],
    });

    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value.results).toMatchObject([
        { status: "ok", objectId: FILE_ID, data: Buffer.alloc(0) },
        { status: "error", objectId: otherId, errorCode: "not_found" },
        { status: "error", objectId: ROOT_ID, errorCode: "capacity" },
      ]);
    }
  });

  it("validates cached versions", async () => {
    const { client, transport } = setup({
      Validate: new Ok({
        results: [
          { outcome: "UNCHANGED" },
          { outcome: "CHANGED" },
          { outcome: "DENIED", error: { code: "FORBIDDEN" } },
        ],
        view: DfsWireFactory.view(),
      }),
    });

    const res = await client.validate({
      checks: [
        { objectId: "root", contentVersion: BigInt("4") },
        {
          objectId: FILE_ID,
          attrVersion: BigInt("3"),
          contentVersion: BigInt("2"),
        },
        { objectId: ROOT_ID, attrVersion: BigInt("1") },
      ],
    });

    expect(transport.calls[0].request).toEqual({
      checks: [
        { objectId: { root: true }, contentVersion: "4" },
        {
          objectId: wireRef(FILE_ID),
          attrVersion: "3",
          contentVersion: "2",
        },
        { objectId: wireRef(ROOT_ID), attrVersion: "1" },
      ],
    });
    expect(res.isOk() && res.value.results).toEqual([
      { outcome: "unchanged", errorCode: undefined },
      { outcome: "changed", errorCode: undefined },
      { outcome: "denied", errorCode: "forbidden" },
    ]);
  });

  it("applies operations in order and returns per-operation outcomes", async () => {
    const newId = newDfsObjectId();
    const { client, transport } = setup({
      Apply: new Ok({
        results: [
          {
            mutation: {
              object: wireAttr(newId, { name: "new.txt" }),
              related: [],
            },
          },
          {
            mutation: {
              object: wireAttr(newId, { size: "5" }),
              related: [],
            },
          },
          { error: { code: "ALREADY_EXISTS" } },
          { mutation: { related: [] } },
        ],
      }),
    });

    const res = await client.apply({
      operations: [
        {
          type: "create",
          parentId: ROOT_ID,
          name: "new.txt",
          objectId: newId,
          kind: "file",
          xattrs: { "user.k": Buffer.from("v") },
        },
        {
          type: "write",
          objectId: newId,
          offset: 0,
          data: Buffer.from("hello"),
          append: false,
        },
        {
          type: "rename",
          objectId: FILE_ID,
          parentId: ROOT_ID,
          name: "new.txt",
          replace: false,
        },
        { type: "remove", objectId: FILE_ID, kind: "file" },
      ],
    });

    expect(transport.calls[0].request).toEqual({
      operations: [
        {
          create: {
            parentId: wireId(ROOT_ID),
            name: "new.txt",
            objectId: wireId(newId),
            kind: "FILE",
            xattrs: { "user.k": Buffer.from("v") },
          },
        },
        {
          write: {
            objectId: wireId(newId),
            offset: "0",
            data: Buffer.from("hello"),
            append: false,
          },
        },
        {
          rename: {
            objectId: wireId(FILE_ID),
            parentId: wireId(ROOT_ID),
            name: "new.txt",
            replace: false,
          },
        },
        {
          remove: { objectId: wireId(FILE_ID), kind: "FILE" },
        },
      ],
    });
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value.results).toMatchObject([
        { status: "ok", mutation: { object: { id: newId, name: "new.txt" } } },
        { status: "ok", mutation: { object: { size: 5 } } },
        { status: "error", errorCode: "already_exists" },
        { status: "ok", mutation: { related: [] } },
      ]);
      const removed = res.value.results[3];
      expect(removed.status === "ok" && removed.mutation.object).toBe(
        undefined
      );
    }
  });

  it("encodes update patches, removing xattrs whose value is omitted", async () => {
    const { client, transport } = setup({
      Apply: new Ok({
        results: [
          {
            mutation: { object: wireAttr(FILE_ID), related: [] },
          },
        ],
      }),
    });

    await client.apply({
      operations: [
        {
          type: "update",
          objectId: FILE_ID,
          mimeType: "text/markdown",
          xattrs: [
            { name: "user.drop" },
            { name: "user.empty", value: new Uint8Array() },
          ],
          mtimeMs: 1700000000000,
          size: 0,
        },
      ],
    });

    expect(transport.calls[0].request).toEqual({
      operations: [
        {
          update: {
            objectId: wireId(FILE_ID),
            mimeType: "text/markdown",
            xattrs: [
              { name: "user.drop" },
              { name: "user.empty", value: Buffer.alloc(0) },
            ],
            mtime: "1700000000000",
            size: "0",
          },
        },
      ],
    });
  });

  it("encodes search requests and decodes hits", async () => {
    const { client, transport } = setup({
      Search: new Ok({
        hits: [
          {
            object: {
              id: wireId(FILE_ID),
              name: "notes.txt",
              kind: "FILE",
              size: "5",
              mtime: "1700000000000",
            },
            excerpt: "hello",
          },
        ],
        partial: false,
      }),
    });

    const res = await client.search({
      query: "hello",
      fields: ["content"],
      scope: { directoryId: ROOT_ID, recursive: false },
      filter: {
        kind: "file",
        mimeTypes: ["text/plain"],
        modifiedAfterMs: 1600000000000,
        xattrs: [{ name: "user.tag" }],
      },
      limit: 5,
    });

    expect(transport.calls[0].request).toEqual({
      query: "hello",
      fields: ["CONTENT"],
      scope: { directoryId: wireId(ROOT_ID), recursive: false },
      filter: {
        kind: "FILE",
        mimeTypes: ["text/plain"],
        modifiedAfter: "1600000000000",
        xattrs: [{ name: "user.tag" }],
      },
      limit: 5,
    });
    expect(res.isOk() && res.value).toMatchObject({
      hits: [
        {
          excerpt: "hello",
          object: {
            id: FILE_ID,
            name: "notes.txt",
            size: 5,
            mtimeMs: 1700000000000,
          },
        },
      ],
      partial: false,
    });
  });

  it("encodes and decodes allow and deny grants", async () => {
    const { client, transport } = setup({
      ListGrants: new Ok({
        grants: [
          { allow: { subject: "g:eng", mode: 0o5 } },
          { deny: { mode: 0o2 } },
        ],
        nextAfter: "cursor",
      }),
      UpdateGrants: new Ok({}),
    });

    const page = await client.listGrants({ objectId: ROOT_ID, limit: 10 });
    const updated = await client.updateGrants({
      objectId: ROOT_ID,
      changes: [
        {
          grant: { type: "allow", subject: "g:eng", mode: 0o7 },
          remove: false,
        },
        { grant: { type: "deny", mode: 0o2 }, remove: true },
      ],
    });

    expect(page.isOk() && page.value).toEqual({
      grants: [
        { type: "allow", subject: "g:eng", mode: 0o5 },
        { type: "deny", mode: 0o2 },
      ],
      nextAfter: "cursor",
    });
    expect(updated.isOk()).toBe(true);
    expect(transport.calls.map((c) => c.request)).toEqual([
      { objectId: wireId(ROOT_ID), limit: 10 },
      {
        objectId: wireId(ROOT_ID),
        changes: [
          { grant: { allow: { subject: "g:eng", mode: 0o7 } }, remove: false },
          { grant: { deny: { mode: 0o2 } }, remove: true },
        ],
      },
    ]);
  });

  it("looks up a batch of children with per-target results", async () => {
    const { client, transport } = setup({
      Lookup: new Ok({
        results: [
          { object: wireAttr(FILE_ID) },
          { error: { code: "NOT_FOUND" } },
        ],
      }),
    });

    const res = await client.lookup({
      targets: [
        { parentId: ROOT_ID, name: "notes.txt" },
        { parentId: "root", name: "missing" },
      ],
      includeMetadata: true,
    });

    expect(transport.calls[0].request).toEqual({
      targets: [
        { parentId: wireRef(ROOT_ID), name: "notes.txt" },
        { parentId: { root: true }, name: "missing" },
      ],
      includeMetadata: true,
    });
    expect(res.isOk() && res.value.results).toMatchObject([
      { status: "ok", object: { id: FILE_ID, name: "notes.txt" } },
      { status: "error", errorCode: "not_found" },
    ]);
  });

  it("propagates transport errors", async () => {
    const { client } = setup({
      Lookup: new Err(new DfsError("unavailable")),
    });

    const res = await client.lookup({
      targets: [{ parentId: "root", name: "notes.txt" }],
    });

    expect(res.isErr() && res.error.code).toBe("unavailable");
  });

  it("returns invalid_response when a batch result has neither object nor error", async () => {
    const { client } = setup({
      Stat: new Ok({
        results: [{}],
      }),
    });

    const res = await client.stat({ objectIds: ["root"] });

    expect(res.isErr() && res.error.code).toBe("invalid_response");
  });

  it("returns invalid_response when stat returns a different number of results", async () => {
    const { client } = setup({
      Stat: new Ok({ results: [{ error: { code: "NOT_FOUND" } }] }),
    });

    const res = await client.stat({ objectIds: ["root", FILE_ID] });

    expect(res.isErr() && res.error.code).toBe("invalid_response");
  });

  it("returns invalid_response when apply returns a different number of results", async () => {
    const { client } = setup({
      Apply: new Ok({ results: [{ error: { code: "NOT_FOUND" } }] }),
    });

    const res = await client.apply({
      operations: [
        { type: "remove", objectId: FILE_ID, kind: "file" },
        { type: "remove", objectId: ROOT_ID, kind: "directory" },
      ],
    });

    expect(res.isErr() && res.error.code).toBe("invalid_response");
  });

  it("returns invalid_response when readFiles results do not echo the inputs in order", async () => {
    const { client } = setup({
      ReadFiles: new Ok({
        results: [
          { objectId: wireId(ROOT_ID), error: { code: "NOT_FOUND" } },
          { objectId: wireId(FILE_ID), error: { code: "NOT_FOUND" } },
        ],
      }),
    });

    const res = await client.readFiles({ objectIds: [FILE_ID, ROOT_ID] });

    expect(res.isErr() && res.error.code).toBe("invalid_response");
  });

  it("returns invalid_response when stat reports another object", async () => {
    const { client } = setup({
      Stat: new Ok({
        results: [{ object: wireAttr(ROOT_ID) }, { object: wireAttr(FILE_ID) }],
      }),
    });

    const res = await client.stat({ objectIds: [FILE_ID, ROOT_ID] });

    expect(res.isErr() && res.error.code).toBe("invalid_response");
  });

  it("returns invalid_response when lookup reports another name", async () => {
    const { client } = setup({
      Lookup: new Ok({
        results: [
          { object: wireAttr(FILE_ID, { name: "b" }) },
          { object: wireAttr(ROOT_ID, { name: "a" }) },
        ],
      }),
    });

    const res = await client.lookup({
      targets: [
        { parentId: ROOT_ID, name: "a" },
        { parentId: ROOT_ID, name: "b" },
      ],
    });

    expect(res.isErr() && res.error.code).toBe("invalid_response");
  });

  it("accepts projected names when looking up under shared", async () => {
    const { client } = setup({
      Lookup: new Ok({
        results: [{ object: wireAttr(FILE_ID, { name: "notes.txt" }) }],
      }),
    });

    const res = await client.lookup({
      targets: [{ parentId: "shared", name: `notes.txt--${FILE_ID}` }],
    });

    expect(res.isOk()).toBe(true);
  });

  it("returns invalid_response when a readFiles result holds another object", async () => {
    const { client } = setup({
      ReadFiles: new Ok({
        results: [
          {
            objectId: wireId(FILE_ID),
            object: wireAttr(ROOT_ID),
            data: Buffer.from("hello"),
          },
        ],
      }),
    });

    const res = await client.readFiles({ objectIds: [FILE_ID] });

    expect(res.isErr() && res.error.code).toBe("invalid_response");
  });

  it("returns invalid_response when apply reports another primary object", async () => {
    const { client } = setup({
      Apply: new Ok({
        results: [
          { mutation: { object: wireAttr(ROOT_ID), related: [] } },
          { mutation: { object: wireAttr(FILE_ID), related: [] } },
        ],
      }),
    });

    const res = await client.apply({
      operations: [
        {
          type: "write",
          objectId: FILE_ID,
          offset: 0,
          data: Buffer.from("a"),
          append: false,
        },
        {
          type: "write",
          objectId: ROOT_ID,
          offset: 0,
          data: Buffer.from("b"),
          append: false,
        },
      ],
    });

    expect(res.isErr() && res.error.code).toBe("invalid_response");
  });

  it("returns invalid_response when a read returns more than requested", async () => {
    const { client } = setup({
      Read: new Ok({ data: Buffer.from("hello"), object: wireAttr(FILE_ID) }),
    });

    const res = await client.read({ objectId: FILE_ID, offset: 0, length: 4 });

    expect(res.isErr() && res.error.code).toBe("invalid_response");
  });

  it("returns invalid_input for values outside their wire integer type", async () => {
    const { client, transport } = setup({});

    const fractional = await client.read({
      objectId: FILE_ID,
      offset: 0,
      length: 1.5,
    });
    const tooLarge = await client.validate({
      checks: [{ objectId: FILE_ID, attrVersion: MAX_UINT64 + BigInt(1) }],
    });

    expect(fractional.isErr() && fractional.error.code).toBe("invalid_input");
    expect(tooLarge.isErr() && tooLarge.error.code).toBe("invalid_input");
    expect(transport.calls).toHaveLength(0);
  });

  it("returns invalid_input for negative offsets", async () => {
    const { client, transport } = setup({});

    const res = await client.read({ objectId: FILE_ID, offset: -1, length: 1 });

    expect(res.isErr() && res.error.code).toBe("invalid_input");
    expect(transport.calls).toHaveLength(0);
  });

  it("generates UUIDv7 object ids", () => {
    const id = newDfsObjectId();
    expect(isDfsObjectId(id)).toBe(true);
    // The first 48 bits are the creation time in milliseconds.
    expect(Math.abs(parseInt(id.slice(0, 12), 16) - Date.now())).toBeLessThan(
      60_000
    );
  });
});
