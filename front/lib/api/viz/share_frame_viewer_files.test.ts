import { getShareFrameViewerFiles } from "@app/lib/api/viz/share_frame_viewer_files";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { describe, expect, it } from "vitest";

describe("getShareFrameViewerFiles", () => {
  it("returns file names with source kind and nested paths", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });
    const conversationTitle = conversation.title ?? "Test Conversation";

    const pod = await SpaceFactory.project(auth.getNonNullableWorkspace());

    const conversationFile = await FileFactory.create(auth, null, {
      contentType: "text/markdown",
      fileName: "notes.md",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const podFile = await FileFactory.create(auth, null, {
      contentType: "text/markdown",
      fileName: "summary.md",
      fileSize: 10,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: pod.sId },
    });

    const viewerFiles = await getShareFrameViewerFiles(auth, [
      {
        kind: "canonical_path",
        ref: `pod-${pod.sId}/my folder/another folder/aereataetaet.md`,
        fileName: "aereataetaet.md",
      },
      {
        kind: "canonical_path",
        ref: `pod-${pod.sId}/company-knowledge-summary.md`,
        fileName: "company-knowledge-summary.md",
      },
      {
        kind: "file_id",
        ref: conversationFile.sId,
        fileName: "notes.md",
      },
      {
        kind: "file_id",
        ref: podFile.sId,
        fileName: "summary.md",
      },
      {
        kind: "canonical_path",
        ref: `conversation-${conversation.sId}/report.csv`,
        fileName: "report.csv",
      },
    ]);

    expect(viewerFiles).toEqual([
      {
        name: "aereataetaet.md",
        contentType: "text/markdown",
        sourceKind: "pod",
        sourceName: pod.name,
        pathInSource: "my folder/another folder",
      },
      {
        name: "company-knowledge-summary.md",
        contentType: "text/markdown",
        sourceKind: "pod",
        sourceName: pod.name,
      },
      {
        name: "notes.md",
        contentType: "text/markdown",
        sourceKind: "conversation",
        sourceName: conversationTitle,
      },
      {
        name: "summary.md",
        contentType: "text/markdown",
        sourceKind: "pod",
        sourceName: pod.name,
      },
      {
        name: "report.csv",
        contentType: "text/csv",
        sourceKind: "conversation",
        sourceName: conversationTitle,
      },
    ]);
  });

  it("falls back to deleted labels when sources no longer exist", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const viewerFiles = await getShareFrameViewerFiles(auth, [
      {
        kind: "canonical_path",
        ref: "conversation-conv_missing/nested/report.csv",
        fileName: "report.csv",
      },
      {
        kind: "canonical_path",
        ref: "pod-spc_missing/data.csv",
        fileName: "data.csv",
      },
    ]);

    expect(viewerFiles).toEqual([
      {
        name: "report.csv",
        contentType: "text/csv",
        sourceKind: "conversation",
        sourceName: "Deleted conversation",
        pathInSource: "nested",
      },
      {
        name: "data.csv",
        contentType: "text/csv",
        sourceKind: "pod",
        sourceName: "Deleted pod",
      },
    ]);
  });
});
