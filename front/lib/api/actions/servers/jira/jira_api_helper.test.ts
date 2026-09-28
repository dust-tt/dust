import { downloadAttachmentContent } from "@app/lib/api/actions/servers/jira/jira_api_helper";
import { afterEach, describe, expect, it, vi } from "vitest";

const BASE_ARGS = {
  baseUrl: "https://example.atlassian.net",
  accessToken: "token",
  attachmentId: "10001",
};

function mockFetchResponse(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("downloadAttachmentContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the exact raw bytes of a text attachment, without base64 decoding", async () => {
    const content = `<?xml version="1.0"?><x>ioz</x>`;
    mockFetchResponse(new Response(Buffer.from(content, "utf-8")));

    const result = await downloadAttachmentContent(BASE_ARGS);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.toString("utf-8")).toBe(content);
    }
  });

  it("returns the exact raw bytes of a binary attachment", async () => {
    const bytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe,
    ]);
    mockFetchResponse(new Response(bytes));

    const result = await downloadAttachmentContent(BASE_ARGS);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.equals(bytes)).toBe(true);
    }
  });

  it("calls the v3 attachment content endpoint with the access token", async () => {
    const fetchMock = mockFetchResponse(new Response(Buffer.from("ok")));

    await downloadAttachmentContent(BASE_ARGS);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/attachment/content/10001",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      })
    );
  });

  it("returns an error on a non-2xx response", async () => {
    mockFetchResponse(new Response("not found", { status: 404 }));

    const result = await downloadAttachmentContent(BASE_ARGS);

    expect(result.isErr()).toBe(true);
  });
});
