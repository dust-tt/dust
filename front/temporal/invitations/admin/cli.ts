import logger from "@app/logger/logger";
import { launchInvitationRemindersWorkflow } from "@app/temporal/invitations/client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import parseArgs from "minimist";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));
  const [command] = argv._;

  switch (command) {
    case "start": {
      const result = await launchInvitationRemindersWorkflow();
      if (result.isErr()) {
        throw result.error;
      }
      return;
    }
    default:
      logger.error({ command }, "[Invitation Reminders] Unknown command.");
      return;
  }
};

main()
  .then(() => {
    logger.info("[Invitation Reminders] Done.");
    process.exit(0);
  })
  .catch((err) => {
    logger.error(
      { err: normalizeError(err) },
      "[Invitation Reminders] CLI error."
    );
    process.exit(1);
  });
