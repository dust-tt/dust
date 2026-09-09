import { Authenticator } from "@app/lib/auth";
import { GlobalAgentSettingsResource } from "@app/lib/resources/agent/global_agent_settings_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { describe, expect, it } from "vitest";

describe("GlobalAgentSettingsResource", () => {
  it("upserts one setting per workspace and exposes only plain settings", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const other = await createResourceTest({ role: "admin" });
    const agentId = GLOBAL_AGENTS_SID.DUST;
    expect(
      await GlobalAgentSettingsResource.fetchByAgentId(auth, agentId)
    ).toBeNull();
    await GlobalAgentSettingsResource.upsert(other.authenticator, {
      agentId,
      status: "disabled_by_admin",
    });
    await GlobalAgentSettingsResource.upsert(auth, {
      agentId,
      status: "active",
    });
    await GlobalAgentSettingsResource.upsert(auth, {
      agentId,
      status: "disabled_by_admin",
    });
    await GlobalAgentSettingsResource.upsert(auth, {
      agentId,
      status: "active",
    });
    expect(await GlobalAgentSettingsResource.listForWorkspace(auth)).toEqual([
      { agentId, status: "active" },
    ]);
    expect(
      await GlobalAgentSettingsResource.fetchByAgentId(auth, agentId)
    ).toEqual({
      agentId,
      status: "active",
    });
    expect(
      await GlobalAgentSettingsResource.listForWorkspace(other.authenticator)
    ).toEqual([{ agentId, status: "disabled_by_admin" }]);
  });

  it("rolls back updates, inserts and cleanup with the caller's transaction", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const agentId = GLOBAL_AGENTS_SID.DUST;
    const settings = { agentId, status: "active" } as const;
    await GlobalAgentSettingsResource.upsert(auth, settings);
    const rollback = new Error("Rollback global settings");
    await expect(
      withTransaction(
        async (transaction) => {
          await GlobalAgentSettingsResource.upsert(
            auth,
            {
              agentId,
              status: "disabled_by_admin",
            },
            { transaction }
          );
          expect(
            await GlobalAgentSettingsResource.fetchByAgentId(auth, agentId, {
              transaction,
            })
          ).toEqual({
            agentId,
            status: "disabled_by_admin",
          });
          await GlobalAgentSettingsResource.deleteAllForWorkspace(auth, {
            transaction,
          });
          expect(
            await GlobalAgentSettingsResource.listForWorkspace(auth, {
              transaction,
            })
          ).toEqual([]);
          await GlobalAgentSettingsResource.upsert(
            auth,
            {
              agentId: GLOBAL_AGENTS_SID.DEEP_DIVE,
              status: "disabled_by_admin",
            },
            { transaction }
          );
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);
    expect(await GlobalAgentSettingsResource.listForWorkspace(auth)).toEqual([
      settings,
    ]);
  });

  it("rejects non-admin writes and invalid global IDs without changing settings", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const settings = {
      agentId: GLOBAL_AGENTS_SID.DUST,
      status: "active",
    } as const;
    await GlobalAgentSettingsResource.upsert(auth, settings);
    await expect(
      GlobalAgentSettingsResource.upsert(userAuth, {
        ...settings,
        status: "disabled_by_admin",
      })
    ).rejects.toThrow("Only admins can update global agent settings.");
    await expect(
      GlobalAgentSettingsResource.deleteAllForWorkspace(userAuth)
    ).rejects.toThrow("Only admins can delete global agent settings.");
    await expect(
      GlobalAgentSettingsResource.upsert(auth, {
        agentId: "not-a-global-agent",
        status: "active",
      })
    ).rejects.toThrow("Global Agent not found: invalid agentId.");
    expect(
      await GlobalAgentSettingsResource.listForWorkspace(userAuth)
    ).toEqual([settings]);
  });
});
