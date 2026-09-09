import type { Authenticator } from "@app/lib/auth";
import { GlobalAgentSettingsModel } from "@app/lib/models/agent/agent";
import type { GlobalAgentStatus } from "@app/types/assistant/agent";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import assert from "assert";
import type { Transaction } from "sequelize";

export type GlobalAgentSettings = {
  agentId: string;
  status: GlobalAgentStatus;
};

/**
 * @cc [owner:aubin-tchoi,label:backend;security] workspace-global-agent-settings
 * Global-agent settings are workspace-scoped, expose no model objects, and can only
 * be changed by admins. Writes participate in the supplied transaction.
 */
export class GlobalAgentSettingsResource {
  static async listForWorkspace(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<GlobalAgentSettings[]> {
    const settings = await GlobalAgentSettingsModel.findAll({
      attributes: ["agentId", "status"],
      where: { workspaceId: auth.getNonNullableWorkspace().id },
      transaction,
    });
    return settings.map(({ agentId, status }) => ({ agentId, status }));
  }

  static async fetchByAgentId(
    auth: Authenticator,
    agentId: string,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<GlobalAgentSettings | null> {
    const settings = await GlobalAgentSettingsModel.findOne({
      attributes: ["agentId", "status"],
      where: { workspaceId: auth.getNonNullableWorkspace().id, agentId },
      transaction,
    });
    return settings
      ? { agentId: settings.agentId, status: settings.status }
      : null;
  }

  static async upsert(
    auth: Authenticator,
    { agentId, status }: GlobalAgentSettings,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    assert(auth.isAdmin(), "Only admins can update global agent settings.");
    assert(
      isGlobalAgentId(agentId),
      "Global Agent not found: invalid agentId."
    );
    await GlobalAgentSettingsModel.upsert(
      { workspaceId: auth.getNonNullableWorkspace().id, agentId, status },
      { transaction }
    );
  }

  static async deleteAllForWorkspace(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    assert(auth.isAdmin(), "Only admins can delete global agent settings.");
    await GlobalAgentSettingsModel.destroy({
      where: { workspaceId: auth.getNonNullableWorkspace().id },
      transaction,
    });
  }
}
