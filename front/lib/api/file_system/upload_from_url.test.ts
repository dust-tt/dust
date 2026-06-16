import { createConversation } from "@app/lib/api/assistant/conversation";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { uploadFileFromUrlToFileSystem } from "@app/lib/api/file_system/upload_from_url";
import { untrustedFetch } from "@app/lib/egress/server";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Readable } from "stream";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/egress/server", () => ({
  untrustedFetch: vi.fn(),
}));

vi.mock("@app/lib/api/url_safety", () => ({
  validateExternalUrl: vi.fn().mockResolvedValue(null),
}));

function asUntrustedFetchResponse(
  response: Pick<
    Awaited<ReturnType<typeof untrustedFetch>>,
    "ok" | "status" | "statusText" | "headers" | "body"
  >
): Awaited<ReturnType<typeof untrustedFetch>> {
  return response as unknown as Awaited<ReturnType<typeof untrustedFetch>>;
}

function mockFetchResponse({
  ok = true,
  status = 200,
  statusText = "OK",
  contentType = "text/plain",
  contentLength,
  body,
}: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  contentType?: string;
  contentLength?: string;
  body?: string;
}) {
  const headers = new Headers({ "content-type": contentType });
  if (contentLength !== undefined) {
    headers.set("content-length", contentLength);
  }

  vi.mocked(untrustedFetch).mockResolvedValue(
    asUntrustedFetchResponse({
      ok,
      status,
      statusText,
      headers,
      body: body === undefined ? null : Readable.toWeb(Readable.from([body])),
    })
  );
}

describe("uploadFileFromUrlToFileSystem", () => {
  it("rejects invalid URLs", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    const fsResult = await DustFileSystem.forConversation(auth, conversation);
    expect(fsResult.isOk()).toBe(true);
    if (!fsResult.isOk()) {
      return;
    }

    const result = await uploadFileFromUrlToFileSystem(fsResult.value, {
      path: `conversation-${conversation.sId}/notes.txt`,
      url: "not-a-url",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Invalid URL");
    }
  });

  it("uploads a file from a public HTTP URL", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    mockFetchResponse({
      body: "hello from url",
      contentType: "text/plain",
      contentLength: "15",
    });

    const fsResult = await DustFileSystem.forConversation(auth, conversation);
    expect(fsResult.isOk()).toBe(true);
    if (!fsResult.isOk()) {
      return;
    }

    const path = `conversation-${conversation.sId}/imported-${Date.now()}.txt`;
    const result = await uploadFileFromUrlToFileSystem(fsResult.value, {
      path,
      url: "http://example.com/imported.txt",
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }

    expect(result.value.contentType).toBe("text/plain");
    expect(result.value.sizeBytes).toBe(15);
  });

  it("uploads a file from a public HTTPS URL", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    mockFetchResponse({
      body: "hello from url",
      contentType: "text/plain",
      contentLength: "15",
    });

    const fsResult = await DustFileSystem.forConversation(auth, conversation);
    expect(fsResult.isOk()).toBe(true);
    if (!fsResult.isOk()) {
      return;
    }

    const path = `conversation-${conversation.sId}/imported-${Date.now()}.txt`;
    const result = await uploadFileFromUrlToFileSystem(fsResult.value, {
      path,
      url: "https://example.com/imported.txt",
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }

    expect(result.value.contentType).toBe("text/plain");
    expect(result.value.sizeBytes).toBe(15);
  });

  it("returns an error when the remote file exceeds the size limit", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    mockFetchResponse({
      contentType: "application/pdf",
      contentLength: String(60 * 1024 * 1024),
      body: "ignored",
    });

    const fsResult = await DustFileSystem.forConversation(auth, conversation);
    expect(fsResult.isOk()).toBe(true);
    if (!fsResult.isOk()) {
      return;
    }

    const result = await uploadFileFromUrlToFileSystem(fsResult.value, {
      path: `conversation-${conversation.sId}/large.pdf`,
      url: "https://example.com/large.pdf",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("maximum supported size");
    }
  });

  it("rejects frame content types", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    mockFetchResponse({
      contentType: "application/vnd.dust.frame",
      body: "<html></html>",
    });

    const fsResult = await DustFileSystem.forConversation(auth, conversation);
    expect(fsResult.isOk()).toBe(true);
    if (!fsResult.isOk()) {
      return;
    }

    const result = await uploadFileFromUrlToFileSystem(fsResult.value, {
      path: `conversation-${conversation.sId}/frame.html`,
      url: "https://example.com/frame.html",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("interactive_content");
    }
  });
});
