import { getInternalMCPServerNameFromSId } from "@app/lib/actions/mcp_internal_actions/constants";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { InternalMCPServerCredentialModel } from "@app/lib/models/agent/actions/internal_mcp_server_credentials";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";
import { decrypt } from "@app/types/shared/utils/hashing";
import type { Attributes, ModelStatic } from "sequelize";
import { Op } from "sequelize";
import type { FindOptions } from "sequelize";

const TARGET_SERVER_NAMES = [
  "front",
  "ashby",
  "salesloft",
  "openai_usage",
  "statuspage",
] as const;

// Type helpers for cross-workspace queries on SoftDeletableWorkspaceAwareModel.
type SoftDeletableWithBypass<M extends MCPServerViewModel> = ModelStatic<M> & {
  findAll(
    options: FindOptions<Attributes<M>> & {
      includeDeleted?: boolean;
      dangerouslyBypassWorkspaceIsolationSecurity?: boolean;
    }
  ): Promise<M[]>;
};

const AgentMCPServerConfigWithBypass: ModelStaticWorkspaceAware<AgentMCPServerConfigurationModel> =
  AgentMCPServerConfigurationModel;

const MCPServerViewWithBypass: SoftDeletableWithBypass<MCPServerViewModel> =
  MCPServerViewModel;

makeScript({}, async ({ execute }, logger) => {
  // Start from agent configs that have a secretName set — only a few workspaces will have these.
  const agentConfigs = await AgentMCPServerConfigWithBypass.findAll({
    where: {
      secretName: { [Op.ne]: null },
    },
    // WORKSPACE_ISOLATION_BYPASS: Migration script needs to find all agent configs with secrets across workspaces.
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  if (agentConfigs.length === 0) {
    logger.info("No agent configs with secretName found, nothing to do.");
    return;
  }

  logger.info(
    { count: agentConfigs.length },
    "Found agent configs with secretName"
  );

  // Load all referenced MCP server views.
  const viewIds = [...new Set(agentConfigs.map((c) => c.mcpServerViewId))];
  const views = await MCPServerViewWithBypass.findAll({
    where: { id: { [Op.in]: viewIds } },
    // WORKSPACE_ISOLATION_BYPASS: Migration script needs to resolve views across workspaces.
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });
  const viewById = new Map(views.map((v) => [v.id, v]));

  // Filter to configs referencing target internal servers and group by (workspaceId, internalMCPServerId).
  const grouped = new Map<
    string,
    { workspaceId: number; internalMCPServerId: string; secretNames: string[] }
  >();

  for (const config of agentConfigs) {
    const view = viewById.get(config.mcpServerViewId);
    if (!view || view.serverType !== "internal" || !view.internalMCPServerId) {
      continue;
    }

    const serverName = getInternalMCPServerNameFromSId(
      view.internalMCPServerId
    );
    if (
      !serverName ||
      !TARGET_SERVER_NAMES.includes(
        serverName as (typeof TARGET_SERVER_NAMES)[number]
      )
    ) {
      continue;
    }

    const key = `${view.workspaceId}:${view.internalMCPServerId}`;
    const entry = grouped.get(key) ?? {
      workspaceId: view.workspaceId,
      internalMCPServerId: view.internalMCPServerId,
      secretNames: [],
    };
    entry.secretNames.push(config.secretName!);
    grouped.set(key, entry);
  }

  logger.info(
    { count: grouped.size },
    "Unique (workspace, server) pairs to process"
  );

  // Load all workspaces we need (for sId, used as decryption key).
  const workspaceIds = [
    ...new Set([...grouped.values()].map((e) => e.workspaceId)),
  ];
  const workspaces = await WorkspaceModel.findAll({
    where: { id: { [Op.in]: workspaceIds } },
  });
  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));

  let createdCount = 0;
  let skippedCount = 0;

  for (const [, { workspaceId, internalMCPServerId, secretNames }] of grouped) {
    const workspace = workspaceById.get(workspaceId);
    if (!workspace) {
      logger.warn({ workspaceId }, "Workspace not found, skipping");
      continue;
    }

    const serverName = getInternalMCPServerNameFromSId(internalMCPServerId);

    // Skip if credential already exists with a non-null sharedSecret.
    const existingCredential = await InternalMCPServerCredentialModel.findOne({
      where: {
        workspaceId,
        internalMCPServerId,
        sharedSecret: { [Op.ne]: null },
      },
    });

    if (existingCredential) {
      logger.info(
        { workspaceSId: workspace.sId, serverName },
        "Skipping: credential already exists"
      );
      skippedCount++;
      continue;
    }

    // Pick the most common secretName.
    const secretNameCounts = new Map<string, number>();
    for (const name of secretNames) {
      secretNameCounts.set(name, (secretNameCounts.get(name) ?? 0) + 1);
    }

    let mostCommonSecretName = "";
    let maxCount = 0;
    for (const [name, count] of secretNameCounts) {
      if (count > maxCount) {
        mostCommonSecretName = name;
        maxCount = count;
      }
    }

    // Look up the DustAppSecret.
    const dustAppSecret = await DustAppSecretModel.findOne({
      where: {
        name: mostCommonSecretName,
        workspaceId,
      },
    });

    if (!dustAppSecret) {
      logger.warn(
        {
          workspaceSId: workspace.sId,
          serverName,
          secretName: mostCommonSecretName,
        },
        "DustAppSecret not found, skipping"
      );
      continue;
    }

    // Decrypt the secret using workspace sId as key.
    const decryptedValue = decrypt(dustAppSecret.hash, workspace.sId);

    if (execute) {
      await InternalMCPServerCredentialModel.upsert({
        workspaceId,
        internalMCPServerId,
        sharedSecret: decryptedValue,
      });

      logger.info(
        {
          workspaceSId: workspace.sId,
          serverName,
          secretName: mostCommonSecretName,
          agentConfigCount: secretNames.length,
        },
        "Created shared secret credential"
      );
    } else {
      logger.info(
        {
          workspaceSId: workspace.sId,
          serverName,
          secretName: mostCommonSecretName,
          agentConfigCount: secretNames.length,
        },
        "[DRY RUN] Would create shared secret credential"
      );
    }

    createdCount++;
  }

  logger.info(
    { createdCount, skippedCount },
    execute ? "Backfill complete" : "[DRY RUN] Backfill complete"
  );
});
