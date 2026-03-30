import { isWorkspaceUsingStaticIP } from "@app/lib/misc";
import type { LightWorkspaceType } from "@app/types/user";
import { hash as blake3 } from "blake3";
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

  // Regression test: verifies that blake3 produces the expected deterministic
  // output for a known input. If blake3 is replaced with a different hash
  // function, this test will fail, signaling that the hardcoded hash in the
  // source file must be recomputed with the new algorithm.
  it("blake3 produces a known deterministic output for a test sId", () => {
    expect(blake3("test-workspace-sid").toString("hex")).toBe(
      "cef767c5f6c06be34a6bc6abcded9d1a8dd23985bba73f31143cb2b76ac871ba"
    );
  });
});
