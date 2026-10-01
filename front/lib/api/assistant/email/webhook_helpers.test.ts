import { existsSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { describe, expect, it } from "vitest";
import {
  cleanupInboundEmailTempFiles,
  INBOUND_EMAIL_UPLOAD_DIR_PREFIX,
  parseSendgridWebhookContent,
} from "./webhook_helpers";

function inboundEmailUploadDirs(): string[] {
  return readdirSync(tmpdir()).filter((name) =>
    name.startsWith(INBOUND_EMAIL_UPLOAD_DIR_PREFIX)
  );
}

type MultipartPart =
  | { name: string; value: string }
  | { name: string; filename: string; contentType: string; content: string };

// Built by hand so the bytes match what SendGrid posts. jsdom's FormData
// drops the filename and names every file part "blob".
function encodeMultipart(parts: MultipartPart[]): {
  rawBody: Buffer;
  headers: Record<string, string>;
} {
  const boundary = "----dust-email-test";
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if ("filename" in part) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
            `Content-Type: ${part.contentType}\r\n\r\n`
        )
      );
      chunks.push(Buffer.from(part.content));
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}`
        )
      );
    }
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const rawBody = Buffer.concat(chunks);
  return {
    rawBody,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(rawBody.length),
    },
  };
}

function baseParts(): MultipartPart[] {
  return [
    { name: "subject", value: "Hello" },
    { name: "text", value: "Body" },
    { name: "from", value: "Alice <alice@example.com>" },
    { name: "SPF", value: "pass" },
    { name: "dkim", value: "{@example.com : pass}" },
    {
      name: "envelope",
      value: JSON.stringify({
        from: "alice@example.com",
        to: ["agent@dust.team"],
      }),
    },
    { name: "headers", value: "Message-ID: <msg@example.com>" },
  ];
}

describe("parseSendgridWebhookContent", () => {
  it("keeps supported attachments until cleanup and drops the rest immediately", async () => {
    const before = new Set(inboundEmailUploadDirs());
    const { rawBody, headers } = encodeMultipart([
      ...baseParts(),
      {
        name: "attachment1",
        filename: "note.txt",
        contentType: "text/plain",
        content: "hello",
      },
      {
        name: "attachment2",
        filename: "run.exe",
        contentType: "application/x-msdownload",
        content: "bin",
      },
      {
        name: "attachment3",
        filename: "empty.txt",
        contentType: "text/plain",
        content: "",
      },
    ]);
    const result = await parseSendgridWebhookContent(rawBody, headers);

    try {
      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        return;
      }

      expect(result.value.email.attachments).toEqual([
        expect.objectContaining({
          filename: "note.txt",
          contentType: "text/plain",
          size: Buffer.byteLength("hello"),
        }),
      ]);
      const attachment = result.value.email.attachments[0];
      expect(existsSync(attachment.filepath)).toBe(true);
      expect(readdirSync(result.value.attachmentTempDir)).toEqual([
        attachment.filepath.split("/").pop(),
      ]);
    } finally {
      if (result.isOk()) {
        await cleanupInboundEmailTempFiles(result.value.attachmentTempDir);
      }
    }

    if (result.isErr()) {
      return;
    }
    expect(existsSync(result.value.email.attachments[0]?.filepath ?? "")).toBe(
      false
    );
    const leaked = inboundEmailUploadDirs().filter((name) => !before.has(name));
    expect(leaked).toEqual([]);
  });

  it("removes temp files when the multipart body cannot be parsed", async () => {
    const before = new Set(inboundEmailUploadDirs());
    const { rawBody, headers } = encodeMultipart([
      { name: "from", value: "Alice <alice@example.com>" },
      {
        name: "attachment1",
        filename: "note.txt",
        contentType: "text/plain",
        content: "hello",
      },
    ]);
    const result = await parseSendgridWebhookContent(rawBody, headers);

    expect(result.isErr()).toBe(true);
    const leaked = inboundEmailUploadDirs().filter((name) => !before.has(name));
    expect(leaked).toEqual([]);
  });
});
