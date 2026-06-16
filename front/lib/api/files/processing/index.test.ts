import {
  getProcessedContentType,
  hasProcessedVersion,
  isUploadSupportedForContentType,
  processAndStoreFile,
} from "@app/lib/api/files/processing";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { assert, describe, expect, it, vi } from "vitest";

// Mock config to provide required env vars.
vi.mock("@app/lib/api/config", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@app/lib/api/config")>();
  return {
    ...mod,
    default: {
      ...mod.default,
      getTextExtractionUrl: () => "http://fake-tika:9998",
      getApiBaseUrl: () => "http://localhost:3000",
    },
  };
});

// Types whose processing does not vary by use case.
describe("use-case-independent types", () => {
  describe("hasProcessedVersion", () => {
    it("plain text has no processed version", () => {
      expect(hasProcessedVersion("text/plain")).toBe(false);
    });

    it("Python files have no processed version", () => {
      expect(hasProcessedVersion("text/x-python")).toBe(false);
    });

    it("JSON has no processed version", () => {
      expect(hasProcessedVersion("application/json")).toBe(false);
    });

    it("CSV has no processed version", () => {
      expect(hasProcessedVersion("text/csv")).toBe(false);
    });

    it("raster images have a processed version (resize)", () => {
      expect(hasProcessedVersion("image/png")).toBe(true);
      expect(hasProcessedVersion("image/jpeg")).toBe(true);
      expect(hasProcessedVersion("image/webp")).toBe(true);
    });

    it("SVG has a processed version (rasterized to PNG)", () => {
      expect(hasProcessedVersion("image/svg+xml")).toBe(true);
    });

    it("audio has a processed version (transcription)", () => {
      expect(hasProcessedVersion("audio/mpeg")).toBe(true);
    });

    it("Excel has a processed version (text extraction for table upsert)", () => {
      expect(
        hasProcessedVersion(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
      ).toBe(true);
      expect(hasProcessedVersion("application/vnd.ms-excel")).toBe(true);
    });
  });

  describe("getProcessedContentType", () => {
    it("plain text and JSON return undefined", () => {
      expect(getProcessedContentType("text/plain")).toBeUndefined();
      expect(getProcessedContentType("application/json")).toBeUndefined();
    });

    it("audio returns text/plain", () => {
      expect(getProcessedContentType("audio/mpeg")).toBe("text/plain");
    });

    it("raster images return their original content type", () => {
      expect(getProcessedContentType("image/png")).toBe("image/png");
      expect(getProcessedContentType("image/jpeg")).toBe("image/jpeg");
    });

    it("SVG returns image/png (rasterized)", () => {
      expect(getProcessedContentType("image/svg+xml")).toBe("image/png");
    });
  });
});

// For conversation, only tabular files (Excel/CSV) are processed and indexed in the data source.
// Binary documents (PDF, DOCX, PPTX) are uploaded as-is and never text-extracted.
describe("conversation use case", () => {
  describe("hasProcessedVersion", () => {
    it("PDF has no processed version", () => {
      expect(hasProcessedVersion("application/pdf", "conversation")).toBe(
        false
      );
    });

    it("DOCX has no processed version", () => {
      expect(
        hasProcessedVersion(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "conversation"
        )
      ).toBe(false);
    });

    it("PPTX has no processed version", () => {
      expect(
        hasProcessedVersion(
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "conversation"
        )
      ).toBe(false);
    });

    it("DOC (legacy Word) has no processed version", () => {
      expect(hasProcessedVersion("application/msword", "conversation")).toBe(
        false
      );
    });

    it("PPT (legacy PowerPoint) has no processed version", () => {
      expect(
        hasProcessedVersion("application/vnd.ms-powerpoint", "conversation")
      ).toBe(false);
    });
  });

  describe("getProcessedContentType", () => {
    it("PDF returns undefined", () => {
      expect(
        getProcessedContentType("application/pdf", "conversation")
      ).toBeUndefined();
    });

    it("DOCX returns undefined", () => {
      expect(
        getProcessedContentType(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "conversation"
        )
      ).toBeUndefined();
    });
  });

  describe("isUploadSupportedForContentType", () => {
    it("plain text is supported", () => {
      expect(
        isUploadSupportedForContentType({
          contentType: "text/plain",
          useCase: "conversation",
        })
      ).toBe(true);
    });

    it("Python files are supported", () => {
      expect(
        isUploadSupportedForContentType({
          contentType: "text/x-python",
          useCase: "conversation",
        })
      ).toBe(true);
    });

    it("CSV is supported", () => {
      expect(
        isUploadSupportedForContentType({
          contentType: "text/csv",
          useCase: "conversation",
        })
      ).toBe(true);
    });

    it("PDF is supported (uploaded as-is, not indexed)", () => {
      expect(
        isUploadSupportedForContentType({
          contentType: "application/pdf",
          useCase: "conversation",
        })
      ).toBe(true);
    });

    it("SVG is supported", () => {
      expect(
        isUploadSupportedForContentType({
          contentType: "image/svg+xml",
          useCase: "conversation",
        })
      ).toBe(true);
    });

    it("Slack thread attachment is supported", () => {
      expect(
        isUploadSupportedForContentType({
          contentType: "text/vnd.dust.attachment.slack.thread",
          useCase: "conversation",
        })
      ).toBe(true);
    });
  });

  describe("processAndStoreFile", () => {
    it("PDF is stored as original only, no text extraction for conversation", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const file = await FileFactory.create(auth, null, {
        contentType: "application/pdf",
        fileName: "document.pdf",
        fileSize: 1000,
        status: "created",
        useCase: "conversation",
      });

      const result = await processAndStoreFile(auth, {
        file,
        content: { type: "string", value: "fake pdf bytes" },
      });

      assert(
        result.isOk(),
        `Expected Ok, got: ${result.isErr() ? JSON.stringify(result.error) : ""}`
      );

      const writes = fileStorageMock.writeStreamCalls;
      expect(writes).toHaveLength(1);
      expect(writes[0].contentType).toBe("application/pdf");
    });

    it("plain text is stored as original only", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "readme.txt",
        fileSize: 100,
        status: "created",
        useCase: "conversation",
      });

      const result = await processAndStoreFile(auth, {
        file,
        content: { type: "string", value: "hello world" },
      });

      assert(
        result.isOk(),
        `Expected Ok, got: ${result.isErr() ? JSON.stringify(result.error) : ""}`
      );

      const writes = fileStorageMock.writeStreamCalls;
      expect(writes).toHaveLength(1);
      expect(writes[0].contentType).toBe("text/plain");
    });

    it("raw sandbox spreadsheets skip processing when skipFileProcessing is set", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const contentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const file = await FileFactory.create(auth, null, {
        contentType,
        fileName: "large.xlsx",
        fileSize: 100,
        status: "created",
        useCase: "conversation",
        useCaseMetadata: {
          conversationId: "conv-raw",
          skipDataSourceIndexing: true,
          skipFileProcessing: true,
        },
      });

      const result = await processAndStoreFile(auth, {
        file,
        content: { type: "string", value: "fake xlsx bytes" },
      });

      assert(
        result.isOk(),
        `Expected Ok, got: ${result.isErr() ? JSON.stringify(result.error) : ""}`
      );

      const writes = fileStorageMock.writeStreamCalls;
      expect(writes).toHaveLength(1);
      expect(writes[0].contentType).toBe(contentType);
    });
  });
});

// For non-conversation use cases (upsert_document, folders_document, etc.), binary documents
// are text-extracted via Tika and their processed version is text/plain.
describe("upsert_document / folders_document use cases", () => {
  describe("hasProcessedVersion", () => {
    it("PDF has a processed version", () => {
      expect(hasProcessedVersion("application/pdf", "upsert_document")).toBe(
        true
      );
      expect(hasProcessedVersion("application/pdf", "folders_document")).toBe(
        true
      );
    });

    it("DOCX has a processed version", () => {
      expect(
        hasProcessedVersion(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "upsert_document"
        )
      ).toBe(true);
    });

    it("PPTX has a processed version", () => {
      expect(
        hasProcessedVersion(
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "upsert_document"
        )
      ).toBe(true);
    });

    it("DOC (legacy Word) has a processed version", () => {
      expect(hasProcessedVersion("application/msword", "upsert_document")).toBe(
        true
      );
    });

    it("PPT (legacy PowerPoint) has a processed version", () => {
      expect(
        hasProcessedVersion("application/vnd.ms-powerpoint", "upsert_document")
      ).toBe(true);
    });
  });

  describe("getProcessedContentType", () => {
    it("PDF returns text/plain", () => {
      expect(
        getProcessedContentType("application/pdf", "upsert_document")
      ).toBe("text/plain");
      expect(
        getProcessedContentType("application/pdf", "folders_document")
      ).toBe("text/plain");
    });

    it("DOCX returns text/plain", () => {
      expect(
        getProcessedContentType(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "upsert_document"
        )
      ).toBe("text/plain");
    });

    it("PPTX returns text/plain", () => {
      expect(
        getProcessedContentType(
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "upsert_document"
        )
      ).toBe("text/plain");
    });
  });
});

describe("other use cases", () => {
  describe("isUploadSupportedForContentType", () => {
    it("section JSON is supported for tool_output", () => {
      expect(
        isUploadSupportedForContentType({
          contentType: "application/vnd.dust.section.json",
          useCase: "tool_output",
        })
      ).toBe(true);
    });

    it("images are supported for skill_attachment", () => {
      expect(
        isUploadSupportedForContentType({
          contentType: "image/png",
          useCase: "skill_attachment",
        })
      ).toBe(true);
    });

    it("supported image types are accepted for workspace_branding", () => {
      for (const contentType of [
        "image/jpeg",
        "image/png",
        "image/svg+xml",
        "image/webp",
      ] as const) {
        expect(
          isUploadSupportedForContentType({
            contentType,
            useCase: "workspace_branding",
          })
        ).toBe(true);
      }
    });

    it("non-image types are rejected for workspace_branding", () => {
      expect(
        isUploadSupportedForContentType({
          contentType: "text/plain",
          useCase: "workspace_branding",
        })
      ).toBe(false);
    });

    it("images are rejected for upsert_table", () => {
      expect(
        isUploadSupportedForContentType({
          contentType: "image/png",
          useCase: "upsert_table",
        })
      ).toBe(false);
    });
  });
});
