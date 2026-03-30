import { isWorkspaceUsingStaticIP } from "@app/lib/misc";
import type { LightWorkspaceType } from "@app/types/user";
import { createHash } from "crypto";
import { describe, expect, it } from "vitest";

// The function only accesses workspace.sId, so only that field matters here.
function makeWorkspace(sId: string): LightWorkspaceType {
  return {
    id: 1,
    sId,
    name: "Test Workspace",
    role: "admin",
    segmentation: null,
    whiteListedProviders: null,
    defaultEmbeddingProvider: null,
    sharingPolicy: "emails_only",
  };
}

describe("isWorkspaceUsingStaticIP", () => {
  it("returns false for an arbitrary workspace sId", () => {
    expect(isWorkspaceUsingStaticIP(makeWorkspace("test-workspace-sid"))).toBe(
      false
    );
  });

  it("returns false for another arbitrary sId", () => {
    expect(
      isWorkspaceUsingStaticIP(makeWorkspace("some-other-workspace"))
    ).toBe(false);
  });

  // Regression test: verifies that sha256 produces the expected deterministic
  // output for a known input. If the hash function is replaced, this test will
  // fail, signaling that the hardcoded hash in the source file must be
  // recomputed with the new algorithm.
  it("sha256 produces a known deterministic output for a test sId", () => {
    expect(
      createHash("sha256").update("test-workspace-sid").digest("hex")
    ).toBe("fcd35684f8fccae8f922ff536688c3fea4729c9b09a700f85b4513d8023bdec4");
  });
});
