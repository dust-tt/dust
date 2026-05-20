import {
  disambiguateFileName,
  getBaseMountPathForWorkspace,
  getConversationFilePath,
  getConversationFilesBasePath,
  getProjectFilesBasePath,
  makeProcessedMountFileName,
  normalizeAndValidateMountRelativeFilePath,
  normalizeMountParentRelativePath,
  parseProcessedFilename,
  parseScopedFilePath,
  ResolveScopedMountFilePathError,
  resolveMountFilePath,
  resolveMountFileSourcePath,
  resolveMoveSourcePath,
  resolveScopedMountFilePath,
  validateMountFolderName,
} from "@app/lib/api/files/mount_path";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("mount_path helpers", () => {
  describe("getBaseMountPathForWorkspace", () => {
    it("should return w/{wId}/ prefix", () => {
      expect(getBaseMountPathForWorkspace({ workspaceId: "abc123" })).toBe(
        "w/abc123/"
      );
    });
  });

  describe("getConversationFilesBasePath", () => {
    it("should return full conversation files path", () => {
      expect(
        getConversationFilesBasePath({
          workspaceId: "ws1",
          conversationId: "conv1",
        })
      ).toBe("w/ws1/conversations/conv1/files/");
    });
  });

  describe("getProjectFilesBasePath", () => {
    it("should return full project files path", () => {
      expect(
        getProjectFilesBasePath({ workspaceId: "ws1", projectId: "spc1" })
      ).toBe("w/ws1/projects/spc1/files/");
    });
  });

  describe("parseScopedFilePath", () => {
    it("parses a conversation path", () => {
      expect(parseScopedFilePath("conversation/report.pdf")).toEqual({
        prefix: "conversation",
        rel: "report.pdf",
      });
    });

    it("parses a project path", () => {
      expect(parseScopedFilePath("project/notes/2026/draft.md")).toEqual({
        prefix: "project",
        rel: "notes/2026/draft.md",
      });
    });

    it("returns null for unknown prefixes", () => {
      expect(parseScopedFilePath("other/foo.txt")).toBeNull();
    });

    it("returns null when there is no slash", () => {
      expect(parseScopedFilePath("conversation")).toBeNull();
    });
  });

  describe("getConversationFilePath", () => {
    it("should return full file path", () => {
      expect(
        getConversationFilePath({
          workspaceId: "ws1",
          conversationId: "conv1",
          fileName: "report.pdf",
        })
      ).toBe("w/ws1/conversations/conv1/files/report.pdf");
    });
  });

  describe("makeProcessedMountFileName", () => {
    it("should insert .processed before extension", () => {
      expect(
        makeProcessedMountFileName({
          mountFilePath: "w/ws1/conversations/c1/files/report.pdf",
        })
      ).toBe("w/ws1/conversations/c1/files/report.processed.pdf");
    });

    it("should handle multiple dots in filename", () => {
      expect(
        makeProcessedMountFileName({ mountFilePath: "dir/my.file.name.txt" })
      ).toBe("dir/my.file.name.processed.txt");
    });

    it("should append .processed for files without extension", () => {
      expect(
        makeProcessedMountFileName({ mountFilePath: "dir/Makefile" })
      ).toBe("dir/Makefile.processed");
    });

    it("should handle dotfiles (leading dot) as no extension", () => {
      expect(
        makeProcessedMountFileName({ mountFilePath: "dir/.gitignore" })
      ).toBe("dir/.gitignore.processed");
    });

    it("should swap extension when processedContentType is provided", () => {
      expect(
        makeProcessedMountFileName({
          mountFilePath: "w/ws1/conversations/c1/files/report.pdf",
          processedContentType: "text/plain",
        })
      ).toBe("w/ws1/conversations/c1/files/report.processed.txt");
    });

    it("should keep extension when processedContentType matches original", () => {
      expect(
        makeProcessedMountFileName({
          mountFilePath: "dir/photo.png",
          processedContentType: "image/png",
        })
      ).toBe("dir/photo.processed.png");
    });
  });

  describe("parseProcessedFilename", () => {
    it("recognizes a processed file with a swapped extension (PDF → text)", () => {
      expect(parseProcessedFilename("report.processed.txt")).toEqual({
        isProcessed: true,
        sourceBaseName: "report",
      });
    });

    it("recognizes a processed image (same content type)", () => {
      expect(parseProcessedFilename("photo.processed.jpg")).toEqual({
        isProcessed: true,
        sourceBaseName: "photo",
      });
    });

    it("recognizes a processed file without an original extension", () => {
      expect(parseProcessedFilename("Makefile.processed")).toEqual({
        isProcessed: true,
        sourceBaseName: "Makefile",
      });
    });

    it("recognizes a processed file when the source name itself contains dots", () => {
      expect(parseProcessedFilename("my.file.name.processed.txt")).toEqual({
        isProcessed: true,
        sourceBaseName: "my.file.name",
      });
    });

    it("does not flag regular user files", () => {
      expect(parseProcessedFilename("report.pdf")).toEqual({
        isProcessed: false,
      });
      expect(parseProcessedFilename("notes.txt")).toEqual({
        isProcessed: false,
      });
    });

    it("does not flag user files that merely contain '.processed.' mid-name", () => {
      // ".processed." is not the final segment-before-extension here.
      expect(parseProcessedFilename("my.processed.report.pdf")).toEqual({
        isProcessed: false,
      });
      // Multi-segment extension after ".processed." is not produced by our writer.
      expect(parseProcessedFilename("data.processed.tar.gz")).toEqual({
        isProcessed: false,
      });
    });

    it("does not flag .processed-only or empty inputs", () => {
      expect(parseProcessedFilename(".processed")).toEqual({
        isProcessed: false,
      });
      expect(parseProcessedFilename(".processed.txt")).toEqual({
        isProcessed: false,
      });
      expect(parseProcessedFilename("")).toEqual({ isProcessed: false });
    });
  });

  describe("validateMountFolderName", () => {
    it("accepts a simple folder name", () => {
      const result = validateMountFolderName("  Reports  ");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("Reports");
      }
    });

    it("rejects path separators and empty names", () => {
      expect(validateMountFolderName("").isErr()).toBe(true);
      expect(validateMountFolderName("a/b").isErr()).toBe(true);
      expect(validateMountFolderName("..").isErr()).toBe(true);
    });
  });

  describe("resolveScopedMountFilePath", () => {
    const mountBasePath = "w/ws123/projects/proj456/files/";

    it("rejects invalid scope prefix", () => {
      const result = resolveScopedMountFilePath({
        relPath: "conversation/file.txt",
        expectedPrefix: "project",
        mountBasePath,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(
          ResolveScopedMountFilePathError.isResolveScopedMountFilePathError(
            result.error
          )
        ).toBe(true);
        if (
          ResolveScopedMountFilePathError.isResolveScopedMountFilePathError(
            result.error
          )
        ) {
          expect(result.error.code).toBe("invalid_prefix");
        }
      }
    });

    it("rejects path traversal", () => {
      const result = resolveScopedMountFilePath({
        relPath: "project/../other/file.txt",
        expectedPrefix: "project",
        mountBasePath,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(
          ResolveScopedMountFilePathError.isResolveScopedMountFilePathError(
            result.error
          )
        ).toBe(true);
        if (
          ResolveScopedMountFilePathError.isResolveScopedMountFilePathError(
            result.error
          )
        ) {
          expect(result.error.code).toBe("outside_scope");
        }
      }
    });

    it("returns normalized relative and GCS paths", () => {
      const result = resolveScopedMountFilePath({
        relPath: "project/reports/../reports/file.txt",
        expectedPrefix: "project",
        mountBasePath,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.normalizedRelative).toBe("reports/file.txt");
        expect(result.value.normalizedGcsPath).toBe(
          `${mountBasePath}reports/file.txt`
        );
      }
    });
  });

  describe("resolveMoveSourcePath", () => {
    const mountBasePath = "w/ws123/projects/proj1/files/";

    it("resolves a scoped listing path", () => {
      const result = resolveMoveSourcePath({
        sourcePath: "project/reports/report_fil_abc.pdf",
        expectedPrefix: "project",
        mountBasePath,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.normalizedMountFilePath).toBe(
          `${mountBasePath}reports/report_fil_abc.pdf`
        );
      }
    });

    it("resolves a mount-relative path", () => {
      const result = resolveMoveSourcePath({
        sourcePath: "reports/file.txt",
        expectedPrefix: "project",
        mountBasePath,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.normalizedMountFilePath).toBe(
          `${mountBasePath}reports/file.txt`
        );
      }
    });

    it("rejects a scoped path with the wrong prefix", () => {
      const result = resolveMoveSourcePath({
        sourcePath: "conversation/file.txt",
        expectedPrefix: "project",
        mountBasePath,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("invalid_path");
      }
    });
  });

  describe("resolveMountFileSourcePath", () => {
    const mountBasePath = "w/ws123/conversations/conv1/files/";

    it("resolves a mount-relative path", () => {
      const result = resolveMountFileSourcePath({
        sourcePath: "reports/file.txt",
        mountBasePath,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.normalizedMountFilePath).toBe(
          `${mountBasePath}reports/file.txt`
        );
      }
    });
  });

  describe("resolveMountFilePath", () => {
    const mountBasePath = "w/ws123/conversations/conv1/files/";

    it("rejects path traversal", () => {
      const result = resolveMountFilePath({
        mountFilePath: `${mountBasePath}../other/file.txt`,
        mountBasePath,
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("outside_scope");
      }
    });

    it("returns the normalized mount file path", () => {
      const result = resolveMountFilePath({
        mountFilePath: `${mountBasePath}reports/../reports/file.txt`,
        mountBasePath,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.normalizedMountFilePath).toBe(
          `${mountBasePath}reports/file.txt`
        );
      }
    });
  });

  describe("normalizeAndValidateMountRelativeFilePath", () => {
    it("rejects empty paths", () => {
      expect(normalizeAndValidateMountRelativeFilePath("").isErr()).toBe(true);
      expect(normalizeAndValidateMountRelativeFilePath("  ").isErr()).toBe(
        true
      );
    });

    it("rejects path traversal", () => {
      expect(
        normalizeAndValidateMountRelativeFilePath("../evil.txt").isErr()
      ).toBe(true);
    });

    it("normalizes nested file paths", () => {
      const result = normalizeAndValidateMountRelativeFilePath(
        "/archive/report.pdf"
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("archive/report.pdf");
      }
    });
  });

  describe("normalizeMountParentRelativePath", () => {
    it("normalizes empty to mount root", () => {
      const undefinedResult = normalizeMountParentRelativePath(undefined);
      expect(undefinedResult.isOk()).toBe(true);
      if (undefinedResult.isOk()) {
        expect(undefinedResult.value).toBe("");
      }

      const emptyResult = normalizeMountParentRelativePath("");
      expect(emptyResult.isOk()).toBe(true);
      if (emptyResult.isOk()) {
        expect(emptyResult.value).toBe("");
      }
    });

    it("rejects path traversal", () => {
      expect(normalizeMountParentRelativePath("../evil").isErr()).toBe(true);
    });

    it("strips leading slashes", () => {
      const result = normalizeMountParentRelativePath("/reports/q1");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("reports/q1");
      }
    });
  });

  describe("disambiguateFileName", () => {
    it("should insert sId before extension", async () => {
      const { authenticator: auth } = await createResourceTest({});
      const file = await FileFactory.create(auth, null, {
        contentType: "application/pdf",
        fileName: "report.pdf",
        fileSize: 1000,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1234" },
      });

      expect(disambiguateFileName(file)).toBe(`report_${file.sId}.pdf`);
    });

    it("should append sId for files without extension", async () => {
      const { authenticator: auth } = await createResourceTest({});
      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "Makefile",
        fileSize: 1000,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1234" },
      });

      expect(disambiguateFileName(file)).toBe(`Makefile_${file.sId}`);
    });

    it("should handle dotfiles (leading dot) as no extension", async () => {
      const { authenticator: auth } = await createResourceTest({});
      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: ".gitignore",
        fileSize: 1000,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1234" },
      });

      expect(disambiguateFileName(file)).toBe(`.gitignore_${file.sId}`);
    });
  });
});
