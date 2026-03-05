import { describe, expect, it } from "vitest";

import type { WorkspaceType } from "../../user";
import { isProviderWhitelisted } from "./providers";

function makeWorkspace(
  whiteListedProviders: WorkspaceType["whiteListedProviders"]
): WorkspaceType {
  return {
    id: 1,
    sId: "test-workspace",
    name: "Test",
    role: "admin",
    segmentation: null,
    whiteListedProviders,
    defaultEmbeddingProvider: null,
    metadata: {},
    ssoEnforced: false,
  };
}

describe("isProviderWhitelisted", () => {
  it("treats noop as whitelisted even when workspace restricts providers", () => {
    const workspace = makeWorkspace(["anthropic", "openai"]);
    expect(isProviderWhitelisted(workspace, "noop")).toBe(true);
  });

  it("treats noop as whitelisted when workspace has no restrictions", () => {
    const workspace = makeWorkspace(null);
    expect(isProviderWhitelisted(workspace, "noop")).toBe(true);
  });

  it("allows a provider that is in the whitelist", () => {
    const workspace = makeWorkspace(["anthropic"]);
    expect(isProviderWhitelisted(workspace, "anthropic")).toBe(true);
  });

  it("rejects a provider that is not in the whitelist", () => {
    const workspace = makeWorkspace(["anthropic"]);
    expect(isProviderWhitelisted(workspace, "openai")).toBe(false);
  });
});
