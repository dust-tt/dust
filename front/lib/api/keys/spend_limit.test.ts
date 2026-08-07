import { setApiKeySpendLimit } from "@app/lib/api/keys/spend_limit";
import { Authenticator } from "@app/lib/auth";
import * as apiKeyCapAlert from "@app/lib/metronome/alerts/api_key_caps";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/alerts/api_key_caps", async () => {
  const actual = await vi.importActual<typeof apiKeyCapAlert>(
    "@app/lib/metronome/alerts/api_key_caps"
  );
  return {
    ...actual,
    clearMetronomeApiKeyCapAlert: vi.fn(),
    upsertMetronomeApiKeyCapAlert: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(apiKeyCapAlert.clearMetronomeApiKeyCapAlert).mockResolvedValue(
    new Ok(undefined)
  );
  vi.mocked(apiKeyCapAlert.upsertMetronomeApiKeyCapAlert).mockResolvedValue(
    new Ok({ alertId: "alert_key_cap_xxx" })
  );
});

describe("setApiKeySpendLimit", () => {
  it("persists the cap and upserts the Metronome alert", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const { globalGroup } =
      await GroupResource.makeDefaultsForWorkspace(workspace);
    const key = await KeyFactory.regular(globalGroup);

    const result = await setApiKeySpendLimit(auth, {
      keyModelId: key.id,
      limit: { kind: "limited", awuCredits: 25_000 },
    });

    expect(result.isOk()).toBe(true);
    const reloaded = await KeyResource.fetchByWorkspaceAndId({
      workspace,
      id: key.id,
    });
    expect(reloaded?.monthlyCapAwuCredits).toBe(25_000);
  });

  it("reverts the DB cap when the Metronome cap alert upsert fails", async () => {
    vi.mocked(apiKeyCapAlert.upsertMetronomeApiKeyCapAlert).mockResolvedValue(
      new Err(new Error("Metronome unavailable"))
    );

    const workspace = await WorkspaceFactory.creditPriced();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const { globalGroup } =
      await GroupResource.makeDefaultsForWorkspace(workspace);
    const key = await KeyFactory.regular(globalGroup);
    await key.updateMonthlyCapAwuCredits(10_000);

    const result = await setApiKeySpendLimit(auth, {
      keyModelId: key.id,
      limit: { kind: "limited", awuCredits: 25_000 },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("metronome_error");
    }
    const reloaded = await KeyResource.fetchByWorkspaceAndId({
      workspace,
      id: key.id,
    });
    expect(reloaded?.monthlyCapAwuCredits).toBe(10_000);
  });

  it("reverts the DB cap when the Metronome cap alert clear fails", async () => {
    vi.mocked(apiKeyCapAlert.clearMetronomeApiKeyCapAlert).mockResolvedValue(
      new Err(new Error("Metronome unavailable"))
    );

    const workspace = await WorkspaceFactory.creditPriced();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const { globalGroup } =
      await GroupResource.makeDefaultsForWorkspace(workspace);
    const key = await KeyFactory.regular(globalGroup);
    await key.updateMonthlyCapAwuCredits(10_000);

    const result = await setApiKeySpendLimit(auth, {
      keyModelId: key.id,
      limit: { kind: "unlimited" },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("metronome_error");
    }
    const reloaded = await KeyResource.fetchByWorkspaceAndId({
      workspace,
      id: key.id,
    });
    expect(reloaded?.monthlyCapAwuCredits).toBe(10_000);
  });
});
