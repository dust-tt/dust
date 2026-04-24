import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDelete,
  mockFetchFileContent,
  mockGetBucketInstance,
  mockGetEgressPolicyBucket,
  mockUploadRawContentToBucket,
} = vi.hoisted(() => ({
  mockDelete: vi.fn(),
  mockFetchFileContent: vi.fn(),
  mockGetBucketInstance: vi.fn(),
  mockGetEgressPolicyBucket: vi.fn(),
  mockUploadRawContentToBucket: vi.fn(),
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getEgressPolicyBucket: mockGetEgressPolicyBucket,
  },
}));

vi.mock("@app/lib/file_storage", () => ({
  getBucketInstance: mockGetBucketInstance,
}));

import {
  deleteWorkspacePolicy,
  readWorkspacePolicy,
  writeWorkspacePolicy,
} from "./egress_policy";

describe("workspace egress policy storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetEgressPolicyBucket.mockReturnValue("egress-policy-bucket");
    mockFetchFileContent.mockResolvedValue(
      JSON.stringify({ allowedDomains: ["API.GitHub.COM"] })
    );
    mockUploadRawContentToBucket.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
    mockGetBucketInstance.mockReturnValue({
      delete: mockDelete,
      fetchFileContent: mockFetchFileContent,
      uploadRawContentToBucket: mockUploadRawContentToBucket,
    });
  });

  it("reads workspace policy files from the workspace prefix", async () => {
    const result = await readWorkspacePolicy("workspace-sid");

    expect(result).toEqual(
      new Ok({
        allowedDomains: ["api.github.com"],
      })
    );
    expect(mockGetBucketInstance).toHaveBeenCalledWith("egress-policy-bucket");
    expect(mockFetchFileContent).toHaveBeenCalledWith(
      "workspaces/workspace-sid.json"
    );
  });

  it("returns an empty policy when the workspace policy file is missing", async () => {
    mockFetchFileContent.mockRejectedValue({ code: 404 });

    const result = await readWorkspacePolicy("workspace-sid");

    expect(result).toEqual(new Ok({ allowedDomains: [] }));
  });

  it("writes normalized workspace policy files", async () => {
    const result = await writeWorkspacePolicy({
      workspaceId: "workspace-sid",
      policy: {
        allowedDomains: ["API.GitHub.COM", "*.GitHub.COM"],
      },
    });

    expect(result).toEqual(
      new Ok({
        allowedDomains: ["api.github.com", "*.github.com"],
      })
    );
    expect(mockUploadRawContentToBucket).toHaveBeenCalledWith({
      content: JSON.stringify({
        allowedDomains: ["api.github.com", "*.github.com"],
      }),
      contentType: "application/json",
      filePath: "workspaces/workspace-sid.json",
    });
  });

  it("does not write invalid domain entries", async () => {
    const result = await writeWorkspacePolicy({
      workspaceId: "workspace-sid",
      policy: {
        allowedDomains: ["127.0.0.1"],
      },
    });

    expect(result.isErr()).toBe(true);
    expect(mockUploadRawContentToBucket).not.toHaveBeenCalled();
  });

  it("deletes workspace policy files and ignores missing objects", async () => {
    const result = await deleteWorkspacePolicy("workspace-sid");

    expect(result).toEqual(new Ok(undefined));
    expect(mockDelete).toHaveBeenCalledWith("workspaces/workspace-sid.json", {
      ignoreNotFound: true,
    });
  });
});
