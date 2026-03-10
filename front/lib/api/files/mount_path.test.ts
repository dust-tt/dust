import {
  getBaseMountPathForWorkspace,
  getConversationFilesBasePath,
  makeProcessedMountFileName,
  maybeResolveMountPath,
} from "@app/lib/api/files/mount_path";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";

// Mock FileStorage to avoid GCS calls during setMountFilePath.
vi.mock("@app/lib/file_storage", async () => {
  const { mockFileStorage } = await import(
    "@app/tests/utils/mocks/file_storage"
  );
  return mockFileStorage();
});

// Mock copyContent (used by FileResource.copy).
vi.mock("@app/lib/utils/files", () => ({
  copyContent: vi.fn(),
}));

describe("mount_path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  describe("maybeResolveMountPath", () => {
    it("should no-op when mountFilePath is already set", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "created",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1" },
      });

      // Manually set a mountFilePath in DB.
      await FileModel.update(
        { mountFilePath: "w/existing/path.txt" },
        { where: { id: file.id, workspaceId: workspace.id } }
      );

      // Reload to get fresh data.
      const reloaded = await FileResource.fetchById(auth, file.sId);
      assert(reloaded, "File should exist");

      await maybeResolveMountPath(auth, reloaded);

      // mountFilePath should remain unchanged.
      const afterResolve = await FileModel.findOne({
        where: { id: file.id, workspaceId: workspace.id },
      });
      expect(afterResolve?.mountFilePath).toBe("w/existing/path.txt");
    });

    it("should no-op for non-conversation use cases", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "created",
        useCase: "avatar",
      });

      await maybeResolveMountPath(auth, file);

      const row = await FileModel.findOne({
        where: { id: file.id, workspaceId: workspace.id },
      });
      expect(row?.mountFilePath).toBeNull();
    });

    it("should no-op when conversationId is missing from metadata", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "created",
        useCase: "conversation",
      });

      await maybeResolveMountPath(auth, file);

      const row = await FileModel.findOne({
        where: { id: file.id, workspaceId: workspace.id },
      });
      expect(row?.mountFilePath).toBeNull();
    });

    it("should resolve mount path for conversation file", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "report.txt",
        fileSize: 100,
        status: "created",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-abc" },
      });

      await maybeResolveMountPath(auth, file);

      const row = await FileModel.findOne({
        where: { id: file.id, workspaceId: workspace.id },
      });
      expect(row?.mountFilePath).toBe(
        `w/${workspace.sId}/conversations/conv-abc/files/report.txt`
      );
    });

    it("should resolve mount path for tool_output use case", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "output.csv",
        fileSize: 200,
        status: "created",
        useCase: "tool_output",
        useCaseMetadata: { conversationId: "conv-xyz" },
      });

      await maybeResolveMountPath(auth, file);

      const row = await FileModel.findOne({
        where: { id: file.id, workspaceId: workspace.id },
      });
      expect(row?.mountFilePath).toBe(
        `w/${workspace.sId}/conversations/conv-xyz/files/output.csv`
      );
    });

    it("should disambiguate with sId when path is already taken", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      // Create first file and resolve its mount path.
      const file1 = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "report.txt",
        fileSize: 100,
        status: "created",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1" },
      });
      await maybeResolveMountPath(auth, file1);

      // Create second file with the same name in the same conversation.
      const file2 = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "report.txt",
        fileSize: 200,
        status: "created",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1" },
      });
      await maybeResolveMountPath(auth, file2);

      const row1 = await FileModel.findOne({
        where: { id: file1.id, workspaceId: workspace.id },
      });
      const row2 = await FileModel.findOne({
        where: { id: file2.id, workspaceId: workspace.id },
      });

      // First file gets the clean path.
      expect(row1?.mountFilePath).toBe(
        `w/${workspace.sId}/conversations/conv-1/files/report.txt`
      );
      // Second file gets disambiguated with its sId.
      expect(row2?.mountFilePath).toBe(
        `w/${workspace.sId}/conversations/conv-1/files/report_${file2.sId}.txt`
      );
    });

    it("should disambiguate files without extension", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const file1 = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "Makefile",
        fileSize: 100,
        status: "created",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1" },
      });
      await maybeResolveMountPath(auth, file1);

      const file2 = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "Makefile",
        fileSize: 200,
        status: "created",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1" },
      });
      await maybeResolveMountPath(auth, file2);

      const row2 = await FileModel.findOne({
        where: { id: file2.id, workspaceId: workspace.id },
      });
      expect(row2?.mountFilePath).toBe(
        `w/${workspace.sId}/conversations/conv-1/files/Makefile_${file2.sId}`
      );
    });
  });

  describe("markAsReady triggers mount path resolution", () => {
    it("should resolve mount path", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "data.json",
        fileSize: 500,
        status: "created",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-mark" },
      });

      await file.markAsReady(auth);

      const row = await FileModel.findOne({
        where: { id: file.id, workspaceId: workspace.id },
      });
      expect(row?.status).toBe("ready");
      expect(row?.mountFilePath).toBe(
        `w/${workspace.sId}/conversations/conv-mark/files/data.json`
      );
    });
  });

  describe("setUseCaseMetadata triggers mount path resolution", () => {
    it("should resolve mount path when conversationId is set retroactively", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      // Create a ready file without conversationId.
      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "attachment.pdf",
        fileSize: 300,
        status: "ready",
        useCase: "conversation",
      });

      // Set conversationId retroactively (like maybeUpsertFileAttachment does).
      await file.setUseCaseMetadata(auth, { conversationId: "conv-retro" });

      const row = await FileModel.findOne({
        where: { id: file.id, workspaceId: workspace.id },
      });
      expect(row?.mountFilePath).toBe(
        `w/${workspace.sId}/conversations/conv-retro/files/attachment.pdf`
      );
    });
  });
});
