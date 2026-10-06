// @vitest-environment node

import { randomUUID } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSendgridWebhookContent } from "@app/lib/api/assistant/email/webhook_helpers";
import { describe, expect, it } from "vitest";

async function encodeSendgridForm(form: FormData) {
  const encoded = new Request("http://localhost/", {
    method: "POST",
    body: form,
  });
  const rawBody = Buffer.from(await encoded.arrayBuffer());
  return {
    rawBody,
    headers: {
      "content-type": encoded.headers.get("content-type") ?? "",
      "content-length": String(rawBody.length),
    },
  };
}

async function tmpdirContains(payload: string): Promise<boolean> {
  const dir = tmpdir();
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    const stats = await stat(path).catch(() => null);
    if (!stats?.isFile() || stats.size !== Buffer.byteLength(payload)) {
      continue;
    }
    if ((await readFile(path, "utf8").catch(() => null)) === payload) {
      return true;
    }
  }
  return false;
}

describe("parseSendgridWebhookContent", () => {
  it("returns supported attachments in memory without writing any part to disk", async () => {
    const supportedPayload = `supported-${randomUUID()}`;
    const unsupportedPayload = `unsupported-${randomUUID()}`;

    const form = new FormData();
    form.set("subject", "Hello agent");
    form.set("text", "Hello");
    form.set("from", "sender@example.com");
    form.set(
      "envelope",
      JSON.stringify({ from: "sender@example.com", to: ["agent@dust.team"] })
    );
    form.set(
      "attachment1",
      new Blob([supportedPayload], { type: "text/plain" }),
      "notes.txt"
    );
    form.set(
      "attachment2",
      new Blob([unsupportedPayload], { type: "application/x-msdownload" }),
      "payload.exe"
    );
    form.set("attachment3", new Blob([], { type: "text/plain" }), "empty.txt");
    form.set(
      "attachment4",
      new Blob([unsupportedPayload], { type: "constructor" }),
      "prototype-key.bin"
    );

    const { rawBody, headers } = await encodeSendgridForm(form);
    const result = await parseSendgridWebhookContent(rawBody, headers);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.attachments).toHaveLength(1);
    const [attachment] = result.value.attachments;
    expect(attachment.filename).toBe("notes.txt");
    expect(attachment.contentType).toBe("text/plain");
    expect(attachment.size).toBe(Buffer.byteLength(supportedPayload));
    expect(attachment.content.toString("utf8")).toBe(supportedPayload);

    expect(await tmpdirContains(supportedPayload)).toBe(false);
    expect(await tmpdirContains(unsupportedPayload)).toBe(false);
  });
});
