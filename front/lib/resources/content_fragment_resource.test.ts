import { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import { renderLightContentFragmentForModel } from "@app/lib/resources/content_fragment_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type {
  ContentNodeContentFragmentType,
  FileContentFragmentType,
  SupportedContentFragmentType,
} from "@app/types/content_fragment";
import { beforeEach, describe, expect, it } from "vitest";

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
    snippet = null,
  }: {
    generatedTables?: string[];
    snippet?: string | null;
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

const model = getSupportedModelConfigs().find((m) => m.supportsVision)!;

describe("renderLightContentFragmentForModel", () => {
  let authenticator: Authenticator;

  beforeEach(async () => {
    const { authenticator: auth } = await createResourceTest({});
    authenticator = auth;
  });

  describe("new_file_explorer FF off", () => {
    it("renders a regular file attachment", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("application/pdf"),
        model,
        { excludeImages: false }
      );
      expect(result).not.toBeNull();
    });

    it("renders a queryable file attachment (CSV)", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("text/csv", { generatedTables: ["table_1"], snippet: "" }),
        model,
        { excludeImages: false }
      );
      expect(result).not.toBeNull();
    });

    it("renders pasted content", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("text/vnd.dust.attachment.pasted"),
        model,
        { excludeImages: false }
      );
      expect(result).not.toBeNull();
    });

    it("renders an image", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("image/png"),
        model,
        { excludeImages: true }
      );
      expect(result).not.toBeNull();
    });

    it("renders a content node", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeContentNodeFragment(),
        model,
        { excludeImages: false }
      );
      expect(result).not.toBeNull();
    });
  });

  describe("new_file_explorer FF on", () => {
    beforeEach(async () => {
      await FeatureFlagFactory.basic(authenticator, "new_file_explorer");
    });

    it("skips a regular file attachment", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("application/pdf"),
        model,
        { excludeImages: false }
      );
      expect(result).toBeNull();
    });

    it("skips a plain text file attachment", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("text/plain"),
        model,
        { excludeImages: false }
      );
      expect(result).toBeNull();
    });

    it("still renders a queryable file attachment (CSV)", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("text/csv", { generatedTables: ["table_1"], snippet: "" }),
        model,
        { excludeImages: false }
      );
      expect(result).not.toBeNull();
    });

    it("still renders pasted content", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("text/vnd.dust.attachment.pasted"),
        model,
        { excludeImages: false }
      );
      expect(result).not.toBeNull();
    });

    it("still renders an image", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeFileFragment("image/png"),
        model,
        { excludeImages: true }
      );
      expect(result).not.toBeNull();
    });

    it("still renders a content node", async () => {
      const result = await renderLightContentFragmentForModel(
        authenticator,
        makeContentNodeFragment(),
        model,
        { excludeImages: false }
      );
      expect(result).not.toBeNull();
    });
  });
});
