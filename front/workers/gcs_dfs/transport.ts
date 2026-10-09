import { readFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { GoogleAuth } from "google-auth-library";
import { z } from "zod";

import type { Projection, SourceStorage } from "@app/workers/gcs_dfs/processor";
import {
  CursorSchema,
  GcsDfsError,
  MessageSchema,
  MetadataSchema,
} from "@app/workers/gcs_dfs/protocol";
import type {
  Binding,
  Metadata,
  Publication,
  Source,
  WorkerConfig,
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
        return JSON.parse(Buffer.concat(buffers).toString("utf8"));
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

  constructor(private readonly config: WorkerConfig) {}

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

  private async subscriptionRequest(method: string, body: unknown) {
    const path = `/v1/${this.config.subscription}:${method}`;
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
      : await this.request(`https://pubsub.googleapis.com${path}`, init);
    if (!response.ok) {
      await response.body?.cancel();
      throw new RemoteError(response.status);
    }
    return readJson(response, 16 * 1024 * 1024);
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
        yield z.instanceof(Buffer).parse(bytes);
      }
    } finally {
      response.destroy();
    }
  }
}

export class DfsProjection implements Projection {
  constructor(private readonly requestTimeoutMs: number) {}

  private async request(
    binding: Binding,
    path: string,
    body: string | Uint8Array,
    headers: Record<string, string>
  ) {
    const token = (await readFile(binding.tokenFile, "utf8")).trim();
    if (!token || token.length > 4096) {
      throw new GcsDfsError("invalid_import_token");
    }
    const response = await fetch(new URL(path, binding.endpoint), {
      method: "POST",
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: Buffer.from(body),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 409) {
        throw new GcsDfsError("source_cursor_changed");
      }
      throw new RemoteError(response.status);
    }
    return readJson(response, 16 * 1024);
  }

  async cursor(binding: Binding, source: Source) {
    return CursorSchema.nullable().parse(
      await this.request(
        binding,
        "/v1/import/cursor",
        JSON.stringify({ ...source, tenant: binding.tenant }),
        { "Content-Type": "application/json" }
      )
    );
  }

  async stage(binding: Binding, hash: string, bytes: Uint8Array) {
    await this.request(binding, "/v1/import/chunks", bytes, {
      "Content-Type": "application/octet-stream",
      "X-Content-SHA256": hash,
    });
  }

  async publish(binding: Binding, publication: Publication) {
    return z
      .object({ outcome: z.enum(["applied", "stale"]) })
      .parse(
        await this.request(
          binding,
          "/v1/import/publish",
          JSON.stringify(publication),
          { "Content-Type": "application/json" }
        )
      ).outcome;
  }
}
