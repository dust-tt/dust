import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDelete,
  mockGetBucketInstance,
  mockGetEgressPolicyBucket,
  mockUploadRawContentToBucket,
} = vi.hoisted(() => ({
  mockDelete: vi.fn(),
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
  deleteSandboxPolicy,
  EMPTY_EGRESS_POLICY,
  writeSandboxPolicy,
} from "./egress_policy";

describe("sandbox egress policy storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetEgressPolicyBucket.mockReturnValue("egress-policy-bucket");
    mockUploadRawContentToBucket.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
    mockGetBucketInstance.mockReturnValue({
      delete: mockDelete,
      uploadRawContentToBucket: mockUploadRawContentToBucket,
    });
  });

  it("writes sandbox policy files under the sandbox prefix", async () => {
    const result = await writeSandboxPolicy("provider-sandbox-id", {
      defaultAction: "deny",
      rules: [{ action: "allow", domain: "example.com" }],
    });

    expect(result).toEqual(new Ok(undefined));
    expect(mockGetBucketInstance).toHaveBeenCalledWith("egress-policy-bucket");
    expect(mockUploadRawContentToBucket).toHaveBeenCalledWith({
      content: JSON.stringify({
        defaultAction: "deny",
        rules: [{ action: "allow", domain: "example.com" }],
      }),
      contentType: "application/json",
      filePath: "sandboxes/provider-sandbox-id.json",
    });
  });

  it("deletes sandbox policy files and ignores missing objects", async () => {
    const result = await deleteSandboxPolicy("provider-sandbox-id");

    expect(result).toEqual(new Ok(undefined));
    expect(mockDelete).toHaveBeenCalledWith(
      "sandboxes/provider-sandbox-id.json",
      {
        ignoreNotFound: true,
      }
    );
  });

  it("exports the empty deny-all sandbox policy", () => {
    expect(EMPTY_EGRESS_POLICY).toEqual({
      defaultAction: "deny",
      rules: [],
    });
  });
});
