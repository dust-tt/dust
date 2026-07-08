import { Authenticator } from "@app/lib/auth";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import logger from "@app/logger/logger";
import { retrieveGoogleTranscripts } from "@app/temporal/labs/transcripts/utils/google";
import parseArgs from "minimist";

// Previews what a config's next scheduled run would pick up: runs the same
// last-24h Drive query + history dedup and reports the file ids it would process
// (and therefore email once the config is active). It does not process, store,
// email, or record history. It does call getTranscriptsGoogleAuth, which disables
// a config whose token is revoked, so run it on valid-token configs.

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.wId) {
    throw new Error("Missing --wId argument (workspace sId)");
  }
  if (!args.cIds) {
    throw new Error("Missing --cIds argument (comma-separated config sIds)");
  }

  const cIds = String(args.cIds)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const adminAuth = await Authenticator.internalAdminForWorkspace(args.wId);

  let totalPending = 0;

  for (const cId of cIds) {
    const configuration = await LabsTranscriptsConfigurationResource.fetchById(
      adminAuth,
      cId
    );

    if (!configuration) {
      logger.warn({ cId }, "[transcripts:pending] configuration not found");
      continue;
    }

    const user = await configuration.getUser();
    const userEmail = user?.email ?? "unknown";

    if (!user) {
      logger.warn(
        { cId, userEmail },
        "[transcripts:pending] user not found; skipping"
      );
      continue;
    }

    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      args.wId
    );

    const res = await retrieveGoogleTranscripts(
      userAuth,
      configuration,
      logger
    );

    if (res.isErr()) {
      logger.error(
        { cId, userEmail, error: res.error.message },
        "[transcripts:pending] retrieval failed"
      );
      continue;
    }

    const pendingCount = res.value.length;
    totalPending += pendingCount;

    logger.info(
      {
        configId: configuration.sId,
        userEmail,
        status: configuration.status,
        pendingCount,
        pendingFileIds: res.value,
      },
      "[transcripts:pending] would-be-processed on next run"
    );
  }

  logger.info(
    { workspaceId: args.wId, configsChecked: cIds.length, totalPending },
    "[transcripts:pending] SUMMARY"
  );
}

void main().then(
  () => process.exit(0),
  (err) => {
    logger.error({ err }, "[transcripts:pending] failed");
    process.exit(1);
  }
);
