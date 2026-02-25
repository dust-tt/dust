import { InternalMCPServerCredentialModel } from "@app/lib/models/agent/actions/internal_mcp_server_credentials";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";
import { encrypt } from "@app/types/shared/utils/hashing";
import { Op } from "sequelize";

const BATCH_SIZE = 256;

const InternalMCPServerCredentialModelWithBypass: ModelStaticWorkspaceAware<InternalMCPServerCredentialModel> =
  InternalMCPServerCredentialModel;

makeScript({}, async ({ execute }, logger) => {
  let lastId = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const credentials =
      await InternalMCPServerCredentialModelWithBypass.findAll({
        where: {
          id: { [Op.gt]: lastId },
          sharedSecret: { [Op.not]: null },
          hash: null,
        },
        order: [["id", "ASC"]],
        limit: BATCH_SIZE,
        include: [{ model: WorkspaceModel, required: true }],
        // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
        // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
        dangerouslyBypassWorkspaceIsolationSecurity: true,
      });

    if (credentials.length === 0) {
      break;
    }

    logger.info(
      {
        count: credentials.length,
        firstId: credentials[0].id,
        lastId: credentials[credentials.length - 1].id,
      },
      "Processing batch"
    );

    if (execute) {
      for (const credential of credentials) {
        if (!credential.sharedSecret) {
          continue;
        }

        const hash = encrypt({
          text: credential.sharedSecret,
          key: credential.workspace.sId,
          useCase: "mcp_server_credentials",
        });

        await credential.update({ hash });
      }
    }

    lastId = credentials[credentials.length - 1].id;

    if (credentials.length < BATCH_SIZE) {
      break;
    }
  }

  logger.info("Backfill complete.");
});
