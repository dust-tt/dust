import {
  getWhitelistedProviders,
  selectEnabledModel,
} from "@app/lib/api/assistant/models";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { Authenticator } from "@app/lib/auth";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import {
  CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("selectEnabledModel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // An enterprise (upgraded) workspace is what makes Claude Opus 4.8 otherwise
  // selectable, so the only remaining gate under test is regional availability.
  async function enterpriseRegionalOnlyAuth(): Promise<Authenticator> {
    const workspace = await WorkspaceFactory.enterprise({
      regionalModelsOnly: true,
    });

    return Authenticator.internalAdminForWorkspace(workspace.sId);
  }

  it("skips a candidate that is not available in the current region", async () => {
    vi.spyOn(regionConfig, "getCurrentRegion").mockReturnValue("europe-west1");
    const auth = await enterpriseRegionalOnlyAuth();

    // Claude Opus 4.8 is not available in europe-west1, so a regional-only EU
    // workspace must fall through to the next regionally-available candidate
    // instead of picking a model conversation.ts would later reject.
    const selected = selectEnabledModel(
      auth,
      [
        CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
        CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
      ],
      { featureFlags: [] }
    );

    expect(selected?.modelId).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId
    );

    expect(
      selectEnabledModel(auth, [CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG], {
        featureFlags: [],
      })
    ).toBeNull();
  });

  it("keeps the preferred candidate when it is available in the current region", async () => {
    vi.spyOn(regionConfig, "getCurrentRegion").mockReturnValue("us-central1");
    const auth = await enterpriseRegionalOnlyAuth();

    // The same workspace keeps Claude Opus 4.8 in us-central1, where it is
    // regionally available, so the regional gate does not over-block.
    const selected = selectEnabledModel(
      auth,
      [
        CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
        CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
      ],
      { featureFlags: [] }
    );

    expect(selected?.modelId).toBe(
      CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG.modelId
    );
  });
});
