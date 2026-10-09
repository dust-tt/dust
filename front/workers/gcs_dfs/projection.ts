import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";

import { getRedisStreamClient } from "@app/lib/api/redis";
import { DfsClient } from "@app/lib/dfs/client";
import { DfsGrpcTransport } from "@app/lib/dfs/grpc_transport";
import { newDfsObjectId } from "@app/lib/dfs/object_id";
import { DfsError } from "@app/types/dfs";
import type { DfsAttr, DfsGrant, DfsOperation } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { RedisImportCoordinator } from "@app/workers/gcs_dfs/coordination";
import type {
  ImportCoordinator,
  ImportOwnership,
} from "@app/workers/gcs_dfs/coordination";
import type {
  Projection,
  ProjectionSession,
} from "@app/workers/gcs_dfs/processor";
import {
  CHUNK_BYTES,
  CursorSchema,
  GcsDfsError,
  MAX_OBJECT_BYTES,
  sameCursor,
  projectionName,
} from "@app/workers/gcs_dfs/protocol";
import type {
  Binding,
  Cursor,
  Publication,
  Source,
  WorkerConfig,
} from "@app/workers/gcs_dfs/protocol";
import { ignoreObservation } from "@app/workers/gcs_dfs/telemetry";
import type { Observer, Operation } from "@app/workers/gcs_dfs/telemetry";

const DFS_KEY_CHARACTERS = 64;
const MAX_DIRECTORY_GRANTS = 512;
const CURSOR_XATTR = "dust.gcs.cursor";
const METADATA_XATTR = "dust.gcs.metadata";

function value<T>(result: Result<T, DfsError>): T {
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

function cursorFrom(object: DfsAttr | null): Cursor | null {
  if (!object) {
    return null;
  }
  const bytes = object.metadata?.xattrs[CURSOR_XATTR];
  if (!bytes || object.directory) {
    throw new DfsError(
      "invalid_response",
      "The import destination contains an unmanaged object."
    );
  }
  return CursorSchema.parse(JSON.parse(Buffer.from(bytes).toString("utf8")));
}

async function lookup(
  client: DfsClient,
  binding: Binding,
  source: Source
): Promise<DfsAttr | null> {
  const [result] = value(
    await client.lookup({
      targets: [
        { parentId: binding.directoryId, name: projectionName(source) },
      ],
      includeMetadata: true,
    })
  ).results;
  if (result.status === "ok") {
    return result.object;
  }
  if (result.errorCode === "not_found") {
    return null;
  }
  throw new DfsError(result.errorCode);
}

async function revoke(client: DfsClient, sessionId: string) {
  const result = await client.revokeSession({ sessionId });
  if (result.isErr() && result.error.code !== "not_found") {
    throw result.error;
  }
}

function grantIdentity(grant: DfsGrant): string {
  return JSON.stringify(
    grant.type === "allow"
      ? [grant.type, grant.subject, grant.mode]
      : [grant.type, grant.mode]
  );
}

async function verifyDirectories(
  admin: DfsClient,
  client: DfsClient,
  binding: Binding
) {
  for (const directoryId of [binding.stagingDirectoryId, binding.directoryId]) {
    const [result] = value(
      await client.stat({ objectIds: [directoryId] })
    ).results;
    if (result.status === "error") {
      throw new DfsError(result.errorCode);
    }
    if (!result.object.directory) {
      throw new DfsError("not_directory");
    }
    const expected: DfsGrant[] = [
      { type: "deny", mode: 6 },
      { type: "allow", subject: binding.writerSubject, mode: 6 },
      ...(directoryId === binding.directoryId
        ? [...new Set(binding.readers)].map((subject): DfsGrant => ({
            type: "allow",
            subject,
            mode: 4,
          }))
        : []),
    ];
    const actual = value(
      await admin.listGrants({
        objectId: directoryId,
        limit: MAX_DIRECTORY_GRANTS,
      })
    );
    if (
      actual.nextAfter ||
      JSON.stringify(actual.grants.map(grantIdentity).sort()) !==
        JSON.stringify(expected.map(grantIdentity).sort())
    ) {
      throw new DfsError(
        "forbidden",
        "Import directory grants differ from the trusted binding."
      );
    }
  }
}

class DfsImportAttempt implements ProjectionSession {
  private stagedId: string | undefined;
  private readonly hashes: string[] = [];
  private size = 0;

  constructor(
    private readonly binding: Binding,
    private readonly source: Source,
    private readonly client: DfsClient,
    private readonly ownership: ImportOwnership,
    private readonly observe: Observer
  ) {}

  private async measured<T>(
    operation: Operation,
    run: () => Promise<T>,
    bytes?: number
  ) {
    const startMs = Date.now();
    try {
      const result = await run();
      this.observe({
        operation,
        outcome: "success",
        durationMs: Date.now() - startMs,
        bytes,
      });
      return result;
    } catch (error) {
      this.observe({
        operation,
        outcome: "error",
        durationMs: Date.now() - startMs,
      });
      throw error;
    }
  }

  private async apply(operation: DfsOperation) {
    await this.ownership.assert();
    const [result] = value(
      await this.client.apply({ operations: [operation] })
    ).results;
    if (result.status === "error") {
      throw new DfsError(result.errorCode);
    }
    return result.mutation;
  }

  private async ensureStaged() {
    if (!this.stagedId) {
      const objectId = newDfsObjectId();
      await this.apply({
        type: "create",
        parentId: this.binding.stagingDirectoryId,
        name: objectId,
        objectId,
        directory: false,
      });
      this.stagedId = objectId;
    }
    return this.stagedId;
  }

  async cursor(): Promise<Cursor | null> {
    return this.measured("dfs_cursor", async () => {
      await this.ownership.assert();
      return cursorFrom(await lookup(this.client, this.binding, this.source));
    });
  }

  async stage(_binding: Binding, hash: string, bytes: Uint8Array) {
    await this.measured(
      "dfs_stage",
      async () => {
        if (
          bytes.length > CHUNK_BYTES ||
          this.size + bytes.length > MAX_OBJECT_BYTES ||
          createHash("sha256").update(bytes).digest("hex") !== hash
        ) {
          throw new GcsDfsError("content_size_mismatch");
        }
        const objectId = await this.ensureStaged();
        await this.apply({
          type: "write",
          objectId,
          offset: this.size,
          data: bytes,
          append: false,
        });
        this.size += bytes.length;
        this.hashes.push(hash);
      },
      bytes.length
    );
  }

  async publish(
    _binding: Binding,
    publication: Publication
  ): Promise<"applied" | "stale"> {
    return this.measured<"applied" | "stale">("dfs_publish", async () => {
      await this.ownership.assert();
      if (
        publication.bucket !== this.source.bucket ||
        publication.name !== this.source.name ||
        publication.tenant !== this.binding.tenant
      ) {
        throw new GcsDfsError("source_version_mismatch");
      }
      const current = await lookup(this.client, this.binding, this.source);
      const cursor = cursorFrom(current);
      if (
        cursor
          ? !publication.expected || !sameCursor(cursor, publication.expected)
          : publication.expected !== null
      ) {
        throw new GcsDfsError("source_cursor_changed");
      }
      if (publication.deleted) {
        if (current) {
          await this.apply({
            type: "remove",
            objectId: current.id,
            directory: false,
          });
        }
        return "applied";
      }
      if (
        this.size !== publication.size ||
        JSON.stringify(this.hashes) !== JSON.stringify(publication.chunks)
      ) {
        throw new GcsDfsError("content_size_mismatch");
      }
      const objectId = await this.ensureStaged();
      await this.apply({
        type: "update",
        objectId,
        mtimeMs: publication.mtime_ms,
        mimeType: publication.metadata.contentType,
        xattrs: [
          {
            name: CURSOR_XATTR,
            value: Buffer.from(JSON.stringify(CursorSchema.parse(publication))),
          },
          {
            name: METADATA_XATTR,
            value: Buffer.from(JSON.stringify(publication.metadata)),
          },
        ],
      });
      await this.apply({
        type: "rename",
        objectId,
        parentId: this.binding.directoryId,
        name: projectionName(this.source),
        replace: true,
      });
      return "applied";
    });
  }
}

export class DfsProjection implements Projection {
  private readonly channels = new Map<string, DfsGrpcTransport>();

  constructor(
    private readonly coordinator: ImportCoordinator,
    private readonly timeoutMs: number,
    private readonly observe: Observer = ignoreObservation
  ) {}

  close() {
    for (const channel of this.channels.values()) {
      channel.close();
    }
    this.channels.clear();
  }

  private async admin(binding: Binding) {
    let channel = this.channels.get(binding.endpoint);
    if (!channel) {
      const url = new URL(binding.endpoint);
      channel = new DfsGrpcTransport({
        endpoint: `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`,
        useTls: url.protocol === "https:",
        timeoutMs: this.timeoutMs,
      });
      this.channels.set(binding.endpoint, channel);
    }
    const key = z
      .string()
      .length(DFS_KEY_CHARACTERS)
      .parse((await readFile(binding.tokenFile, "utf8")).trim());
    return new DfsClient(channel, key);
  }

  private async session<T>(
    binding: Binding,
    admin: DfsClient,
    run: (client: DfsClient, sessionId: string) => Promise<T>,
    onRevoked: () => Promise<void> = async () => {}
  ) {
    const session = value(
      await admin.createSession({ subjects: [binding.writerSubject] })
    );
    try {
      if (
        session.tenantId !== binding.tenant ||
        session.sessionKey.length !== DFS_KEY_CHARACTERS
      ) {
        throw new DfsError(
          "invalid_response",
          "The import session does not match its trusted binding."
        );
      }
      return await run(admin.withKey(session.sessionKey), session.id);
    } finally {
      await revoke(admin, session.id);
      await onRevoked();
    }
  }

  async cursor(binding: Binding, source: Source) {
    const admin = await this.admin(binding);
    return this.session(binding, admin, async (client) => {
      await verifyDirectories(admin, client, binding);
      return cursorFrom(await lookup(client, binding, source));
    });
  }

  async withSource<T>(
    binding: Binding,
    source: Source,
    run: (projection: ProjectionSession) => Promise<T>
  ): Promise<T> {
    const key = createHash("sha256")
      .update(JSON.stringify([binding.tenant, source.bucket, source.name]))
      .digest("hex");
    const admin = await this.admin(binding);
    return this.coordinator.withOwnership(key, async (ownership) => {
      if (ownership.previousSession) {
        await revoke(admin, ownership.previousSession);
      }
      await ownership.assert();
      return this.session(
        binding,
        admin,
        async (client, sessionId) => {
          await ownership.register(sessionId);
          await verifyDirectories(admin, client, binding);
          return run(
            new DfsImportAttempt(
              binding,
              source,
              client,
              ownership,
              this.observe
            )
          );
        },
        () => ownership.clearRevokedSession()
      );
    });
  }
}

export async function createDfsProjection(
  settings: WorkerConfig,
  observe: Observer = ignoreObservation
) {
  const redis = await getRedisStreamClient({ origin: "lock" });
  return new DfsProjection(
    new RedisImportCoordinator(redis),
    settings.requestTimeoutMs,
    observe
  );
}
