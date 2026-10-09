import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Metadata, Server, ServerCredentials, status } from "@grpc/grpc-js";
import type { ServerUnaryCall, sendUnaryData } from "@grpc/grpc-js";
import { createClient } from "redis";
import { z } from "zod";

import { encodeDfsMessage } from "@app/lib/dfs/proto";
import type { DfsWireMessage } from "@app/lib/dfs/proto";
import { getDfsServiceDefinition } from "@app/tests/utils/dfs/dfsServiceDefinition";
import { DfsWireFactory } from "@app/tests/utils/dfs/DfsWireFactory";
import type { Binding } from "@app/workers/gcs_dfs/protocol";

export function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export async function testRedis() {
  const container = `gcs-dfs-test-${randomUUID()}`;
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "-d",
      "--name",
      container,
      "-p",
      "127.0.0.1::6379",
      "redis:7-alpine",
    ],
    { stdio: "pipe" }
  );
  const port = execFileSync("docker", ["port", container, "6379/tcp"], {
    encoding: "utf8",
  })
    .trim()
    .split(":")
    .at(-1);
  const redis = createClient({ url: `redis://127.0.0.1:${port}` });
  redis.on("error", () => {});
  await redis.connect();
  return {
    redis,
    close: async () => {
      await redis.quit();
      execFileSync("docker", ["stop", container], { stdio: "pipe" });
    },
  };
}

const Id = z.object({
  value: z.instanceof(Buffer).transform((bytes) => bytes.toString("hex")),
});
const Ref = z.object({ id: Id });
const Create = z.object({
  parentId: Id,
  objectId: Id,
  name: z.string(),
  kind: z.enum(["FILE", "DIRECTORY"]),
});
const Write = z.object({
  objectId: Id,
  offset: z.string(),
  data: z.instanceof(Buffer),
  append: z.boolean(),
});
const Update = z.object({
  objectId: Id,
  mtime: z.string().optional(),
  mimeType: z.string().optional(),
  xattrs: z
    .array(z.object({ name: z.string(), value: z.instanceof(Buffer) }))
    .default([]),
});
const Rename = z.object({
  objectId: Id,
  parentId: Id,
  name: z.string(),
  replace: z.boolean(),
});
const Remove = z.object({ objectId: Id, kind: z.string() });
const Operation = z.union([
  z.object({ create: Create }),
  z.object({ write: Write }),
  z.object({ update: Update }),
  z.object({ rename: Rename }),
  z.object({ remove: Remove }),
]);
export type TestOperation = z.infer<typeof Operation>;

type TestObject = {
  id: string;
  parentId: string;
  name: string;
  bytes: Buffer;
  xattrs: Record<string, Buffer>;
};
type Session = {
  id: string;
  key: string;
  revoked: boolean;
  admitted: Set<Promise<void>>;
};
type Call = ServerUnaryCall<DfsWireMessage, DfsWireMessage>;
type Callback = sendUnaryData<DfsWireMessage>;

export async function testDfs(binding: Binding) {
  const objects = new Map<string, TestObject>();
  const sessions = new Map<string, Session>();
  const calls: string[] = [];
  const operations: TestOperation[] = [];
  const hooks = {
    beforeApply: async (_operation: TestOperation) => {},
    afterApply: (_operation: TestOperation) => false,
    revoke: (_id: string) => {},
    badGrants: false,
    failRevoke: false,
    failWrite: false,
  };
  const server = new Server();
  const attr = (object: TestObject) =>
    DfsWireFactory.attr(object.id, {
      name: object.name,
      size: String(object.bytes.length),
      metadata: { created: "1", mimeType: "text/plain", xattrs: object.xattrs },
    });
  const failure = (
    callback: Callback,
    code: string,
    grpcStatus = status.UNAUTHENTICATED
  ) => {
    const metadata = new Metadata();
    metadata.set(
      "grpc-status-details-bin",
      encodeDfsMessage("ErrorDetails", { code })
    );
    callback({ code: grpcStatus, metadata, details: code });
  };
  const authenticate = (
    call: Call,
    callback: Callback
  ): Session | undefined => {
    const key = String(call.metadata.get("authorization")[0]).replace(
      "Bearer ",
      ""
    );
    const session = [...sessions.values()].find(
      (session) => session.key === key
    );
    if (!session || session.revoked) {
      failure(callback, "UNAUTHENTICATED");
      return;
    }
    return session;
  };
  server.addService(getDfsServiceDefinition(), {
    CreateSession: (_call: Call, callback: Callback) => {
      const id = randomUUID();
      const key = id.replace(/-/g, "").repeat(2);
      sessions.set(id, { id, key, revoked: false, admitted: new Set() });
      calls.push(`create:${id}`);
      callback(
        null,
        DfsWireFactory.session({
          id,
          tenantId: binding.tenant,
          sessionKey: key,
          expiresAt: String(Date.now() + 3600000),
        })
      );
    },
    RevokeSession: (call: Call, callback: Callback) => {
      const { sessionId } = z
        .object({ sessionId: z.string() })
        .parse(call.request);
      const session = sessions.get(sessionId);
      calls.push(`revoke:${sessionId}`);
      hooks.revoke(sessionId);
      if (hooks.failRevoke) {
        failure(callback, "UNAVAILABLE", status.UNAVAILABLE);
        return;
      }
      if (!session) {
        failure(callback, "NOT_FOUND", status.NOT_FOUND);
        return;
      }
      session.revoked = true;
      void Promise.all([...session.admitted]).then(() => callback(null, {}));
    },
    Stat: (call: Call, callback: Callback) => {
      if (!authenticate(call, callback)) {
        return;
      }
      const { objectIds } = z
        .object({ objectIds: z.array(Ref) })
        .parse(call.request);
      callback(null, {
        results: objectIds.map(({ id }) => ({
          object: DfsWireFactory.attr(id.value, {
            kind: "DIRECTORY",
            size: "0",
          }),
        })),
      });
    },
    ListGrants: (call: Call, callback: Callback) => {
      const { objectId } = z.object({ objectId: Id }).parse(call.request);
      const subjects =
        objectId.value === binding.directoryId ? binding.readers : [];
      callback(null, {
        grants: hooks.badGrants
          ? []
          : [
              { deny: { mode: 6 } },
              { allow: { subject: binding.writerSubject, mode: 6 } },
              ...subjects.map((subject) => ({ allow: { subject, mode: 4 } })),
            ],
      });
    },
    Lookup: (call: Call, callback: Callback) => {
      if (!authenticate(call, callback)) {
        return;
      }
      const { targets } = z
        .object({
          targets: z.array(z.object({ parentId: Ref, name: z.string() })),
        })
        .parse(call.request);
      callback(null, {
        results: targets.map(({ parentId, name }) => {
          const object = [...objects.values()].find(
            (object) =>
              object.parentId === parentId.id.value && object.name === name
          );
          return object
            ? { object: attr(object) }
            : { error: { code: "NOT_FOUND" } };
        }),
      });
    },
    Apply: (call: Call, callback: Callback) => {
      const session = authenticate(call, callback);
      if (!session) {
        return;
      }
      const {
        operations: [operation],
      } = z
        .object({ operations: z.array(Operation).length(1) })
        .parse(call.request);
      operations.push(operation);
      const done = deferred();
      session.admitted.add(done.promise);
      void (async () => {
        try {
          await hooks.beforeApply(operation);
          if ("write" in operation && hooks.failWrite) {
            callback(null, { results: [{ error: { code: "CAPACITY" } }] });
            return;
          }
          let object: TestObject | undefined;
          if ("create" in operation) {
            const op = operation.create;
            object = {
              id: op.objectId.value,
              parentId: op.parentId.value,
              name: op.name,
              bytes: Buffer.alloc(0),
              xattrs: {},
            };
            objects.set(object.id, object);
          } else if ("write" in operation) {
            const op = operation.write;
            object = objects.get(op.objectId.value);
            if (!object) {
              throw new Error("missing test object");
            }
            const offset = Number(op.offset);
            const bytes = Buffer.alloc(
              Math.max(object.bytes.length, offset + op.data.length)
            );
            object.bytes.copy(bytes);
            op.data.copy(bytes, offset);
            object.bytes = bytes;
          } else if ("update" in operation) {
            const op = operation.update;
            object = objects.get(op.objectId.value);
            if (!object) {
              throw new Error("missing test object");
            }
            for (const xattr of op.xattrs) {
              object.xattrs[xattr.name] = xattr.value;
            }
          } else if ("rename" in operation) {
            const op = operation.rename;
            object = objects.get(op.objectId.value);
            if (!object) {
              throw new Error("missing test object");
            }
            for (const existing of objects.values()) {
              if (
                existing.parentId === op.parentId.value &&
                existing.name === op.name &&
                existing.id !== object.id
              ) {
                objects.delete(existing.id);
              }
            }
            object.parentId = op.parentId.value;
            object.name = op.name;
          } else {
            objects.delete(operation.remove.objectId.value);
          }
          if (hooks.afterApply(operation)) {
            failure(callback, "UNAVAILABLE", status.UNAVAILABLE);
            return;
          }
          callback(null, {
            results: [
              {
                mutation: object
                  ? { object: attr(object), related: [] }
                  : { related: [] },
              },
            ],
          });
        } finally {
          done.resolve();
          session.admitted.delete(done.promise);
        }
      })();
    },
  });
  const port = await new Promise<number>((resolve, reject) =>
    server.bindAsync(
      "127.0.0.1:0",
      ServerCredentials.createInsecure(),
      (error, port) => (error ? reject(error) : resolve(port))
    )
  );
  return {
    endpoint: `http://127.0.0.1:${port}`,
    calls,
    operations,
    objects,
    hooks,
    sessions,
    close: () => server.forceShutdown(),
  };
}
