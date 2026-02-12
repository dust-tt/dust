import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalMCPServerNameFromSId } from "@app/lib/actions/mcp_internal_actions/constants";
import { InternalMCPServerCredentialModel } from "@app/lib/models/agent/actions/internal_mcp_server_credentials";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { makeScript } from "@app/scripts/helpers";
import { decrypt } from "@app/types/shared/utils/hashing";

// Servers being migrated from developerSecretSelection to requiresBearerToken.
const TARGET_SERVERS: InternalMCPServerNameType[] = [
  "ashby",
  "front",
  "salesloft",
  "statuspage",
  "openai_usage",
];

makeScript(
  {
    workspaceId: {
      type: "string",
      description:
        "Optional workspace sId to process (processes all if omitted)",
      required: false,
    },
  },
  async ({ workspaceId, execute }, logger) => {
    logger.info(
      {
        targetServers: TARGET_SERVERS,
        workspaceId: workspaceId || "all",
      },
      "Starting migration: developerSecretSelection -> requiresBearerToken"
    );

    // Find all AgentMCPServerConfigurations that have a secretName set
    // and whose internalMCPServerId matches one of the target servers.
    const whereClause: Record<string, unknown> = {};
    if (workspaceId) {
      const workspace = await WorkspaceModel.findOne({
        where: { sId: workspaceId },
      });
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      whereClause.workspaceId = workspace.id;
    }

    const configs = await AgentMCPServerConfigurationModel.findAll({
      where: whereClause,
    });

    // Group by (workspaceId, internalMCPServerId) -> secretName.
    // We expect one unique secret per workspace+server combo.
    const serverSecretMap = new Map<
      string,
      {
        workspaceId: number;
        internalMCPServerId: string;
        secretName: string;
        serverName: InternalMCPServerNameType;
        configIds: number[];
      }
    >();

    for (const config of configs) {
      if (!config.internalMCPServerId || !config.secretName) {
        continue;
      }

      const serverName = getInternalMCPServerNameFromSId(
        config.internalMCPServerId
      );
      if (!serverName || !TARGET_SERVERS.includes(serverName)) {
        continue;
      }

      const key = `${config.workspaceId}:${config.internalMCPServerId}`;
      const existing = serverSecretMap.get(key);
      if (existing) {
        if (existing.secretName !== config.secretName) {
          logger.warn(
            {
              workspaceId: config.workspaceId,
              internalMCPServerId: config.internalMCPServerId,
              existingSecretName: existing.secretName,
              newSecretName: config.secretName,
            },
            "Multiple different secretNames for same workspace+server - skipping"
          );
          continue;
        }
        existing.configIds.push(config.id);
      } else {
        serverSecretMap.set(key, {
          workspaceId: config.workspaceId,
          internalMCPServerId: config.internalMCPServerId,
          secretName: config.secretName,
          serverName,
          configIds: [config.id],
        });
      }
    }

    logger.info(
      { uniqueCombinations: serverSecretMap.size },
      "Found workspace+server combinations to migrate"
    );

    let migratedCount = 0;
    let skippedCount = 0;

    for (const entry of serverSecretMap.values()) {
      // Check if credential already exists.
      const existingCredential = await InternalMCPServerCredentialModel.findOne(
        {
          where: {
            workspaceId: entry.workspaceId,
            internalMCPServerId: entry.internalMCPServerId,
          },
        }
      );

      if (existingCredential?.sharedSecret) {
        logger.info(
          {
            workspaceId: entry.workspaceId,
            serverName: entry.serverName,
            internalMCPServerId: entry.internalMCPServerId,
          },
          "Credential already exists with sharedSecret - skipping"
        );
        skippedCount++;
        continue;
      }

      // Look up the workspace sId for decryption.
      const workspace = await WorkspaceModel.findByPk(entry.workspaceId);
      if (!workspace) {
        logger.warn(
          { workspaceId: entry.workspaceId },
          "Workspace not found - skipping"
        );
        skippedCount++;
        continue;
      }

      // Look up the DustAppSecret.
      const secret = await DustAppSecretModel.findOne({
        where: {
          name: entry.secretName,
          workspaceId: entry.workspaceId,
        },
      });

      if (!secret) {
        logger.warn(
          {
            workspaceId: entry.workspaceId,
            secretName: entry.secretName,
            serverName: entry.serverName,
          },
          "DustAppSecret not found - skipping"
        );
        skippedCount++;
        continue;
      }

      // Decrypt the secret value.
      const decryptedValue = decrypt(secret.hash, workspace.sId);

      if (!decryptedValue) {
        logger.warn(
          {
            workspaceId: entry.workspaceId,
            secretName: entry.secretName,
            serverName: entry.serverName,
          },
          "Failed to decrypt secret - skipping"
        );
        skippedCount++;
        continue;
      }

      if (execute) {
        // Create or update InternalMCPServerCredentialModel.
        if (existingCredential) {
          await existingCredential.update({
            sharedSecret: decryptedValue,
          });
        } else {
          await InternalMCPServerCredentialModel.create({
            workspaceId: entry.workspaceId,
            internalMCPServerId: entry.internalMCPServerId,
            sharedSecret: decryptedValue,
          });
        }

        // Clear secretName on all affected configurations.
        await AgentMCPServerConfigurationModel.update(
          { secretName: null },
          {
            where: {
              id: entry.configIds,
            },
          }
        );

        logger.info(
          {
            workspaceId: entry.workspaceId,
            workspaceSId: workspace.sId,
            serverName: entry.serverName,
            internalMCPServerId: entry.internalMCPServerId,
            secretName: entry.secretName,
            configCount: entry.configIds.length,
          },
          "Migrated secret to InternalMCPServerCredentialModel and cleared secretName"
        );
      } else {
        logger.info(
          {
            workspaceId: entry.workspaceId,
            workspaceSId: workspace.sId,
            serverName: entry.serverName,
            internalMCPServerId: entry.internalMCPServerId,
            secretName: entry.secretName,
            configCount: entry.configIds.length,
          },
          "Would migrate secret (dry-run)"
        );
      }

      migratedCount++;
    }

    logger.info(
      {
        migratedCount,
        skippedCount,
        execute,
      },
      execute
        ? "Migration completed successfully."
        : "Dry-run completed. Use --execute to apply changes."
    );
  }
);
