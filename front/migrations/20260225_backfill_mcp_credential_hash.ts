import { InternalMCPServerCredentialModel } from "@app/lib/models/agent/actions/internal_mcp_server_credentials";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";
import { encrypt } from "@app/types/shared/utils/encryption";

const InternalMCPServerCredentialModelWithBypass: ModelStaticWorkspaceAware<InternalMCPServerCredentialModel> =
  InternalMCPServerCredentialModel;

makeScript({}, async ({ execute }, logger) => {
  const credentials = await InternalMCPServerCredentialModelWithBypass.findAll({
    where: {
      hash: null,
    },
    include: [{ model: WorkspaceModel, required: true }],
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  if (credentials.length === 0) {
    return;
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

  logger.info("Backfill complete.");
});
