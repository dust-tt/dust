import {
  disambiguateFileName,
  getBaseMountPathForWorkspace,
  getConversationFilePath,
  getConversationFilesBasePath,
  makeProcessedMountFileName,
} from "@app/lib/api/files/mount_path";
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
        makeProcessedMountFileName("w/ws1/conversations/c1/files/report.pdf")
      ).toBe("w/ws1/conversations/c1/files/report.processed.pdf");
    });

    it("should handle multiple dots in filename", () => {
      expect(makeProcessedMountFileName("dir/my.file.name.txt")).toBe(
        "dir/my.file.name.processed.txt"
      );
    });

    it("should append .processed for files without extension", () => {
      expect(makeProcessedMountFileName("dir/Makefile")).toBe(
        "dir/Makefile.processed"
      );
    });

    it("should handle dotfiles (leading dot) as no extension", () => {
      expect(makeProcessedMountFileName("dir/.gitignore")).toBe(
        "dir/.gitignore.processed"
      );
    });
  });

  describe("disambiguateFileName", () => {
    it("should insert sId before extension", () => {
      expect(disambiguateFileName("report.pdf", "fil_abc")).toBe(
        "report_fil_abc.pdf"
      );
    });

    it("should append sId for files without extension", () => {
      expect(disambiguateFileName("Makefile", "fil_abc")).toBe(
        "Makefile_fil_abc"
      );
    });

    it("should handle dotfiles (leading dot) as no extension", () => {
      expect(disambiguateFileName(".gitignore", "fil_abc")).toBe(
        ".gitignore_fil_abc"
      );
    });
  });
});
