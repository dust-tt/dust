import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { ignoreObservation, errorClass } from "@app/workers/gcs_dfs/telemetry";
import type { Observer } from "@app/workers/gcs_dfs/telemetry";
import { GoogleAuth } from "google-auth-library";
import { z } from "zod";

import type { SourceStorage } from "@app/workers/gcs_dfs/processor";
import {
  GcsDfsError,
  MessageSchema,
  MetadataSchema,
} from "@app/workers/gcs_dfs/protocol";
import type {
  Metadata,
  Message,
  Source,
  TransportConfig,
} from "@app/workers/gcs_dfs/protocol";

export class RemoteError extends Error {
  constructor(readonly statusCode: number) {
    super("remote_request_failed");
  }
}

export async function readJson(
  response: Response,
  maxBytes: number
): Promise<unknown> {
  return JSON.parse((await readBytes(response, maxBytes)).toString("utf8"));
}

export async function readBytes(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
  if (!response.body) {
    throw new RemoteError(503);
  }
  const reader = response.body.getReader();
  const buffers: Uint8Array[] = [];
  let sizeBytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) {
        return Buffer.concat(buffers);
      }
      sizeBytes += next.value.byteLength;
      if (sizeBytes > maxBytes) {
        throw new GcsDfsError("response_too_large");
      }
      buffers.push(next.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export class GoogleTransport implements SourceStorage {
  private readonly auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  constructor(
    protected readonly config: TransportConfig,
    private readonly observe: Observer = ignoreObservation
  ) {}

  protected async request(url: string, init: RequestInit = {}) {
    const token = await this.auth.getAccessToken();
    return fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      redirect: "error",
    });
  }

  private async pubsubRequest(resource: string, method: string, body: unknown) {
    const path = `/v1/${resource}:${method}`;
    const init = {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    };
    const response = this.config.pubsubEmulatorHost
      ? await fetch(`http://${this.config.pubsubEmulatorHost}${path}`, {
          ...init,
          signal: AbortSignal.timeout(this.config.requestTimeoutMs),
          redirect: "error",
        })
      : await this.request(`${this.config.pubsubEndpoint}${path}`, init);
    if (!response.ok) {
      await response.body?.cancel();
      throw new RemoteError(response.status);
    }
    return readJson(response, 16 * 1024 * 1024);
  }

  private async subscriptionRequest(
    method: "pull" | "acknowledge" | "modifyAckDeadline",
    body: unknown
  ) {
    const operation = method === "modifyAckDeadline" ? "lease" : method;
    const startedMs = Date.now();
    try {
      const result = await this.pubsubRequest(
        this.config.subscription,
        method,
        body
      );
      this.observe({
        operation,
        outcome: "success",
        durationMs: Date.now() - startedMs,
      });
      return result;
    } catch (error) {
      this.observe({
        operation,
        outcome: "error",
        errorClass: errorClass(error),
      });
      throw error;
    }
  }

  async publish(
    topic: string,
    message: Message["message"],
    orderingKey: string
  ) {
    const startedMs = Date.now();
    try {
      const result = await this.pubsubRequest(topic, "publish", {
        messages: [
          { data: message.data, attributes: message.attributes, orderingKey },
        ],
      });
      z.object({ messageIds: z.array(z.string().min(1)).length(1) }).parse(
        result
      );
      this.observe({
        operation: "relay_publish",
        outcome: "success",
        durationMs: Date.now() - startedMs,
      });
    } catch (error) {
      this.observe({
        operation: "relay_publish",
        outcome: "error",
        errorClass: errorClass(error),
      });
      throw error;
    }
  }

  async pull() {
    return z
      .object({ receivedMessages: z.array(MessageSchema).max(64).default([]) })
      .parse(
        await this.subscriptionRequest("pull", {
          maxMessages: this.config.concurrency,
        })
      ).receivedMessages;
  }

  async acknowledge(ackIds: string[]) {
    if (ackIds.length > 0) {
      await this.subscriptionRequest("acknowledge", { ackIds });
    }
  }

  async lease(ackIds: string[], ackDeadlineSeconds: number) {
    if (ackIds.length > 0) {
      await this.subscriptionRequest("modifyAckDeadline", {
        ackIds,
        ackDeadlineSeconds,
      });
    }
  }

  private objectUrl(source: Source, generation?: string) {
    const url = new URL(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(source.bucket)}/o/${encodeURIComponent(source.name)}`
    );
    if (generation) {
      url.searchParams.set("generation", generation);
    }
    return url;
  }

  async metadata(source: Source, generation?: string) {
    const startedMs = Date.now();
    try {
      const result = await this.readMetadata(source, generation);
      this.observe({
        operation: "source_metadata",
        outcome: "success",
        durationMs: Date.now() - startedMs,
      });
      return result;
    } catch (error) {
      this.observe({
        operation: "source_metadata",
        outcome: "error",
        errorClass: errorClass(error),
      });
      throw error;
    }
  }

  private async readMetadata(source: Source, generation?: string) {
    const response = await this.request(
      this.objectUrl(source, generation).href
    );
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new RemoteError(response.status);
    }
    return MetadataSchema.parse(await readJson(response, 64 * 1024));
  }

  async *content(metadata: Metadata) {
    try {
      yield* this.readContent(metadata);
    } catch (error) {
      this.observe({
        operation: "source_content",
        outcome: "error",
        errorClass: errorClass(error),
      });
      throw error;
    }
  }

  private async *readContent(metadata: Metadata) {
    const url = this.objectUrl(metadata, metadata.generation);
    url.searchParams.set("alt", "media");
    const token = await this.auth.getAccessToken();
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const request = httpsRequest(
        url,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Accept-Encoding": "gzip",
          },
          signal: AbortSignal.timeout(this.config.requestTimeoutMs),
        },
        resolve
      );
      request.once("error", reject);
      request.end();
    });
    if (response.statusCode !== 200) {
      response.destroy();
      throw new RemoteError(response.statusCode ?? 503);
    }
    try {
      for await (const bytes of response) {
        const chunk = z.instanceof(Buffer).parse(bytes);
        this.observe({
          operation: "source_content",
          outcome: "success",
          bytes: chunk.length,
        });
        yield chunk;
      }
    } finally {
      response.destroy();
    }
  }
}
