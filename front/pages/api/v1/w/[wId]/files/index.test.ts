import { FileResource } from "@app/lib/resources/file_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
} from "@app/tests/utils/generic_public_api_tests";
import { describe, expect, it, vi } from "vitest";

import handler from "./index";

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);

vi.mock(import("@app/lib/api/config"), (() => ({
  default: {
    getApiBaseUrl: vi.fn().mockReturnValue("http://localhost:9999"),
  },
})) as any);

describe("POST /api/w/[wId]/files", () => {
  it("creates file upload URL successfully", async () => {
    const { req, res } = await createPublicApiMockRequest({
      method: "POST",
    });

    req.body = {
      contentType: "text/csv",
      fileName: "test.csv",
      fileSize: 1024,
      useCase: "conversation",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.file).toBeDefined();
    expect(data.file.uploadUrl).toBeDefined();
    expect(data.file.status).toBe("created");
    expect(data.file.contentType).toBe("text/csv");
    expect(data.file.fileName).toBe("test.csv");
    expect(data.file.uploadUrl).toContain("http://localhost:9999");
    expect(data.file.sId).toBeDefined();
  });

  it("refuses non public use-case without a system API key", async () => {
    const { req, res } = await createPublicApiMockRequest({
      method: "POST",
    });

    req.body = {
      contentType: "text/csv",
      fileName: "test.csv",
      fileSize: 1024,
      useCase: "upsert_table",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("refuses invalid use-cases", async () => {
    const { req, res } = await createPublicApiMockRequest({
      method: "POST",
      systemKey: true,
    });

    req.body = {
      contentType: "text/csv",
      fileName: "test.csv",
      fileSize: 1024,
      useCase: "random",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("accepts non public use-case with a system API key", async () => {
    const { req, res } = await createPublicApiMockRequest({
      method: "POST",
      systemKey: true,
    });

    req.body = {
      contentType: "text/csv",
      fileName: "test.csv",
      fileSize: 1024,
      useCase: "upsert_table",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("accepts and stamps raw sandbox CSV uploads when sandbox_tools is enabled", async () => {
    const { req, res, auth } = await createPublicApiMockRequest({
      method: "POST",
    });
    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    req.body = {
      contentType: "text/csv",
      fileName: "large.csv",
      fileSize: 60 * 1024 * 1024,
      useCase: "conversation",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    const file = await FileResource.fetchById(auth, data.file.sId);
    expect(file?.useCaseMetadata?.skipFileProcessing).toBe(true);
    expect(file?.useCaseMetadata?.skipDataSourceIndexing).toBe(true);
  });

  it("keeps the 50 MB CSV limit when sandbox_tools is not enabled", async () => {
    const { req, res } = await createPublicApiMockRequest({
      method: "POST",
    });

    req.body = {
      contentType: "text/csv",
      fileName: "large.csv",
      fileSize: 60 * 1024 * 1024,
      useCase: "conversation",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("does not raise the CSV limit for upsert_table system-key uploads", async () => {
    const { req, res, auth } = await createPublicApiMockRequest({
      method: "POST",
      systemKey: true,
    });
    await FeatureFlagFactory.basic(auth, "sandbox_tools");

    req.body = {
      contentType: "text/csv",
      fileName: "large.csv",
      fileSize: 60 * 1024 * 1024,
      useCase: "upsert_table",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });
});
