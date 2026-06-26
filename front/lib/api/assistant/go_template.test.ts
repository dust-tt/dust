import { resolveGoTemplateDraft } from "@app/lib/api/assistant/go_template";
import type { Authenticator } from "@app/lib/auth";
import { getConversationDraftBySlug } from "@app/lib/contentful/client";
import type { FileResource } from "@app/lib/resources/file_resource";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/contentful/client", () => ({
  getConversationDraftBySlug: vi.fn(),
  isHttpsUrl: (url: string) => url.startsWith("https://"),
}));

vi.mock("@app/lib/api/files/upload", () => ({
  processAndStoreFromUrl: vi.fn(),
}));

import { processAndStoreFromUrl } from "@app/lib/api/files/upload";

const auth = {} as Authenticator;

describe("resolveGoTemplateDraft", () => {
  it("returns template_not_found when template is missing", async () => {
    vi.mocked(getConversationDraftBySlug).mockResolvedValue(new Ok(null));

    const result = await resolveGoTemplateDraft(auth, "abcd");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        type: "template_not_found",
        slug: "abcd",
      });
    }
  });

  it("returns prompt and skips invalid attachment URLs", async () => {
    vi.mocked(getConversationDraftBySlug).mockResolvedValue(
      new Ok({
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
      })
    );

    vi.mocked(processAndStoreFromUrl).mockResolvedValue(
      new Ok({
        sId: "file123",
        fileName: "file.pdf",
        contentType: "application/pdf",
        fileSize: 1234,
      } as unknown as FileResource)
    );

    const result = await resolveGoTemplateDraft(auth, "abcd");

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
