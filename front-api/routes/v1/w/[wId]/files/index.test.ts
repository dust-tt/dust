import config from "@app/lib/api/config";
import { FileResource } from "@app/lib/resources/file_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.spyOn(config, "getApiBaseUrl").mockReturnValue("http://localhost:9999");

function postFile(
  workspace: { sId: string },
  key: { secret: string },
  body: Record<string, unknown>
) {
  return honoApp.request(`/api/v1/w/${workspace.sId}/files`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key.secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/w/[wId]/files", () => {
  it("creates file upload URL successfully", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
    });

    const response = await postFile(workspace, key, {
      contentType: "text/csv",
      fileName: "test.csv",
      fileSize: 1024,
      useCase: "conversation",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.file).toBeDefined();
    expect(data.file.uploadUrl).toBeDefined();
    expect(data.file.status).toBe("created");
    expect(data.file.contentType).toBe("text/csv");
    expect(data.file.fileName).toBe("test.csv");
    expect(data.file.uploadUrl).toContain("http://localhost:9999");
    expect(data.file.sId).toBeDefined();
  });

  it("refuses non public use-case without a system API key", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
    });

    const response = await postFile(workspace, key, {
      contentType: "text/csv",
      fileName: "test.csv",
      fileSize: 1024,
      useCase: "upsert_table",
    });

    expect(response.status).toBe(400);
  });

  it("refuses invalid use-cases", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
      systemKey: true,
    });

    const response = await postFile(workspace, key, {
      contentType: "text/csv",
      fileName: "test.csv",
      fileSize: 1024,
      useCase: "random",
    });

    expect(response.status).toBe(400);
  });

  it("accepts non public use-case with a system API key", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
      systemKey: true,
    });

    const response = await postFile(workspace, key, {
      contentType: "text/csv",
      fileName: "test.csv",
      fileSize: 1024,
      useCase: "upsert_table",
    });

    expect(response.status).toBe(200);
  });

  it("accepts and stamps raw sandbox CSV uploads when sandbox_tools is enabled", async () => {
    const { workspace, key, auth } = await createPublicApiMockRequest({
      method: "POST",
    });
    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    const response = await postFile(workspace, key, {
      contentType: "text/csv",
      fileName: "large.csv",
      fileSize: 60 * 1024 * 1024,
      useCase: "conversation",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    const file = await FileResource.fetchById(auth, data.file.sId);
    expect(file?.useCaseMetadata?.skipFileProcessing).toBe(true);
    expect(file?.useCaseMetadata?.skipDataSourceIndexing).toBe(true);
  });

  it("keeps the 50 MB CSV limit when sandbox_tools is not enabled", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      method: "POST",
    });

    const response = await postFile(workspace, key, {
      contentType: "text/csv",
      fileName: "large.csv",
      fileSize: 60 * 1024 * 1024,
      useCase: "conversation",
    });

    expect(response.status).toBe(400);
  });

  it("does not raise the CSV limit for upsert_table system-key uploads", async () => {
    const { workspace, key, auth } = await createPublicApiMockRequest({
      method: "POST",
      systemKey: true,
    });
    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    const response = await postFile(workspace, key, {
      contentType: "text/csv",
      fileName: "large.csv",
      fileSize: 60 * 1024 * 1024,
      useCase: "upsert_table",
    });

    expect(response.status).toBe(400);
  });
});
