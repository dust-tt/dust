import type { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  collectAttachmentFilePaths,
  MAX_ATTACHMENTS_PER_EMAIL,
  MAX_SEND_MAIL_REQUEST_BYTES,
  TOOLS,
} from "@app/lib/api/actions/servers/outlook/tools/mail";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getFileMock } = vi.hoisted(() => ({ getFileMock: vi.fn() }));

vi.mock("@app/lib/actions/mcp_internal_actions/utils/file_utils", () => ({
  getFileFromConversationAttachment: getFileMock,
  sanitizeFilename: (name: string) => name,
}));

vi.mock("@app/lib/actions/types", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/actions/types")>()),
  isAgentLoopRunContext: () => true,
}));

const fetchMock = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFiles(files: Record<string, number>) {
  getFileMock.mockImplementation(async (_auth, path: string) => {
    const size = files[path];
    if (size === undefined) {
      return new Err(new Error("not found"));
    }
    return new Ok({
      buffer: Buffer.alloc(size, 1),
      filename: path.split("/").pop(),
      contentType: "application/pdf",
    });
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

async function callTool(name: string, params: Record<string, unknown>) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }
  const extra = {
    auth: {},
    authInfo: { token: "token", clientId: "client", scopes: [] },
    runContext: {},
    requestId: "test",
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error("Unexpected MCP request");
    },
    signal: new AbortController().signal,
  } as unknown as ToolHandlerExtra;
  const handler = tool.handler as unknown as (
    params: Record<string, unknown>,
    extra: ToolHandlerExtra
  ) => Promise<Result<unknown, MCPError>>;
  return handler(params, extra);
}

const baseDraft = {
  to: ["a@example.com"],
  subject: "Docs",
  contentType: "text",
  body: "Hello",
};

describe("collectAttachmentFilePaths", () => {
  it("keeps the legacy single path working", () => {
    const res = collectAttachmentFilePaths({ attachmentFilePath: "c/a.pdf" });
    expect(res.isOk() && res.value).toEqual(["c/a.pdf"]);
  });

  it("merges single and multiple paths without duplicates", () => {
    const res = collectAttachmentFilePaths({
      attachmentFilePath: "c/a.pdf",
      attachmentFilePaths: ["c/a.pdf", "c/b.pdf"],
    });
    expect(res.isOk() && res.value).toEqual(["c/a.pdf", "c/b.pdf"]);
  });

  it("rejects more than the maximum number of attachments", () => {
    const res = collectAttachmentFilePaths({
      attachmentFilePaths: Array.from(
        { length: MAX_ATTACHMENTS_PER_EMAIL + 1 },
        (_, i) => `c/${i}.pdf`
      ),
    });
    expect(res.isErr()).toBe(true);
  });
});

describe("Outlook create_draft attachments", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    getFileMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("adds every requested file to a single draft", async () => {
    mockFiles({ "c/a.pdf": 100, "c/b.pdf": 200 });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "draft-1" }))
      .mockResolvedValueOnce(jsonResponse({}, 201))
      .mockResolvedValueOnce(jsonResponse({}, 201));

    const res = await callTool("create_draft", {
      ...baseDraft,
      attachmentFilePaths: ["c/a.pdf", "c/b.pdf"],
    });

    expect(res.isOk()).toBe(true);
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      expect.stringMatching(/\/messages$/),
      expect.stringMatching(/\/messages\/draft-1\/attachments$/),
      expect.stringMatching(/\/messages\/draft-1\/attachments$/),
    ]);
    const names = fetchMock.mock.calls
      .slice(1)
      .map(([, init]) => JSON.parse(init.body).name);
    expect(names).toEqual(["a.pdf", "b.pdf"]);
  });

  it("still supports the single attachmentFilePath parameter", async () => {
    mockFiles({ "c/a.pdf": 100 });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "draft-1" }))
      .mockResolvedValueOnce(jsonResponse({}, 201));

    const res = await callTool("create_draft", {
      ...baseDraft,
      attachmentFilePath: "c/a.pdf",
    });

    expect(res.isOk()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deletes the draft and names the failing file when an attachment fails", async () => {
    mockFiles({ "c/a.pdf": 100, "c/b.pdf": 200 });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "draft-1" }))
      .mockResolvedValueOnce(jsonResponse({}, 201))
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const res = await callTool("create_draft", {
      ...baseDraft,
      attachmentFilePaths: ["c/a.pdf", "c/b.pdf"],
    });

    expect(res.isErr()).toBe(true);
    const message = res.isErr() ? res.error.message : "";
    expect(message).toContain("attachment 2 of 2 (b.pdf)");
    expect(message).toContain("incomplete draft was deleted");
    const [lastUrl, lastInit] = fetchMock.mock.calls[3];
    expect(lastUrl).toMatch(/\/messages\/draft-1$/);
    expect(lastInit.method).toBe("DELETE");
  });

  it("reports the draft id when the cleanup of a failed draft fails too", async () => {
    mockFiles({ "c/a.pdf": 100 });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "draft-1" }))
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
      .mockResolvedValueOnce(jsonResponse({}, 500));

    const res = await callTool("create_draft", {
      ...baseDraft,
      attachmentFilePaths: ["c/a.pdf"],
    });

    expect(res.isErr()).toBe(true);
    expect(res.isErr() ? res.error.message : "").toContain("draft id: draft-1");
  });

  it("keeps the attachment error and draft id when the cleanup request rejects", async () => {
    mockFiles({ "c/a.pdf": 100 });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "draft-1" }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: "boom" } }, 500))
      .mockRejectedValueOnce(new Error("network down"));

    const res = await callTool("create_draft", {
      ...baseDraft,
      attachmentFilePaths: ["c/a.pdf"],
    });

    expect(res.isErr()).toBe(true);
    const message = res.isErr() ? res.error.message : "";
    expect(message).toContain("attachment 1 of 1 (a.pdf)");
    expect(message).toContain("boom");
    expect(message).toContain("draft id: draft-1");
  });

  it("handles a rejected attachment request and still cleans up the new draft", async () => {
    mockFiles({ "c/a.pdf": 100 });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: "draft-1" }))
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const res = await callTool("create_draft", {
      ...baseDraft,
      attachmentFilePaths: ["c/a.pdf"],
    });

    expect(res.isErr()).toBe(true);
    const message = res.isErr() ? res.error.message : "";
    expect(message).toContain("socket hang up");
    expect(message).toContain("incomplete draft was deleted");
    expect(fetchMock.mock.calls[2][1].method).toBe("DELETE");
  });

  it("accepts the maximum combined legacy and array attachments after dedupe", async () => {
    const paths = Array.from(
      { length: MAX_ATTACHMENTS_PER_EMAIL },
      (_, i) => `c/${i}.pdf`
    );
    mockFiles(Object.fromEntries(paths.map((path) => [path, 10])));
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "draft-1" }));
    for (let i = 0; i < paths.length; i++) {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, 201));
    }

    const res = await callTool("create_draft", {
      ...baseDraft,
      attachmentFilePath: paths[0],
      attachmentFilePaths: paths,
    });

    expect(res.isOk()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1 + MAX_ATTACHMENTS_PER_EMAIL);
  });

  it("rejects legacy plus array paths above the maximum before calling Outlook", async () => {
    const paths = Array.from(
      { length: MAX_ATTACHMENTS_PER_EMAIL },
      (_, i) => `c/${i}.pdf`
    );
    mockFiles(
      Object.fromEntries([...paths, "c/extra.pdf"].map((p) => [p, 10]))
    );

    const res = await callTool("create_draft", {
      ...baseDraft,
      attachmentFilePath: "c/extra.pdf",
      attachmentFilePaths: paths,
    });

    expect(res.isErr()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails before calling Outlook when a file cannot be found", async () => {
    mockFiles({ "c/a.pdf": 100 });

    const res = await callTool("create_draft", {
      ...baseDraft,
      attachmentFilePaths: ["c/a.pdf", "c/missing.pdf"],
    });

    expect(res.isErr()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Outlook send_mail attachments", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    getFileMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("inlines several small files in one sendMail request", async () => {
    mockFiles({ "c/a.pdf": 1000, "c/b.pdf": 2000 });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));

    const res = await callTool("send_mail", {
      ...baseDraft,
      attachmentFilePaths: ["c/a.pdf", "c/b.pdf"],
    });

    expect(res.isOk()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.message.attachments).toHaveLength(2);
  });

  it("refuses to send when the serialized request would exceed the budget", async () => {
    // Two 2 MB files are each under the per-file limit but about 5.3 MB once
    // base64 encoded in one request.
    mockFiles({ "c/a.pdf": 2 * 1024 * 1024, "c/b.pdf": 2 * 1024 * 1024 });

    const res = await callTool("send_mail", {
      ...baseDraft,
      attachmentFilePaths: ["c/a.pdf", "c/b.pdf"],
    });

    expect(res.isErr()).toBe(true);
    expect(res.isErr() ? res.error.message : "").toContain("Nothing was sent");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the historical single-file behavior without the aggregate budget", async () => {
    mockFiles({ "c/a.pdf": 2.9 * 1024 * 1024 });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));

    const res = await callTool("send_mail", {
      ...baseDraft,
      attachmentFilePath: "c/a.pdf",
    });

    expect(res.isOk()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends a reply with several attachments via a draft that is sent last", async () => {
    mockFiles({ "c/a.pdf": 100, "c/b.pdf": 100 });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ id: "draft-1", body: { content: "" } })
      )
      .mockResolvedValueOnce(jsonResponse({ id: "draft-1" }))
      .mockResolvedValueOnce(jsonResponse({}, 201))
      .mockResolvedValueOnce(jsonResponse({}, 201))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));

    const res = await callTool("send_mail", {
      body: "Thanks",
      replyToMessageId: "m1",
      attachmentFilePaths: ["c/a.pdf", "c/b.pdf"],
    });

    const calls = fetchMock.mock.calls.map(([url, init]) => [
      init?.method ?? "GET",
      url,
    ]);
    expect(res.isOk()).toBe(true);
    expect(calls[calls.length - 1][1]).toMatch(/\/messages\/draft-1\/send$/);
    expect(
      calls.filter(([, url]) => /draft-1\/attachments$/.test(url))
    ).toHaveLength(2);
  });
});

describe("Outlook send_mail request budget and reply failures", () => {
  const FILE_SIZE = 1024 * 1024;

  beforeEach(() => {
    fetchMock.mockReset();
    getFileMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    mockFiles({ "c/a.pdf": FILE_SIZE, "c/b.pdf": FILE_SIZE });
  });

  async function sendWithBody(body: string, extra: Record<string, unknown>) {
    return callTool("send_mail", {
      to: ["a@example.com"],
      subject: "Docs",
      contentType: "text",
      body,
      ...extra,
    });
  }

  async function baselineBytes(): Promise<number> {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    const res = await sendWithBody("x", {
      attachmentFilePaths: ["c/a.pdf", "c/b.pdf"],
    });
    expect(res.isOk()).toBe(true);
    const bytes = Buffer.byteLength(fetchMock.mock.calls[0][1].body);
    fetchMock.mockReset();
    return bytes;
  }

  it("accepts a request of exactly the budget and rejects one byte more", async () => {
    const base = await baselineBytes();
    expect(base).toBeLessThan(MAX_SEND_MAIL_REQUEST_BYTES);
    const fill = MAX_SEND_MAIL_REQUEST_BYTES - base;

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    const atLimit = await sendWithBody("x".repeat(1 + fill), {
      attachmentFilePaths: ["c/a.pdf", "c/b.pdf"],
    });
    expect(atLimit.isOk()).toBe(true);
    expect(Buffer.byteLength(fetchMock.mock.calls[0][1].body)).toBe(
      MAX_SEND_MAIL_REQUEST_BYTES
    );
    fetchMock.mockReset();

    const overLimit = await sendWithBody("x".repeat(2 + fill), {
      attachmentFilePaths: ["c/a.pdf", "c/b.pdf"],
    });
    expect(overLimit.isErr()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts UTF-8 bytes, not characters, of a large body", async () => {
    const base = await baselineBytes();
    const remainingBytes = MAX_SEND_MAIL_REQUEST_BYTES - base;
    // Fewer characters than the remaining budget, but 2 bytes each in UTF-8.
    const chars = Math.floor(remainingBytes * 0.75);
    expect(chars).toBeLessThan(remainingBytes);

    const res = await sendWithBody("é".repeat(chars), {
      attachmentFilePaths: ["c/a.pdf", "c/b.pdf"],
    });

    expect(res.isErr()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces the budget for attachmentFilePaths even when dedupe leaves one file", async () => {
    mockFiles({ "c/a.pdf": 2.9 * 1024 * 1024 });

    const res = await sendWithBody("hello", {
      attachmentFilePaths: ["c/a.pdf", "c/a.pdf"],
    });

    expect(res.isErr()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not apply the aggregate budget to legacy single-file requests", async () => {
    mockFiles({ "c/a.pdf": 2.9 * 1024 * 1024 });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));

    const res = await sendWithBody("hello", { attachmentFilePath: "c/a.pdf" });

    expect(res.isOk()).toBe(true);
    expect(Buffer.byteLength(fetchMock.mock.calls[0][1].body)).toBeGreaterThan(
      MAX_SEND_MAIL_REQUEST_BYTES
    );
  });

  it("does not send a reply when an attachment fails and deletes only the new reply draft", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ id: "reply-draft", body: { content: "" } })
      )
      .mockResolvedValueOnce(jsonResponse({ id: "reply-draft" }))
      .mockResolvedValueOnce(jsonResponse({}, 201))
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const res = await callTool("send_mail", {
      body: "Thanks",
      replyToMessageId: "existing-user-message",
      attachmentFilePaths: ["c/a.pdf", "c/b.pdf"],
    });

    expect(res.isErr()).toBe(true);
    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url: url as string,
      method: init?.method ?? "GET",
    }));
    expect(calls.some((c) => /\/send$/.test(c.url))).toBe(false);
    const deletes = calls.filter((c) => c.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toMatch(/\/messages\/reply-draft$/);
    expect(deletes[0].url).not.toContain("existing-user-message");
  });
});
