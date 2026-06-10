import { FILE_OFFLOAD_TEXT_SIZE_BYTES } from "@app/lib/actions/action_output_limits";
import {
  TRUNCATED_SUFFIX,
  TRUNCATED_TEXT_SIZE,
} from "@app/lib/api/files/snippet";
import type { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import { renderLightContentFragmentForModel } from "@app/lib/resources/content_fragment_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type {
  ContentNodeContentFragmentType,
  FileContentFragmentType,
  SupportedContentFragmentType,
} from "@app/types/content_fragment";
import { beforeEach, describe, expect, it, vi } from "vitest";

const BASE_CONTEXT = {
  username: "user",
  fullName: null,
  email: null,
  profilePictureUrl: null,
};

function makeFileFragment(
  contentType: SupportedContentFragmentType,
  {
    generatedTables = [],
    path = null,
    snippet = null,
    skipFileProcessing = false,
  }: {
    generatedTables?: string[];
    path?: string | null;
    snippet?: string | null;
    skipFileProcessing?: boolean;
  } = {}
): FileContentFragmentType {
  return {
    type: "content_fragment",
    id: 1,
    sId: "cf_1",
    created: Date.now(),
    visibility: "visible",
    version: 1,
    rank: 0,
    branchId: null,
    sourceUrl: null,
    title: "file",
    contentType,
    context: BASE_CONTEXT,
    contentFragmentId: "cf_sId_1",
    contentFragmentVersion: "latest",
    expiredReason: null,
    contentFragmentType: "file",
    path,
    skipFileProcessing,
    fileId: "fil_abc123",
    snippet,
    generatedTables,
    textUrl: "https://example.com/file",
    textBytes: null,
    sourceProvider: null,
    sourceIcon: null,
    isInProjectContext: false,
    hidden: false,
  };
}

function makeContentNodeFragment(): ContentNodeContentFragmentType {
  return {
    type: "content_fragment",
    id: 1,
    sId: "cf_1",
    created: Date.now(),
    visibility: "visible",
    version: 1,
    rank: 0,
    branchId: null,
    sourceUrl: null,
    title: "Notion page",
    contentType: "text/plain",
    context: BASE_CONTEXT,
    contentFragmentId: "cf_sId_1",
    contentFragmentVersion: "latest",
    expiredReason: null,
    contentFragmentType: "content_node",
    nodeId: "node_1",
    nodeDataSourceViewId: "dsv_1",
    nodeType: "document",
    contentNodeData: {
      nodeId: "node_1",
      nodeDataSourceViewId: "dsv_1",
      nodeType: "document",
      provider: null,
      spaceName: "test",
    },
  };
}

const visionModel = getSupportedModelConfigs().find((m) => m.supportsVision)!;
const nonVisionModel = getSupportedModelConfigs().find(
  (m) => !m.supportsVision
)!;

describe("renderLightContentFragmentForModel", () => {
  let authenticator: Authenticator;

  beforeEach(async () => {
    const { authenticator: auth } = await createResourceTest({});
    authenticator = auth;
    vi.spyOn(
      FileResource.prototype,
      "getSignedUrlForDownload"
    ).mockResolvedValue("https://signed.url/image.png");
  });

  describe("useFileSystem: false", () => {
    it("renders a regular file as <attachment>", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("application/pdf"),
        visionModel,
        { excludeImages: false, useFileSystem: false }
      );
      expect(result?.content[0]).toMatchObject({ type: "text" });
      expect((result?.content[0] as { text: string }).text).toContain(
        "<attachment"
      );
    });

    it("renders a queryable CSV as <attachment>", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("text/csv", {
          generatedTables: ["table_1"],
          snippet: "",
        }),
        visionModel,
        { excludeImages: false, useFileSystem: false }
      );
      expect((result?.content[0] as { text: string }).text).toContain(
        "<attachment"
      );
    });

    it("renders pasted content as large-paste XML", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("text/vnd.dust.attachment.pasted"),
        visionModel,
        { excludeImages: false, useFileSystem: false }
      );
      expect((result?.content[0] as { text: string }).text).toContain(
        "<pastedContent"
      );
    });

    it("inlines a below-threshold paste in full without truncation", async () => {
      const pasteContent = "Some pasted content that fits inline.";
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("text/vnd.dust.attachment.pasted", {
          snippet: pasteContent,
        }),
        visionModel,
        { excludeImages: false, useFileSystem: false }
      );
      const text = (result?.content[0] as { text: string }).text;
      expect(text).toContain(
        `<pastedContent name="file">${pasteContent}</pastedContent>`
      );
      expect(text).not.toContain('truncated="true"');
    });

    it("renders an above-threshold paste as a truncated snippet with path", async () => {
      const snippet = "a".repeat(TRUNCATED_TEXT_SIZE) + TRUNCATED_SUFFIX;
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("text/vnd.dust.attachment.pasted", {
          snippet,
          path: "conversation-conv123/pasted-text-1.txt",
        }),
        visionModel,
        { excludeImages: false, useFileSystem: false }
      );
      const text = (result?.content[0] as { text: string }).text;
      expect(text).toContain('truncated="true"');
      expect(text).toContain('path="conversation-conv123/pasted-text-1.txt"');
    });

    it("re-truncates a legacy oversized stored snippet so the full paste is not inlined", async () => {
      const fullPaste = "b".repeat(FILE_OFFLOAD_TEXT_SIZE_BYTES + 1);
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("text/vnd.dust.attachment.pasted", {
          snippet: fullPaste,
          path: "conversation-conv123/pasted-text-1.txt",
        }),
        visionModel,
        { excludeImages: false, useFileSystem: false }
      );
      const text = (result?.content[0] as { text: string }).text;
      expect(text).not.toContain(fullPaste);
      expect(text.length).toBeLessThan(1024);
      expect(text).toContain('truncated="true"');
      expect(text).toContain('path="conversation-conv123/pasted-text-1.txt"');
      expect(text).toContain(TRUNCATED_SUFFIX);
    });

    it("renders an image with excludeImages as <attachment> with description", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("image/png"),
        visionModel,
        { excludeImages: true, useFileSystem: false }
      );
      const text = (result?.content[0] as { text: string }).text;
      expect(text).toContain("<attachment");
      expect(text).toContain(
        "Image content interpreted by a vision-enabled model"
      );
    });

    it("renders an image with non-vision model as <attachment> with description", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("image/png"),
        nonVisionModel,
        { excludeImages: false, useFileSystem: false }
      );
      const text = (result?.content[0] as { text: string }).text;
      expect(text).toContain("<attachment");
      expect(text).toContain(
        "Image content interpreted by a vision-enabled model"
      );
    });

    it("renders a content node as <attachment>", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeContentNodeFragment(),
        visionModel,
        { excludeImages: false, useFileSystem: false }
      );
      expect((result?.content[0] as { text: string }).text).toContain(
        "<attachment"
      );
    });
  });

  describe("useFileSystem: true", () => {
    it("renders a regular file as <file> without snippet and without path when path is null", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("application/pdf"),
        visionModel,
        { excludeImages: false, useFileSystem: true }
      );
      expect(result?.content[0]).toMatchObject({
        type: "text",
        text: `<file name="file"/>`,
      });
    });

    it("renders a regular file as <file> with snippet and without path when path is null", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("text/plain", { snippet: "First 256 chars..." }),
        visionModel,
        { excludeImages: false, useFileSystem: true }
      );
      expect(result?.content[0]).toMatchObject({
        type: "text",
        text: `<file name="file">First 256 chars...\n</file>`,
      });
    });

    it("renders a slim file reference using the canonical scoped path when available", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("application/pdf", {
          path: "conversation-conv123/report_fil_abc123.pdf",
        }),
        visionModel,
        { excludeImages: false, useFileSystem: true }
      );
      expect(result).not.toBeNull();
      expect(result?.content[0]).toMatchObject({
        type: "text",
        text: `<file name="file" path="conversation-conv123/report_fil_abc123.pdf"/>`,
      });
    });

    it("renders a queryable CSV as <attachment> (bypasses new file explorer)", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("text/csv", {
          generatedTables: ["table_1"],
          snippet: "",
        }),
        visionModel,
        { excludeImages: false, useFileSystem: true }
      );
      expect((result?.content[0] as { text: string }).text).toContain(
        "<attachment"
      );
    });

    it("renders a content node as <attachment> (bypasses new file explorer)", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeContentNodeFragment(),
        visionModel,
        { excludeImages: false, useFileSystem: true }
      );
      expect((result?.content[0] as { text: string }).text).toContain(
        "<attachment"
      );
    });

    it("renders pasted content as large-paste XML (bypasses new file explorer)", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("text/vnd.dust.attachment.pasted"),
        visionModel,
        { excludeImages: false, useFileSystem: true }
      );
      expect((result?.content[0] as { text: string }).text).toContain(
        "<pastedContent"
      );
    });

    it("renders an image with excludeImages as <file> with description", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("image/png", {
          path: "conversation-conv123/image.png",
        }),
        visionModel,
        { excludeImages: true, useFileSystem: true }
      );
      const text = (result?.content[0] as { text: string }).text;
      expect(text).toContain(
        `<file name="file" path="conversation-conv123/image.png">`
      );
      expect(text).toContain(
        "Image content interpreted by a vision-enabled model"
      );
    });

    it("renders an image with non-vision model as <file> with description", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("image/png", {
          path: "conversation-conv123/image.png",
        }),
        nonVisionModel,
        { excludeImages: false, useFileSystem: true }
      );
      const text = (result?.content[0] as { text: string }).text;
      expect(text).toContain(
        `<file name="file" path="conversation-conv123/image.png">`
      );
      expect(text).toContain(
        "Image content interpreted by a vision-enabled model"
      );
    });

    it("renders an image with vision model as image_url + <file> tag", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("image/png", {
          path: "conversation-conv123/image.png",
        }),
        visionModel,
        { excludeImages: false, useFileSystem: true }
      );
      expect(result?.content).toHaveLength(2);
      expect(result?.content[0]).toMatchObject({ type: "image_url" });
      expect(result?.content[1]).toMatchObject({
        type: "text",
        text: `<file name="file" path="conversation-conv123/image.png"/>`,
      });
    });
  });
});
