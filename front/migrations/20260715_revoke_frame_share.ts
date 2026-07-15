import { ShareableFileModel } from "@app/lib/resources/storage/models/files";
import { makeScript } from "@app/scripts/helpers";
import type { FileShareScope } from "@app/types/files";
import { fileShareScopeSchema } from "@app/types/files";

// Most restrictive scope by default: no workspace-wide access, no public
// link. Only explicitly-granted emails (sharing_grants) can view.
const DEFAULT_SCOPE: FileShareScope = "emails_only";

makeScript(
  {
    tokenId: {
      type: "string",
      demandOption: true,
      describe: "shareable_files.token (UUID) identifying the Frame share to update",
    },
    scope: {
      type: "string",
      default: DEFAULT_SCOPE,
      choices: fileShareScopeSchema.options,
      describe:
        "Target share scope for the Frame. Defaults to the most restrictive scope (emails_only).",
    },
  },
  async ({ tokenId, scope, execute }, logger) => {
    const targetScope = scope as FileShareScope;

    const share = await ShareableFileModel.findOne({
      where: { token: tokenId },
    });

    if (!share) {
      logger.error(`No shareable_files row found for token ${tokenId}`);
      return;
    }

    logger.info(
      {
        shareableFileId: share.id,
        fileId: share.fileId,
        workspaceId: share.workspaceId,
        currentScope: share.shareScope,
        targetScope,
      },
      "Found shareable file"
    );

    if (share.shareScope === targetScope) {
      logger.info(`Scope is already "${targetScope}", nothing to do.`);
      return;
    }

    if (!execute) {
      logger.info(
        `Dry run: would update scope "${share.shareScope}" -> "${targetScope}" for token ${tokenId}. ` +
          "Pass --execute to apply."
      );
      return;
    }

    await share.update({ shareScope: targetScope });

    logger.info(
      `Updated scope "${share.shareScope}" -> "${targetScope}" for token ${tokenId}`
    );
  }
);
