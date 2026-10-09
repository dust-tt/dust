import { createHash } from "node:crypto";
import { ignoreObservation } from "@app/workers/gcs_dfs/telemetry";
import type { Observer } from "@app/workers/gcs_dfs/telemetry";

import {
  CHUNK_BYTES,
  sameCursor,
  GcsDfsError,
  MAX_OBJECT_BYTES,
  parseNotification,
} from "@app/workers/gcs_dfs/protocol";
import type {
  Binding,
  Cursor,
  Message,
  Metadata,
  Publication,
  Source,
} from "@app/workers/gcs_dfs/protocol";

export interface SourceStorage {
  metadata(source: Source, generation?: string): Promise<Metadata | null>;
  content(metadata: Metadata): AsyncIterable<Uint8Array>;
}

export interface ProjectionSession {
  cursor(binding: Binding, source: Source): Promise<Cursor | null>;
  stage(binding: Binding, hash: string, bytes: Uint8Array): Promise<void>;
  publish(
    binding: Binding,
    publication: Publication
  ): Promise<"applied" | "stale">;
}

export interface Projection extends Pick<ProjectionSession, "cursor"> {
  withSource<T>(
    binding: Binding,
    source: Source,
    run: (projection: ProjectionSession) => Promise<T>
  ): Promise<T>;
}

async function stageContent(
  storage: SourceStorage,
  projection: ProjectionSession,
  binding: Binding,
  metadata: Metadata
) {
  const size = BigInt(metadata.size);
  if (size > BigInt(MAX_OBJECT_BYTES)) {
    throw new GcsDfsError("object_too_large");
  }
  const chunks: string[] = [];
  let pending = Buffer.alloc(CHUNK_BYTES);
  let usedBytes = 0;
  let receivedBytes = 0;
  const stage = async () => {
    const bytes = pending.subarray(0, usedBytes);
    const hash = createHash("sha256").update(bytes).digest("hex");
    await projection.stage(binding, hash, bytes);
    chunks.push(hash);
    pending = Buffer.alloc(CHUNK_BYTES);
    usedBytes = 0;
  };
  for await (const bytes of storage.content(metadata)) {
    receivedBytes += bytes.length;
    if (receivedBytes > Number(size)) {
      throw new GcsDfsError("content_size_mismatch");
    }
    let offset = 0;
    while (offset < bytes.length) {
      const length = Math.min(CHUNK_BYTES - usedBytes, bytes.length - offset);
      pending.set(bytes.subarray(offset, offset + length), usedBytes);
      usedBytes += length;
      offset += length;
      if (usedBytes === CHUNK_BYTES) {
        await stage();
      }
    }
  }
  if (receivedBytes !== Number(size)) {
    throw new GcsDfsError("content_size_mismatch");
  }
  if (usedBytes > 0) {
    await stage();
  }
  return chunks;
}

async function processAttempt(
  message: Message,
  bindings: Binding[],
  storage: SourceStorage,
  projection: ProjectionSession,
  observe: Observer = ignoreObservation
): Promise<"applied" | "stale"> {
  const notification = parseNotification(message, bindings);
  const { binding } = notification;
  const source = {
    bucket: notification.metadata.bucket,
    name: notification.metadata.name,
  };
  const existing = await projection.cursor(binding, source);
  const current = await storage.metadata(source);
  if (
    current &&
    (current.bucket !== source.bucket || current.name !== source.name)
  ) {
    throw new GcsDfsError("source_version_mismatch");
  }
  const metadata = current ?? notification.metadata;
  const cursor: Cursor = current
    ? {
        generation: current.generation,
        metageneration: current.metageneration,
        deleted: false,
      }
    : { ...(existing ?? notification.cursor), deleted: true };
  if (existing && sameCursor(existing, cursor)) {
    return "stale";
  }
  if (
    existing &&
    existing.generation === cursor.generation &&
    (existing.deleted ||
      (!cursor.deleted &&
        BigInt(existing.metageneration) > BigInt(cursor.metageneration)))
  ) {
    throw new GcsDfsError("source_version_mismatch");
  }
  if (Buffer.byteLength(JSON.stringify(metadata)) > 64 * 1024) {
    throw new GcsDfsError("metadata_too_large");
  }
  const chunks = cursor.deleted
    ? []
    : await stageContent(storage, projection, binding, metadata);
  const outcome = await projection.publish(binding, {
    ...source,
    ...cursor,
    tenant: binding.tenant,
    expected: existing,
    size: cursor.deleted ? 0 : Number(metadata.size),
    chunks,
    readers: cursor.deleted ? [] : binding.readers,
    mtime_ms: Date.parse(metadata.updated),
    metadata,
  });
  observe({
    operation: cursor.deleted
      ? "delete"
      : existing && !existing.deleted
        ? "update"
        : "create",
    outcome,
  });
  return outcome;
}

export async function processNotification(
  message: Message,
  bindings: Binding[],
  storage: SourceStorage,
  projection: Projection,
  observe: Observer = ignoreObservation
): Promise<"applied" | "stale"> {
  const { binding, metadata } = parseNotification(message, bindings);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await projection.withSource(binding, metadata, (session) =>
        processAttempt(message, bindings, storage, session, observe)
      );
    } catch (error) {
      if (
        !(error instanceof GcsDfsError) ||
        error.reason !== "source_cursor_changed"
      ) {
        throw error;
      }
      if (attempt < 4) {
        observe({
          operation: "cas_retry",
          outcome: "error",
          errorClass: "source_cursor_changed",
        });
      }
    }
  }
  throw new GcsDfsError("source_cursor_changed");
}
