import { resolveGoTemplateDraft } from "@app/lib/api/assistant/go_template";
import { getConversationDraftBySlug } from "@app/lib/contentful/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/contentful/client", () => ({
  getConversationDraftBySlug: vi.fn(),
  isHttpsUrl: (url: string) => url.startsWith("https://"),
}));

vi.mock("@app/lib/api/files/upload", () => ({
  processAndStoreFromUrl: vi.fn(),
}));

import { processAndStoreFromUrl } from "@app/lib/api/files/upload";

describe("resolveGoTemplateDraft", () => {
  it("returns 404 when template is missing", async () => {
    vi.mocked(getConversationDraftBySlug).mockResolvedValue({
      isOk: () => true,
      isErr: () => false,
      value: null,
    } as never);

    const result = await resolveGoTemplateDraft({} as never, "abcd");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status_code).toBe(404);
    }
  });

  it("returns prompt and skips invalid attachment URLs", async () => {
    vi.mocked(getConversationDraftBySlug).mockResolvedValue({
      isOk: () => true,
      isErr: () => false,
      value: {
        slug: "abcd",
        title: "RFP Review",
        prompt: "Review this RFP",
        attachments: [
          {
            url: "http://insecure.example/file.pdf",
            fileName: "insecure.pdf",
            contentType: "application/pdf",
          },
          {
            url: "https://example.com/file.pdf",
            fileName: "file.pdf",
            contentType: "application/pdf",
          },
        ],
      },
    } as never);

    vi.mocked(processAndStoreFromUrl).mockResolvedValue({
      isOk: () => true,
      isErr: () => false,
      value: {
        sId: "file123",
        fileName: "file.pdf",
        contentType: "application/pdf",
        fileSize: 1234,
      },
    } as never);

    const result = await resolveGoTemplateDraft({} as never, "abcd");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.prompt).toBe("Review this RFP");
      expect(result.value.attachments).toHaveLength(1);
      expect(result.value.attachmentErrors).toHaveLength(1);
      expect(result.value.attachmentErrors[0]?.url).toBe(
        "http://insecure.example/file.pdf"
      );
    }
  });
});
