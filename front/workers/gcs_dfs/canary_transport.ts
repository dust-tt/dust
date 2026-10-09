import { readFile } from "node:fs/promises";

import { DfsClient } from "@app/lib/dfs/client";
import { DfsGrpcTransport } from "@app/lib/dfs/grpc_transport";
import { DfsError, isDfsObjectId } from "@app/types/dfs";
import type { DfsObjectRef } from "@app/types/dfs";
import type {
  CanaryConfig,
  CanaryReader,
  ReaderResult,
} from "@app/workers/gcs_dfs/canary";
import { GoogleHealthTransport } from "@app/workers/gcs_dfs/health_transport";
import {
  projectionName,
  TransportConfigSchema,
} from "@app/workers/gcs_dfs/protocol";
import type { Source } from "@app/workers/gcs_dfs/protocol";

const CANARY_READ_BYTES = 64 * 1024;
const DFS_KEY_CHARACTERS = 64;

export class CanaryTransport
  extends GoogleHealthTransport
  implements CanaryReader
{
  private readonly dfs: DfsGrpcTransport;

  constructor(private readonly canary: CanaryConfig) {
    super(
      TransportConfigSchema.parse({
        subscription: canary.relay.subscription,
        pubsubEndpoint: canary.pubsubEndpoint,
        requestTimeoutMs: canary.requestTimeoutMs,
        environment: canary.environment,
        cell: canary.cell,
      })
    );
    const url = new URL(canary.binding.endpoint);
    this.dfs = new DfsGrpcTransport({
      endpoint: `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`,
      useTls: url.protocol === "https:",
      timeoutMs: canary.requestTimeoutMs,
    });
  }

  close() {
    this.dfs.close();
  }

  private async reader(reader: "allowed" | "denied") {
    const file =
      reader === "allowed"
        ? this.canary.binding.allowedReaderTokenFile
        : this.canary.binding.deniedReaderTokenFile;
    const key = (await readFile(file, "utf8")).trim();
    if (key.length !== DFS_KEY_CHARACTERS) {
      throw new DfsError(
        "invalid_input",
        "The canary requires a 64-character DFS session key."
      );
    }
    const client = new DfsClient(this.dfs, key);
    await this.checkSession(client);
    return client;
  }

  private async checkSession(client: DfsClient) {
    const session = await client.currentSession();
    if (session.isErr()) {
      throw session.error;
    }
    if (session.value.tenantId !== this.canary.binding.tenant) {
      throw new DfsError(
        "invalid_input",
        "The reader session belongs to another tenant."
      );
    }
  }

  async checkReaders() {
    await this.reader("allowed");
    await this.reader("denied");
  }

  private async failure(
    client: DfsClient,
    error: DfsError
  ): Promise<ReaderResult> {
    switch (error.code) {
      case "not_found":
        return { status: "missing" };
      case "forbidden":
        await this.checkSession(client);
        return { status: "denied" };
      default:
        throw error;
    }
  }

  async read(
    source: Source,
    reader: "allowed" | "denied"
  ): Promise<ReaderResult> {
    const client = await this.reader(reader);
    let objectId: DfsObjectRef = this.canary.binding.directoryId;
    {
      const name = projectionName(source);
      const lookup = await client.lookup({
        targets: [{ parentId: objectId, name }],
      });
      if (lookup.isErr()) {
        return this.failure(client, lookup.error);
      }
      const [result] = lookup.value.results;
      if (result.status === "error") {
        return this.failure(client, new DfsError(result.errorCode));
      }
      objectId = result.object.id;
    }
    if (!isDfsObjectId(objectId)) {
      throw new DfsError(
        "invalid_response",
        "A projected file must have a real DFS object ID."
      );
    }
    const read = await client.read({
      objectId,
      offset: 0,
      length: CANARY_READ_BYTES,
    });
    if (read.isErr()) {
      return this.failure(client, read.error);
    }
    if (
      read.value.object.directory ||
      read.value.object.size > CANARY_READ_BYTES
    ) {
      throw new DfsError("capacity", "Canary content exceeds its read limit.");
    }
    if (read.value.data.length !== read.value.object.size) {
      throw new DfsError(
        "invalid_response",
        "The canary read did not return the complete file."
      );
    }
    return { status: "found", bytes: Buffer.from(read.value.data) };
  }

  async sourceExists(source: Source) {
    return (await this.metadata(source)) !== null;
  }
}
