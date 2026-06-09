import { getWhitelistedProviders } from "@app/lib/api/assistant/models";
import { Authenticator } from "@app/lib/auth";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/resources/provider_credential_resource");

function mockCredentials(
  credentials: Array<{
    providerId: ModelProviderIdType;
    isHealthy: boolean;
  }>
) {
  const health = Object.fromEntries(
    credentials.map((c) => [c.providerId, c.isHealthy])
  ) as Partial<Record<ModelProviderIdType, boolean>>;

  vi.mocked(
    ProviderCredentialResource.fetchProvidersHealthByWorkspaceId
  ).mockResolvedValue(health);
}

describe("getWhitelistedProviders", () => {
  it("returns all providers including noop when whiteListedProviders is null", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(auth);
    expect(providers).toEqual(new Set(MODEL_PROVIDER_IDS));
  });

  it("returns only whitelisted providers plus noop", async () => {
    const workspace = await WorkspaceFactory.basic({
      whiteListedProviders: ["anthropic"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(auth);
    expect(providers).toEqual(new Set(["anthropic", "noop"]));
  });

  it("BYOK: only includes providers with configured keys plus noop", async () => {
    const workspace = await WorkspaceFactory.byok();
    mockCredentials([
      { providerId: "openai", isHealthy: true },
      { providerId: "anthropic", isHealthy: false },
    ]);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(auth);
    expect(providers).toEqual(new Set(["openai", "anthropic", "noop"]));
  });

  it("BYOK + restricted whitelist: healthy key for non-whitelisted provider is ignored", async () => {
    const workspace = await WorkspaceFactory.byok({
      whiteListedProviders: ["anthropic"],
    });
    mockCredentials([
      { providerId: "openai", isHealthy: true },
      { providerId: "anthropic", isHealthy: true },
    ]);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(auth);
    expect(providers).toEqual(new Set(["anthropic", "noop"]));
  });

  it("BYOK + no keys: only noop is whitelisted", async () => {
    const workspace = await WorkspaceFactory.byok();
    mockCredentials([]);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const providers = getWhitelistedProviders(auth);
    expect(providers).toEqual(new Set(["noop"]));
  });
});
